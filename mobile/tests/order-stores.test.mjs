import test from 'node:test';
import assert from 'node:assert/strict';
import { createCheckoutStore } from '../src/orders/checkout-store.ts';
import { createOrderDetailStore } from '../src/orders/order-detail-store.ts';
import { createOrdersListStore } from '../src/orders/orders-list-store.ts';
import { OrderServiceError } from '../src/services/order-service.ts';

const address = {
  recipientName: 'ผู้ซื้อ ทดสอบ', phone: '0812345678', addressLine: '99/1 ถนนทดสอบ',
  subdistrict: 'แขวงทดสอบ', district: 'เขตทดสอบ', province: 'กรุงเทพมหานคร', postalCode: '10110',
};

const quote = {
  product: { id: 12, name: 'เสื้อ', condition: 'ดี', size: 'M' },
  currency: 'THB', itemPrice: '1200.00', shippingFee: '50.00', inspectionFee: '100.00', totalAmount: '1350.00',
};

const order = (extra = {}) => ({
  id: 41,
  status: 'WAITING_PAYMENT',
  paymentStatus: 'UNPAID',
  viewerRole: 'buyer',
  product: quote.product,
  amounts: { currency: 'THB', itemPrice: '1200.00', shippingFee: '50.00', inspectionFee: '100.00',
    totalAmount: '1350.00', commissionFee: null, sellerPayout: null },
  shippingAddress: null,
  lastPaymentAttempt: null,
  paidAt: null,
  receiptNo: null,
  canPay: true,
  createdAt: null,
  ...extra,
});

const paid = () => order({ status: 'WAITING_SELLER_SHIP', paymentStatus: 'PAID', canPay: false, receiptNo: 'RC-000041' });

function keys() {
  let n = 0;
  return () => `key-${String(++n).padStart(8, '0')}`;
}

function tokens(extra = {}) {
  return {
    getAccessToken: extra.getAccessToken ?? (async () => 'token'),
    refreshAccessToken: extra.refreshAccessToken ?? (async () => 'fresh'),
  };
}

// ------------------------------------------------------------------ checkout (ORDER-04)

function checkoutSetup(service) {
  const calls = { create: [], quote: 0 };
  const store = createCheckoutStore({
    ...tokens(),
    newIdempotencyKey: keys(),
    service: {
      getQuote: async () => { calls.quote += 1; return service.getQuote ? service.getQuote() : quote; },
      createOrder: async (token, input) => {
        calls.create.push({ token, ...input });
        return service.createOrder(calls.create.length, input);
      },
    },
  });
  return { store, calls };
}

test('opening checkout loads the server quote and never creates an order by itself', async () => {
  const { store, calls } = checkoutSetup({ createOrder: () => order() });
  store.setOwner('user-a');
  await store.open(12);
  assert.equal(store.getSnapshot().quote.totalAmount, '1350.00');
  assert.equal(calls.create.length, 0);
  // เปิดหน้าใหม่อีกครั้ง (เช่นกด Back แล้วกลับมา) ก็ยังไม่สร้างเอง
  store.close();
  await store.open(12);
  assert.equal(calls.create.length, 0);
});

test('invalid address is rejected locally without calling the server', async () => {
  const { store, calls } = checkoutSetup({ createOrder: () => order() });
  store.setOwner('user-a');
  await store.open(12);
  await store.submit({ ...address, postalCode: '12' });
  assert.equal(calls.create.length, 0);
  assert.ok(store.getSnapshot().fieldErrors.postalCode);
});

test('double tap creates only one request and success exposes the order id', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { store, calls } = checkoutSetup({ createOrder: async () => { await gate; return order(); } });
  store.setOwner('user-a');
  await store.open(12);
  const first = store.submit(address);
  const second = store.submit(address);
  assert.equal(store.getSnapshot().submitting, true);
  release();
  await Promise.all([first, second]);
  assert.equal(calls.create.length, 1);
  assert.equal(store.getSnapshot().createdOrderId, 41);
  await store.submit(address);
  assert.equal(calls.create.length, 1, 'no second order after success');
});

test('timeout keeps the same key and payload for the retry and does not claim success', async () => {
  const { store, calls } = checkoutSetup({
    createOrder: attempt => {
      if (attempt === 1) throw new OrderServiceError('timeout');
      return order();
    },
  });
  store.setOwner('user-a');
  await store.open(12);
  await store.submit(address);
  let state = store.getSnapshot();
  assert.equal(state.uncertain, true);
  assert.equal(state.createdOrderId, null);

  // ผู้ใช้แก้ฟอร์มระหว่างนั้น ต้องยังส่งข้อมูลชุดเดิม
  await store.submit({ ...address, province: 'เชียงใหม่' });
  state = store.getSnapshot();
  assert.equal(calls.create.length, 2);
  assert.equal(calls.create[0].idempotencyKey, calls.create[1].idempotencyKey);
  assert.deepEqual(calls.create[1].address, calls.create[0].address);
  assert.equal(state.createdOrderId, 41);
  assert.equal(state.uncertain, false);
});

test('a fresh checkout uses a fresh idempotency key', async () => {
  const { store, calls } = checkoutSetup({ createOrder: () => { throw new OrderServiceError('conflict', { code: 'product_unavailable' }); } });
  store.setOwner('user-a');
  await store.open(12);
  await store.submit(address);
  store.close();
  await store.open(12);
  await store.submit(address);
  assert.notEqual(calls.create[0].idempotencyKey, calls.create[1].idempotencyKey);
});

test('product taken by someone else and already ordered by me', async () => {
  const { store } = checkoutSetup({
    createOrder: attempt => {
      if (attempt === 1) throw new OrderServiceError('conflict', { code: 'product_unavailable' });
      throw new OrderServiceError('conflict', { code: 'already_ordered', orderId: 7 });
    },
  });
  store.setOwner('user-a');
  await store.open(12);
  await store.submit(address);
  assert.equal(store.getSnapshot().submitCode, 'product_unavailable');
  assert.equal(store.getSnapshot().uncertain, false);
  await store.submit(address);
  assert.equal(store.getSnapshot().existingOrderId, 7);
});

test('quote reports already ordered with the existing order', async () => {
  const { store } = checkoutSetup({
    getQuote: () => { throw new OrderServiceError('conflict', { code: 'already_ordered', orderId: 9 }); },
    createOrder: () => order(),
  });
  store.setOwner('user-a');
  await store.open(12);
  assert.equal(store.getSnapshot().existingOrderId, 9);
});

test('session expiry refreshes the token once, then reports unauthorized', async () => {
  let refreshes = 0;
  const store = createCheckoutStore({
    getAccessToken: async () => 'old',
    refreshAccessToken: async () => { refreshes += 1; return null; },
    newIdempotencyKey: keys(),
    service: {
      getQuote: async () => quote,
      createOrder: async () => { throw new OrderServiceError('unauthorized'); },
    },
  });
  store.setOwner('user-a');
  await store.open(12);
  await store.submit(address);
  assert.equal(refreshes, 1);
  assert.equal(store.getSnapshot().submitError, 'unauthorized');
});

test('switching account clears checkout data and ignores late responses', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { store } = checkoutSetup({ createOrder: async () => { await gate; return order(); } });
  store.setOwner('user-a');
  await store.open(12);
  const pending = store.submit(address);
  store.setOwner('user-b');
  release();
  await pending;
  const state = store.getSnapshot();
  assert.equal(state.owner, 'user-b');
  assert.equal(state.quote, null);
  assert.equal(state.createdOrderId, null);
});

// ------------------------------------------------------------------ detail + pay (ORDER-04/05)

function detailSetup(handlers) {
  const calls = { get: 0, pay: [], receipt: 0 };
  const store = createOrderDetailStore({
    ...tokens(),
    newIdempotencyKey: keys(),
    service: {
      getOrder: async () => { calls.get += 1; return handlers.getOrder ? handlers.getOrder(calls.get) : order(); },
      simulatePayment: async (token, input) => {
        calls.pay.push(input);
        return handlers.pay(calls.pay.length, input);
      },
      getReceipt: async () => {
        calls.receipt += 1;
        return handlers.getReceipt();
      },
    },
  });
  return { store, calls };
}

const attempt = outcome => ({ id: 1, outcome, amount: '1350.00', createdAt: null });

test('failed payment keeps the order payable and the next attempt uses a new key', async () => {
  const { store, calls } = detailSetup({
    pay: (n, input) => input.outcome === 'FAILED'
      ? { attempt: attempt('FAILED'), order: order() }
      : { attempt: attempt('SUCCEEDED'), order: paid() },
  });
  store.setOwner('user-a');
  await store.open(41);
  await store.pay('FAILED');
  assert.equal(store.getSnapshot().lastResult, 'failed');
  assert.equal(store.getSnapshot().order.canPay, true);
  await store.pay('SUCCESS');
  assert.notEqual(calls.pay[0].idempotencyKey, calls.pay[1].idempotencyKey);
  const state = store.getSnapshot();
  assert.equal(state.lastResult, 'succeeded');
  assert.equal(state.order.status, 'WAITING_SELLER_SHIP');
  assert.equal(state.order.canPay, false);
});

test('pay button double tap sends one request; paid orders cannot be paid again', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { store, calls } = detailSetup({
    pay: async () => { await gate; return { attempt: attempt('SUCCEEDED'), order: paid() }; },
  });
  store.setOwner('user-a');
  await store.open(41);
  const first = store.pay('SUCCESS');
  const second = store.pay('SUCCESS');
  release();
  await Promise.all([first, second]);
  assert.equal(calls.pay.length, 1);
  await store.pay('SUCCESS');
  assert.equal(calls.pay.length, 1, 'canPay=false blocks another payment');
});

test('timeout checks the real status first and reports success only when the server says PAID', async () => {
  const { store, calls } = detailSetup({
    pay: () => { throw new OrderServiceError('timeout'); },
    getOrder: n => (n === 1 ? order() : paid()),
  });
  store.setOwner('user-a');
  await store.open(41);
  await store.pay('SUCCESS');
  const state = store.getSnapshot();
  assert.equal(calls.get, 2, 'status was re-checked after the timeout');
  assert.equal(state.lastResult, 'succeeded');
  assert.equal(state.uncertain, false);
  assert.equal(state.order.paymentStatus, 'PAID');
});

test('timeout with still-unpaid order stays uncertain and retries with the same key', async () => {
  const { store, calls } = detailSetup({
    pay: n => {
      if (n === 1) throw new OrderServiceError('timeout');
      return { attempt: attempt('SUCCEEDED'), order: paid() };
    },
  });
  store.setOwner('user-a');
  await store.open(41);
  await store.pay('SUCCESS');
  let state = store.getSnapshot();
  assert.equal(state.uncertain, true);
  assert.equal(state.lastResult, null, 'no guessed result');
  await store.retryUncertain();
  state = store.getSnapshot();
  assert.equal(calls.pay[0].idempotencyKey, calls.pay[1].idempotencyKey);
  assert.equal(state.lastResult, 'succeeded');
  assert.equal(state.uncertain, false);
});

test('already paid conflict refreshes the order instead of showing stale status', async () => {
  const { store, calls } = detailSetup({
    pay: () => { throw new OrderServiceError('conflict', { code: 'order_already_paid' }); },
    getOrder: n => (n === 1 ? order() : paid()),
  });
  store.setOwner('user-a');
  await store.open(41);
  await store.pay('SUCCESS');
  const state = store.getSnapshot();
  assert.equal(calls.get, 2);
  assert.equal(state.payCode, 'order_already_paid');
  assert.equal(state.order.paymentStatus, 'PAID');
  assert.equal(state.lastResult, null);
});

test('receipt loading and forbidden/not-found orders', async () => {
  const { store } = detailSetup({
    getOrder: () => paid(),
    pay: () => { throw new Error('unused'); },
    getReceipt: () => ({ receiptNo: 'RC-000041', orderId: 41 }),
  });
  store.setOwner('user-a');
  await store.open(41);
  await store.loadReceipt();
  assert.equal(store.getSnapshot().receipt.receiptNo, 'RC-000041');

  const missing = detailSetup({
    getOrder: () => { throw new OrderServiceError('not-found', { code: 'order_not_found' }); },
    pay: () => { throw new Error('unused'); },
  });
  missing.store.setOwner('user-a');
  await missing.store.open(999);
  assert.equal(missing.store.getSnapshot().loadError, 'not-found');
  assert.equal(missing.store.getSnapshot().order, null);
});

test('logout clears order, payment state and receipt', async () => {
  const { store } = detailSetup({
    getOrder: () => paid(),
    pay: () => { throw new Error('unused'); },
    getReceipt: () => ({ receiptNo: 'RC-000041', orderId: 41 }),
  });
  store.setOwner('user-a');
  await store.open(41);
  await store.loadReceipt();
  store.setOwner(null);
  const state = store.getSnapshot();
  assert.equal(state.order, null);
  assert.equal(state.receipt, null);
  assert.equal(state.orderId, null);
});

// ------------------------------------------------------------------ list (ORDER-05)

test('list paginates, dedupes and refreshes', async () => {
  const item = id => ({ ...order({ id }), totalAmount: '1350.00', sellerPayout: null, currency: 'THB' });
  const offsets = [];
  const store = createOrdersListStore({
    ...tokens(),
    pageSize: 2,
    service: {
      listOrders: async (token, page) => {
        offsets.push(page.offset);
        if (page.offset === 0) return { items: [item(5), item(4)], total: 3, limit: 2, offset: 0 };
        return { items: [item(4), item(3)], total: 3, limit: 2, offset: 2 };
      },
    },
  });
  store.setOwner('user-a');
  await store.load();
  assert.equal(store.hasMore(), true);
  await store.loadMore();
  assert.deepEqual(store.getSnapshot().items.map(i => i.id), [5, 4, 3]);
  assert.equal(store.hasMore(), false);
  await store.loadMore();
  assert.deepEqual(offsets, [0, 2]);
  await store.refresh();
  assert.deepEqual(store.getSnapshot().items.map(i => i.id), [5, 4]);
});

test('empty list, errors and account switch', async () => {
  let fail = true;
  let release;
  const store = createOrdersListStore({
    ...tokens(),
    service: {
      listOrders: async () => {
        if (fail) throw new OrderServiceError('network-error');
        await new Promise(resolve => { release = resolve; });
        return { items: [{ ...order(), totalAmount: '1350.00', sellerPayout: null, currency: 'THB' }], total: 1, limit: 20, offset: 0 };
      },
    },
  });
  store.setOwner('user-a');
  await store.load();
  assert.equal(store.getSnapshot().error, 'network-error');
  fail = false;
  const loading = store.refresh();
  await new Promise(resolve => setImmediate(resolve));
  store.setOwner('user-b');
  release();
  await loading;
  const state = store.getSnapshot();
  assert.equal(state.owner, 'user-b');
  assert.deepEqual(state.items, [], 'late response of user-a must not show for user-b');
});

// Review PR #69: มี Order ใหม่แทรกหัวรายการระหว่างเลื่อนโหลด ต้องไม่วนขอหน้าเดิม
test('pagination advances by server offset even when new orders are inserted meanwhile', async () => {
  const item = id => ({ ...order({ id }), totalAmount: '1350.00', sellerPayout: null, currency: 'THB' });
  let rows = [6, 5, 4, 3, 2, 1];
  const offsets = [];
  const store = createOrdersListStore({
    ...tokens(),
    pageSize: 2,
    service: {
      listOrders: async (token, page) => {
        offsets.push(page.offset);
        const result = { items: rows.slice(page.offset, page.offset + page.limit).map(item), total: rows.length, limit: page.limit, offset: page.offset };
        if (page.offset === 0) rows = [8, 7, ...rows]; // Order ใหม่ 2 รายการเข้ามาหลังโหลดหน้าแรก
        return result;
      },
    },
  });
  store.setOwner('user-a');
  await store.load();
  for (let i = 0; i < 20 && store.hasMore(); i += 1) await store.loadMore();

  assert.equal(store.hasMore(), false, 'must reach the end');
  assert.ok(offsets.length <= 6, `too many requests: ${offsets.join(',')}`);
  for (let i = 1; i < offsets.length; i += 1) assert.ok(offsets[i] > offsets[i - 1], `offset repeated: ${offsets.join(',')}`);
  const ids = store.getSnapshot().items.map(i => i.id);
  assert.equal(new Set(ids).size, ids.length, 'no duplicates shown');
  for (const id of [6, 5, 4, 3, 2, 1]) assert.ok(ids.includes(id), `missing ${id}`);
});

test('an empty page ends pagination even if total says there is more', async () => {
  const item = id => ({ ...order({ id }), totalAmount: '1350.00', sellerPayout: null, currency: 'THB' });
  let calls = 0;
  const store = createOrdersListStore({
    ...tokens(),
    pageSize: 2,
    service: {
      listOrders: async (token, page) => {
        calls += 1;
        return { items: page.offset === 0 ? [item(2), item(1)] : [], total: 5, limit: 2, offset: page.offset };
      },
    },
  });
  store.setOwner('user-a');
  await store.load();
  await store.loadMore();
  assert.equal(store.hasMore(), false);
  await store.loadMore();
  assert.equal(calls, 2);
});
