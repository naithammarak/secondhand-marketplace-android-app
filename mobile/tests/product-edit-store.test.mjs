import test from 'node:test';
import assert from 'node:assert/strict';
import { ProductServiceError } from '../src/services/product-service.ts';
import { createProductEditStore } from '../src/products/product-edit-store.ts';

const product = (id, extra = {}) => ({
  id,
  name: `สินค้า ${id}`,
  description: '',
  size: 'M',
  condition: 'ใหม่',
  price: '100',
  category: 'เสื้อผ้า',
  brand: '',
  images: [],
  saleType: 'FIXED_PRICE',
  status: 'AVAILABLE',
  ...extra,
});

const input = {
  name: 'สินค้าแก้ไข',
  description: '',
  size: 'M',
  condition: 'ใหม่',
  price: '200',
  category: 'เสื้อผ้า',
  brand: '',
  images: [],
};

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function setup(overrides = {}) {
  const calls = { getProductById: [], updateProduct: [], cancelProduct: [] };
  const service = {
    getProductById: async (id, token) => {
      calls.getProductById.push(token !== undefined ? { id, token } : id);
      return overrides.getProductById
        ? overrides.getProductById(calls.getProductById.length, id, token)
        : product(id);
    },
    updateProduct: async (id, values, token) => {
      calls.updateProduct.push(token !== undefined ? { id, values, token } : { id, values });
      return overrides.updateProduct
        ? overrides.updateProduct(calls.updateProduct.length, id, values, token)
        : product(id, values);
    },
    cancelProduct: async (id, token) => {
      calls.cancelProduct.push(token !== undefined ? { id, token } : id);
      return overrides.cancelProduct
        ? overrides.cancelProduct(calls.cancelProduct.length, id, token)
        : product(id, { status: 'CANCELLED' });
    },
  };
  const store = createProductEditStore(service);
  return { store, calls };
}

test('loads the product for the given id', async () => {
  const { store, calls } = setup();
  const opening = store.open('p1');
  assert.equal(store.getSnapshot().loading, true);
  await opening;
  const state = store.getSnapshot();
  assert.equal(state.loading, false);
  assert.equal(state.product.id, 'p1');
  assert.equal(state.notFound, false);
  assert.equal(state.loadError, false);
  assert.deepEqual(calls.getProductById, ['p1']);
});

test('an unknown id is reported as not found, not as a load error', async () => {
  const { store } = setup({ getProductById: () => null });
  await store.open('missing');
  const state = store.getSnapshot();
  assert.equal(state.notFound, true);
  assert.equal(state.loadError, false);
  assert.equal(state.product, null);
});

test('a failed load keeps loading closed and reports a retryable error', async () => {
  const { store, calls } = setup({
    getProductById: attempt => { if (attempt === 1) throw new Error('network down'); return product('p1'); },
  });
  await store.open('p1');
  const state = store.getSnapshot();
  assert.equal(state.loading, false);
  assert.equal(state.loadError, true);
  assert.equal(state.product, null);

  await store.retry();
  assert.equal(store.getSnapshot().loadError, false);
  assert.equal(store.getSnapshot().product.id, 'p1');
  assert.equal(calls.getProductById.length, 2);
});

test('retry does nothing without a prior open', async () => {
  const { store, calls } = setup();
  await store.retry();
  assert.equal(calls.getProductById.length, 0);
});

test('opening a new id discards a slow response from the previous id', async () => {
  const gate = deferred();
  const { store } = setup({
    getProductById: (attempt, id) => (id === 'p1' ? gate.promise : product(id)),
  });
  const firstOpen = store.open('p1');
  await store.open('p2');
  assert.equal(store.getSnapshot().product.id, 'p2');

  gate.resolve(product('p1'));
  await firstOpen;
  // ผลของ p1 ที่มาช้าต้องไม่ทับข้อมูลของ p2 ที่กำลังแสดงอยู่
  assert.equal(store.getSnapshot().product.id, 'p2');
});

test('opening a new id clears the previous product immediately, before the fetch resolves', async () => {
  const gate = deferred();
  const { store } = setup({ getProductById: (attempt, id) => (id === 'p2' ? gate.promise : product(id)) });
  await store.open('p1');
  assert.equal(store.getSnapshot().product.id, 'p1');

  const reopening = store.open('p2');
  assert.equal(store.getSnapshot().product, null);
  assert.equal(store.getSnapshot().loading, true);

  gate.resolve(product('p2'));
  await reopening;
  assert.equal(store.getSnapshot().product.id, 'p2');
});

test('submitting updates the product and reports success', async () => {
  const { store, calls } = setup();
  await store.open('p1');
  await store.submit(input);
  const state = store.getSnapshot();
  assert.equal(state.submitting, false);
  assert.equal(state.submitSuccess, true);
  assert.equal(state.submitError, false);
  assert.equal(state.product.name, 'สินค้าแก้ไข');
  assert.deepEqual(calls.updateProduct[0], { id: 'p1', values: input });
});

test('a second submit press while one is in flight does not send a second request', async () => {
  const gate = deferred();
  const { store, calls } = setup({ updateProduct: () => gate.promise });
  await store.open('p1');
  const first = store.submit(input);
  await store.submit(input);
  assert.equal(calls.updateProduct.length, 1);
  assert.equal(store.getSnapshot().submitting, true);
  gate.resolve(product('p1', input));
  await first;
  assert.equal(store.getSnapshot().submitting, false);
});

test('a failed submit keeps the form usable and reports the error', async () => {
  const { store, calls } = setup({ updateProduct: () => { throw new Error('save failed'); } });
  await store.open('p1');
  await store.submit(input);
  const state = store.getSnapshot();
  assert.equal(state.submitting, false);
  assert.equal(state.submitError, true);
  assert.equal(state.submitSuccess, false);

  await store.submit(input);
  assert.equal(calls.updateProduct.length, 2);
});

test('subscribers are notified as the state changes', async () => {
  const { store } = setup();
  let notifications = 0;
  const unsubscribe = store.subscribe(() => { notifications += 1; });
  await store.open('p1');
  assert.ok(notifications >= 2);
  unsubscribe();
  const seen = notifications;
  await store.submit(input);
  assert.equal(notifications, seen);
});

test('passes access token to getProductById on open and retry', async () => {
  const { store, calls } = setup();
  await store.open('p1', 'mock-token-123');
  assert.deepEqual(calls.getProductById[0], { id: 'p1', token: 'mock-token-123' });

  await store.retry('mock-token-456');
  // retry without error doesn't call service, let's test retry after failure
  const failSetup = setup({
    getProductById: attempt => {
      if (attempt === 1) throw new Error('fetch error');
      return product('p2');
    },
  });
  await failSetup.store.open('p2', 'tok-init');
  assert.equal(failSetup.store.getSnapshot().loadError, true);

  await failSetup.store.retry('tok-retry');
  assert.deepEqual(failSetup.calls.getProductById[1], { id: 'p2', token: 'tok-retry' });
  assert.equal(failSetup.store.getSnapshot().product.id, 'p2');
});

test('captures submitErrorMessage and submitFieldErrors on validation error', async () => {
  const errorWithFields = new Error('ข้อมูลสินค้าไม่ถูกต้อง');
  errorWithFields.fields = { name: 'ชื่อสั้นเกินไป', price: 'ราคาต้องมากกว่า 0' };

  const { store } = setup({
    updateProduct: () => { throw errorWithFields; },
  });

  await store.open('p1');
  await store.submit(input);

  const state = store.getSnapshot();
  assert.equal(state.submitting, false);
  assert.equal(state.submitError, true);
  assert.equal(state.submitErrorMessage, 'ข้อมูลสินค้าไม่ถูกต้อง');
  assert.deepEqual(state.submitFieldErrors, { name: 'ชื่อสั้นเกินไป', price: 'ราคาต้องมากกว่า 0' });
});

test('cancels product with access token and reports success or error', async () => {
  const { store, calls } = setup();
  await store.open('p1');

  // Successful cancellation
  await store.cancel('seller-token-xyz');
  assert.deepEqual(calls.cancelProduct[0], { id: 'p1', token: 'seller-token-xyz' });
  assert.equal(store.getSnapshot().cancelSuccess, true);
  assert.equal(store.getSnapshot().cancelError, false);
  assert.equal(store.getSnapshot().product.status, 'CANCELLED');

  // Failed cancellation
  const errorSetup = setup({
    cancelProduct: () => { throw new Error('cancel failed'); },
  });
  await errorSetup.store.open('p2');
  await errorSetup.store.cancel('token-abc');
  assert.equal(errorSetup.store.getSnapshot().cancelSuccess, false);
  assert.equal(errorSetup.store.getSnapshot().cancelError, true);
});

test('update timeout refetches owner detail before allowing another submit', async () => {
  let reads = 0;
  const service = {
    getProductById: async () => { reads++; return product('p1', { description: reads > 1 ? 'ล่าสุด' : 'เดิม' }); },
    updateProduct: async () => { throw new ProductServiceError('timeout', 'หมดเวลา'); },
  };
  const store = createProductEditStore(service);
  await store.open('p1');
  await store.submit(product('p1'));
  assert.equal(reads, 2);
  assert.equal(store.getSnapshot().product.description, 'ล่าสุด');
  assert.equal(store.getSnapshot().verifying, false);
  assert.equal(store.getSnapshot().submitError, true);
});

test('cancel timeout refetches changed status and blocks another cancel', async () => {
  let reads = 0;
  let writes = 0;
  const service = {
    getProductById: async () => product('p1', { status: ++reads > 1 ? 'CANCELLED' : 'AVAILABLE' }),
    updateProduct: async () => product('p1'),
    cancelProduct: async () => { writes++; throw new ProductServiceError('timeout', 'หมดเวลา'); },
  };
  const store = createProductEditStore(service);
  await store.open('p1');
  await store.cancel();
  assert.equal(reads, 2);
  assert.equal(store.getSnapshot().product.status, 'CANCELLED');
  await store.cancel();
  assert.equal(writes, 1);
});
