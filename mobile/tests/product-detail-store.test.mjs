import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductDetailStore } from '../src/products/product-detail-store.ts';

function product(id, extra = {}) {
  return {
    id, productName: `สินค้า ${id}`, description: 'รายละเอียด', price: '100.00',
    categoryId: 1, category: { id: 1, categoryName: 'เสื้อผ้า', parentCategoryId: null },
    brandId: 1, brand: { id: 1, brandName: 'ไม่ระบุแบรนด์' },
    size: 'M', condition: 'GOOD', saleType: 'FIXED_PRICE', status: 'AVAILABLE',
    images: [], createdAt: null, updatedAt: null,
    ...extra,
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/** service ปลอมที่บันทึกทุก call และให้ test ควบคุม response/ลำดับ/เวลาได้ผ่าน respond() */
function setup(respond) {
  const calls = [];
  const service = {
    getProduct: async id => {
      calls.push(id);
      return respond ? respond(id, calls.length) : product(id);
    },
  };
  return { calls, service };
}

// ===== 1. Load success =====

test('opening a product id loads it and reports success', async () => {
  const { calls, service } = setup();
  const store = createProductDetailStore(service);
  const opening = store.open(101);
  assert.equal(store.getSnapshot().loading, true);
  await opening;

  const state = store.getSnapshot();
  assert.equal(state.loading, false);
  assert.equal(state.notAvailable, false);
  assert.equal(state.error, null);
  assert.equal(state.product.id, 101);
  assert.deepEqual(calls, [101]);
});

// ===== 2. 404 / PRODUCT_NOT_FOUND =====

test('a 404 from the service is reported as not-available, distinct from a generic error', async () => {
  const { service } = setup(() => { throw Object.assign(new Error('gone'), { kind: 'not-found' }); });
  const store = createProductDetailStore(service);
  await store.open(107);

  const state = store.getSnapshot();
  assert.equal(state.notAvailable, true);
  assert.equal(state.error, null, 'not-available must not also be reported through the generic error field');
  assert.equal(state.product, null);
  assert.equal(state.loading, false);
});

test('not-available is never confused with a network error', async () => {
  const { service } = setup(() => { throw Object.assign(new Error('offline'), { kind: 'network-error' }); });
  const store = createProductDetailStore(service);
  await store.open(1);

  const state = store.getSnapshot();
  assert.equal(state.notAvailable, false);
  assert.equal(state.error, 'network-error');
});

// ===== 3. Network error / 5xx =====

test('a network/server error can be retried and a successful retry returns to success', async () => {
  const { calls, service } = setup((id, n) => {
    if (n === 1) throw Object.assign(new Error('down'), { kind: 'server-error' });
    return product(id);
  });
  const store = createProductDetailStore(service);
  await store.open(5);

  let state = store.getSnapshot();
  assert.equal(state.error, 'server-error');
  assert.equal(state.notAvailable, false);
  assert.equal(state.product, null);

  await store.retry();
  state = store.getSnapshot();
  assert.equal(state.error, null);
  assert.equal(state.product.id, 5);
  assert.deepEqual(calls, [5, 5]);
});

// ===== 4. เปลี่ยน id ระหว่างโหลด =====

test('opening a new id discards a slow response for the previous id', async () => {
  const slowA = deferred();
  const { service } = setup((id, n) => (id === 1 ? slowA.promise : product(id)));
  const store = createProductDetailStore(service);

  const openingA = store.open(1);
  await store.open(2);
  assert.equal(store.getSnapshot().product.id, 2);

  slowA.resolve(product(1));
  await openingA;
  assert.equal(store.getSnapshot().product.id, 2, 'product A must never appear after switching to product B');
});

test('opening a new id clears the previous product immediately, before the fetch resolves', async () => {
  const gate = deferred();
  const { service } = setup(id => (id === 2 ? gate.promise : product(id)));
  const store = createProductDetailStore(service);
  await store.open(1);
  assert.equal(store.getSnapshot().product.id, 1);

  const reopening = store.open(2);
  assert.equal(store.getSnapshot().product, null);
  assert.equal(store.getSnapshot().loading, true);

  gate.resolve(product(2));
  await reopening;
  assert.equal(store.getSnapshot().product.id, 2);
});

// ===== 5. Invalid id =====

test('an invalid id is reported as not-available without calling the service', async () => {
  const { calls, service } = setup();
  for (const invalid of [0, -1, 1.5, NaN, 2147483648]) {
    const store = createProductDetailStore(service);
    await store.open(invalid);
    const state = store.getSnapshot();
    assert.equal(state.notAvailable, true, `id=${invalid}`);
    assert.equal(state.loading, false, `id=${invalid}`);
  }
  assert.equal(calls.length, 0, 'the service must never be called for an invalid id');
});

test('retry does nothing for an invalid id', async () => {
  const { calls, service } = setup();
  const store = createProductDetailStore(service);
  await store.open(-5);
  await store.retry();
  assert.equal(calls.length, 0);
  assert.equal(store.getSnapshot().notAvailable, true);
});

test('subscribers are notified as the state changes', async () => {
  const { service } = setup();
  const store = createProductDetailStore(service);
  let notifications = 0;
  const unsubscribe = store.subscribe(() => { notifications += 1; });
  await store.open(1);
  assert.ok(notifications >= 2);
  unsubscribe();
  const seen = notifications;
  await store.retry();
  assert.equal(notifications, seen);
});
