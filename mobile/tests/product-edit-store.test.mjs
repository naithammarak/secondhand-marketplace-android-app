import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductEditStore } from '../src/products/product-edit-store.ts';

const product = (id, extra = {}) => ({
  id,
  name: `สินค้า ${id}`,
  description: '',
  size: 'M',
  condition: 'ใหม่',
  price: 100,
  category: 'เสื้อผ้า',
  brand: '',
  images: [],
  saleType: 'FIXED_PRICE',
  ...extra,
});

const input = {
  name: 'สินค้าแก้ไข',
  description: '',
  size: 'M',
  condition: 'ใหม่',
  price: 200,
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
  const calls = { getProductById: [], updateProduct: [] };
  const service = {
    getProductById: async id => {
      calls.getProductById.push(id);
      return overrides.getProductById
        ? overrides.getProductById(calls.getProductById.length, id)
        : product(id);
    },
    updateProduct: async (id, values) => {
      calls.updateProduct.push({ id, values });
      return overrides.updateProduct
        ? overrides.updateProduct(calls.updateProduct.length, id, values)
        : product(id, values);
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
