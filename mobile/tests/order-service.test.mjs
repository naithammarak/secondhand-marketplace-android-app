import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderService, OrderServiceError } from '../src/services/order-service.ts';
import { deadlineAt, formatBaht, formatRemaining, orderStatusLabel, orderStatusLabels } from '../src/orders/order-format.ts';
import { validateAddress, normalizeAddress } from '../src/orders/checkout-form.ts';
import { parseRouteId } from '../src/orders/route-params.ts';

const detail = (extra = {}) => ({
  id: 41,
  status: 'WAITING_PAYMENT',
  payment_status: 'UNPAID',
  viewer_role: 'buyer',
  product: { id: 12, name: 'เสื้อ', condition: 'ดี', size: 'M' },
  amounts: {
    currency: 'THB', item_price: '1200.00', shipping_fee: '50.00', inspection_fee: '100.00',
    total_amount: '1350.00', commission_fee: null, seller_payout: null,
  },
  shipping_address: {
    recipient_name: 'ผู้ซื้อ ทดสอบ', phone: '0812345678', address_line: '99/1 ถนนทดสอบ',
    subdistrict: 'แขวง', district: 'เขต', province: 'กรุงเทพ', postal_code: '10110',
  },
  last_payment_attempt: null,
  paid_at: null,
  receipt_no: null,
  can_pay: true,
  can_cancel: true,
  expires_at: '2026-09-18T10:30:00Z',
  cancelled_at: null,
  cancel_reason: null,
  created_at: '2026-09-18T10:00:00Z',
  updated_at: '2026-09-18T10:00:00Z',
  ...extra,
});

const address = {
  recipientName: 'ผู้ซื้อ ทดสอบ', phone: '081-234-5678', addressLine: '99/1 ถนนทดสอบ',
  subdistrict: 'แขวงทดสอบ', district: 'เขตทดสอบ', province: 'กรุงเทพมหานคร', postalCode: '10110',
};

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function recorder(respond) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return respond(url, init, calls.length);
  };
  return { calls, fetch };
}

test('create sends only product and address with the idempotency key', async () => {
  const { calls, fetch } = recorder(() => json(201, detail()));
  const service = createOrderService({ baseUrl: 'https://api.test/ignored/path', fetch });
  const order = await service.createOrder('tok', { productId: 12, address, idempotencyKey: 'key-12345678' });

  assert.equal(calls[0].url, 'https://api.test/orders');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['Idempotency-Key'], 'key-12345678');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok');
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(Object.keys(body).sort(), ['product_id', 'shipping_address']);
  assert.equal(body.shipping_address.postal_code, '10110');
  assert.equal(order.amounts.totalAmount, '1350.00');
  assert.equal(order.canPay, true);
});

test('money must be decimal strings from the server', async () => {
  const { fetch } = recorder(() => json(200, detail({
    amounts: { ...detail().amounts, total_amount: 1350 },
  })));
  const service = createOrderService({ baseUrl: 'https://api.test', fetch });
  await assert.rejects(service.getOrder('tok', 41), error => error.kind === 'server-error');
});

test('conflict carries backend code and existing order id', async () => {
  const { fetch } = recorder(() => json(409, {
    detail: { code: 'already_ordered', message: 'x', order_id: 7 },
  }));
  const service = createOrderService({ baseUrl: 'https://api.test', fetch });
  await assert.rejects(
    service.createOrder('tok', { productId: 1, address, idempotencyKey: 'key-12345678' }),
    error => error instanceof OrderServiceError && error.kind === 'conflict'
      && error.code === 'already_ordered' && error.orderId === 7,
  );
});

test('validation errors are mapped to form field names', async () => {
  const { fetch } = recorder(() => json(422, {
    detail: { code: 'validation_error', fields: { postal_code: 'รหัสไปรษณีย์ผิด', phone: 'เบอร์ผิด' } },
  }));
  const service = createOrderService({ baseUrl: 'https://api.test', fetch });
  await assert.rejects(
    service.createOrder('tok', { productId: 1, address, idempotencyKey: 'key-12345678' }),
    error => error.kind === 'validation-error'
      && error.fields.postalCode === 'รหัสไปรษณีย์ผิด' && error.fields.phone === 'เบอร์ผิด',
  );
});

test('status codes map to error kinds', async () => {
  const cases = [
    [401, {}, 'unauthorized'],
    [403, { detail: { code: 'not_order_buyer' } }, 'forbidden'],
    [403, { detail: { code: 'payment_simulation_disabled' } }, 'unavailable'],
    [404, { detail: { code: 'order_not_found' } }, 'not-found'],
    [500, {}, 'server-error'],
  ];
  for (const [status, body, kind] of cases) {
    const service = createOrderService({ baseUrl: 'https://api.test', fetch: async () => json(status, body) });
    await assert.rejects(service.getOrder('tok', 1), error => error.kind === kind, `${status}`);
  }
});

test('a slow server is reported as timeout, not as failure or success', async () => {
  const fetch = (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('aborted')));
  });
  const service = createOrderService({ baseUrl: 'https://api.test', fetch, timeoutMs: 20 });
  await assert.rejects(
    service.simulatePayment('tok', { orderId: 1, outcome: 'SUCCESS', idempotencyKey: 'key-12345678' }),
    error => error.kind === 'timeout',
  );
});

test('network failure and missing API configuration', async () => {
  const offline = createOrderService({ baseUrl: 'https://api.test', fetch: async () => { throw new Error('x'); } });
  await assert.rejects(offline.listOrders('tok', { limit: 20, offset: 0 }), error => error.kind === 'network-error');
  const missing = createOrderService({});
  await assert.rejects(missing.listOrders('tok', { limit: 20, offset: 0 }), error => error.kind === 'unavailable');
  assert.throws(() => createOrderService({ baseUrl: 'ftp://api.test' }));
});

test('payment result and list parsing', async () => {
  const { calls, fetch } = recorder(url => {
    if (url.includes('/payments/simulate')) {
      return json(200, {
        attempt: { id: 3, outcome: 'FAILED', amount: '1350.00', created_at: null },
        order: detail(),
      });
    }
    return json(200, {
      items: [{
        id: 41, status: 'WAITING_PAYMENT', payment_status: 'UNPAID', viewer_role: 'seller',
        product: { id: 12, name: 'เสื้อ', condition: 'ดี', size: 'M' },
        total_amount: null, seller_payout: '1140.00', currency: 'THB', created_at: null, paid_at: null,
      }],
      total: 1, limit: 20, offset: 0,
    });
  });
  const service = createOrderService({ baseUrl: 'https://api.test', fetch });
  const result = await service.simulatePayment('tok', { orderId: 41, outcome: 'FAILED', idempotencyKey: 'k-12345678' });
  assert.equal(result.attempt.outcome, 'FAILED');
  assert.deepEqual(JSON.parse(calls[0].init.body), { outcome: 'FAILED' });
  const page = await service.listOrders('tok', { limit: 20, offset: 40 });
  assert.equal(calls[1].url, 'https://api.test/orders?limit=20&offset=40');
  assert.equal(page.items[0].sellerPayout, '1140.00');
  assert.equal(page.items[0].totalAmount, null);
});

test('formatBaht formats server strings without floating point', () => {
  assert.equal(formatBaht('1350.00'), '฿1,350.00');
  assert.equal(formatBaht('1234567.05'), '฿1,234,567.05');
  assert.equal(formatBaht('0.10'), '฿0.10');
  assert.equal(formatBaht(null), '-');
  assert.equal(formatBaht('abc'), '-');
});

test('address validation mirrors the backend rules', () => {
  assert.deepEqual(validateAddress(address), {});
  assert.equal(normalizeAddress(address).phone, '0812345678');
  const errors = validateAddress({ ...address, recipientName: ' ', phone: '12345', postalCode: '1011' });
  assert.deepEqual(Object.keys(errors).sort(), ['phone', 'postalCode', 'recipientName']);
});

test('route ids accept only positive integers', () => {
  assert.equal(parseRouteId('12'), 12);
  assert.equal(parseRouteId(['7']), 7);
  for (const bad of [undefined, '', '0', '-1', '1.5', 'abc', '99999999999', '2147483648']) {
    assert.equal(parseRouteId(bad), null, String(bad));
  }
});

// Review PR #69: body ที่ค้างหลังได้ headers ต้องเข้าเงื่อนไข timeout ไม่ใช่รอไม่สิ้นสุด
function stalledBody(status = 200) {
  return { ok: status >= 200 && status < 300, status, json: () => new Promise(() => {}) };
}

test('a response body that stalls after headers is reported as timeout', async () => {
  const service = createOrderService({ baseUrl: 'https://api.test', fetch: async () => stalledBody(), timeoutMs: 30 });
  const outcome = await Promise.race([
    service.simulatePayment('tok', { orderId: 1, outcome: 'SUCCESS', idempotencyKey: 'key-12345678' })
      .then(() => 'resolved', error => error.kind),
    new Promise(resolve => setTimeout(() => resolve('hung'), 1000)),
  ]);
  assert.equal(outcome, 'timeout');
});

test('caller abort while reading the body rejects without waiting for the timeout', async () => {
  const service = createOrderService({ baseUrl: 'https://api.test', fetch: async () => stalledBody(), timeoutMs: 60000 });
  const controller = new AbortController();
  const pending = service.getOrder('tok', 1, controller.signal);
  setTimeout(() => controller.abort(), 10);
  const outcome = await Promise.race([
    pending.then(() => 'resolved', error => (error instanceof OrderServiceError ? error.kind : 'aborted')),
    new Promise(resolve => setTimeout(() => resolve('hung'), 1000)),
  ]);
  assert.equal(outcome, 'aborted');
});


// ------------------------------------------------------------------ ยกเลิก/หมดเวลา (ORDER-08)

test('cancel posts to the order without an idempotency key and returns the new status', async () => {
  const cancelled = detail({
    status: 'CANCELLED',
    can_pay: false,
    can_cancel: false,
    cancelled_at: '2026-09-18T10:05:00Z',
    cancel_reason: 'BUYER',
  });
  const { calls, fetch } = recorder(() => json(200, cancelled));
  const service = createOrderService({ baseUrl: 'https://api.test', fetch });
  const order = await service.cancelOrder('tok', 41);

  assert.equal(calls[0].url, 'https://api.test/orders/41/cancel');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok');
  assert.equal(calls[0].init.headers['Idempotency-Key'], undefined);
  assert.equal(order.status, 'CANCELLED');
  assert.equal(order.cancelReason, 'BUYER');
  assert.equal(order.canCancel, false);
  assert.equal(order.canPay, false);
  assert.equal(order.cancelledAt, '2026-09-18T10:05:00Z');
});

test('the payment deadline and cancel permission are read from the server only', async () => {
  const { fetch } = recorder(() => json(200, detail()));
  const service = createOrderService({ baseUrl: 'https://api.test', fetch });
  const order = await service.getOrder('tok', 41);
  assert.equal(order.expiresAt, '2026-09-18T10:30:00Z');
  assert.equal(order.canCancel, true);
  assert.equal(order.cancelReason, null);
});

test('an unknown cancel reason is treated as a malformed response', async () => {
  const { fetch } = recorder(() => json(200, detail({ cancel_reason: 'SOMETHING_ELSE' })));
  const service = createOrderService({ baseUrl: 'https://api.test', fetch });
  await assert.rejects(() => service.getOrder('tok', 41), error => error instanceof OrderServiceError);
});

test('an expired order answers with a conflict carrying its code', async () => {
  const { fetch } = recorder(() => json(409, { detail: { code: 'order_expired', message: 'หมดเวลา' } }));
  const service = createOrderService({ baseUrl: 'https://api.test', fetch });
  await assert.rejects(
    () => service.simulatePayment('tok', { orderId: 41, outcome: 'SUCCESS', idempotencyKey: 'key-12345678' }),
    error => error.kind === 'conflict' && error.code === 'order_expired',
  );
});

test('remaining time counts down and never goes negative', () => {
  const deadline = '2026-09-18T10:30:00Z';
  const at = iso => new Date(iso).getTime();
  assert.equal(formatRemaining(deadline, at('2026-09-18T10:00:00Z')), '30:00');
  assert.equal(formatRemaining(deadline, at('2026-09-18T10:28:35Z')), '1:25');
  assert.equal(formatRemaining(deadline, at('2026-09-18T10:29:59Z')), '0:01');
  // ถึงเวลาแล้วและเลยเวลาแล้วต้องไม่แสดงตัวเลข หน้าจอจะได้ไปถามสถานะจริงแทน
  assert.equal(formatRemaining(deadline, at('2026-09-18T10:30:00Z')), null);
  assert.equal(formatRemaining(deadline, at('2026-09-18T11:00:00Z')), null);
  assert.equal(formatRemaining(null, at('2026-09-18T10:00:00Z')), null);
  assert.equal(formatRemaining('not-a-date', at('2026-09-18T10:00:00Z')), null);
});


// ---------------------------------------------------------------- สถานะที่แอปยังไม่รู้จัก

test('สถานะใหม่จาก backend ไม่ทำให้หน้าคำสั่งซื้อพัง แต่กลายเป็น UNKNOWN', async () => {
  const service = createOrderService({
    baseUrl: 'https://api.test',
    fetch: async () => json(200, detail({ status: 'SHIPPING_TO_INSPECTION', payment_status: 'PAID', paid_at: '2026-09-18T10:20:00Z' })),
  });

  const order = await service.getOrder('tok', 41);
  assert.equal(order.status, 'UNKNOWN');
  // ส่วนอื่นของคำสั่งซื้อต้องยังอ่านได้ตามปกติ
  assert.equal(order.paymentStatus, 'PAID');
  assert.equal(order.amounts.totalAmount, '1350.00');
});

test('สถานะใหม่ในรายการคำสั่งซื้อก็กลายเป็น UNKNOWN เหมือนกัน', async () => {
  const item = {
    id: 41, status: 'FUTURE_ORDER_STATE', payment_status: 'PAID', viewer_role: 'buyer',
    product: { id: 12, name: 'เสื้อ', condition: 'ดี', size: 'M' },
    total_amount: '1350.00', seller_payout: null, currency: 'THB',
    expires_at: null, cancel_reason: null, created_at: '2026-09-18T10:00:00Z', paid_at: '2026-09-18T10:20:00Z',
  };
  const service = createOrderService({
    baseUrl: 'https://api.test',
    fetch: async () => json(200, { items: [item], total: 1, limit: 20, offset: 0 }),
  });

  const page = await service.listOrders('tok', {});
  assert.equal(page.items[0].status, 'UNKNOWN');
});

test('สถานะที่ไม่ใช่ข้อความยังถือว่า backend ตอบผิดรูปแบบ', async () => {
  const service = createOrderService({
    baseUrl: 'https://api.test',
    fetch: async () => json(200, detail({ status: 42 })),
  });
  await assert.rejects(service.getOrder('tok', 41), error => error instanceof OrderServiceError && error.kind === 'server-error');
});

test('ข้อความสถานะกลางถูกใช้แทนค่าว่างเสมอ', () => {
  assert.equal(orderStatusLabel('WAITING_PAYMENT'), 'รอชำระเงิน');
  assert.equal(orderStatusLabel('UNKNOWN'), orderStatusLabels.UNKNOWN);
  for (const value of ['UNKNOWN_FUTURE_STATUS', '', null, undefined]) {
    assert.equal(orderStatusLabel(value), orderStatusLabels.UNKNOWN, `value=${value}`);
  }
  assert.notEqual(orderStatusLabels.UNKNOWN.trim(), '');
});


test('เศษวินาทีสุดท้ายยังต้องนับว่ายังไม่หมดเวลา', () => {
  // ก่อนแก้: formatRemaining คืน null ใน 999 มิลลิวินาทีสุดท้าย แล้วหน้าจอเข้าใจว่าหมดเวลาไปแล้ว
  const deadline = '2026-09-18T10:30:00Z';
  const at = Date.parse(deadline);
  assert.equal(formatRemaining(deadline, at - 500), '0:01');
  assert.equal(formatRemaining(deadline, at - 1), '0:01');
  assert.equal(formatRemaining(deadline, at), null);
  assert.equal(formatRemaining(deadline, at + 500), null);
});

test('deadlineAt ให้เวลาดิบไว้ให้หน้าจอตัดสินเอง', () => {
  assert.equal(deadlineAt('2026-09-18T10:30:00Z'), Date.parse('2026-09-18T10:30:00Z'));
  assert.equal(deadlineAt(null), null);
  assert.equal(deadlineAt(undefined), null);
  assert.equal(deadlineAt('not-a-date'), null);
});


test('all PR108 inspection states survive detail decoding', async () => {
  for (const status of ['SHIPPING_TO_CENTER','RECEIVED_AT_CENTER','INSPECTING','RESULT_NOTIFIED']) {
    const service = createOrderService({ baseUrl: 'https://api.test', fetch: async () => json(200, detail({ status })) });
    assert.equal((await service.getOrder('tok',41)).status, status);
  }
});
