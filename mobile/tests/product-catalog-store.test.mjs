import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductCatalogStore, SEARCH_DEBOUNCE_MS } from '../src/products/product-catalog-store.ts';

function item(id, extra = {}) {
  return {
    id, productName: `สินค้า ${id}`, price: '100.00', condition: 'GOOD', status: 'AVAILABLE',
    mainImage: null, ...extra,
  };
}

function page(items, meta = {}) {
  return {
    items,
    meta: { page: 1, pageSize: 20, total: items.length, totalPages: 1, hasNext: false, ...meta },
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
    listProducts: async params => {
      calls.push(params);
      return respond ? respond(params, calls.length) : page([item(1)]);
    },
  };
  return { calls, service };
}

test('initial load fetches page 1 with the current query', async () => {
  const { calls, service } = setup(() => page([item(1), item(2)], { page: 1, total: 2, hasNext: false }));
  const store = createProductCatalogStore({ service });
  await store.load();
  const state = store.getSnapshot();
  assert.equal(state.loaded, true);
  assert.equal(state.loading, false);
  assert.equal(state.items.length, 2);
  assert.equal(calls[0].page, 1);
  assert.equal(calls[0].q, '');
});

test('setQuery does not call the service until the debounce delay elapses', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { calls, service } = setup();
  const store = createProductCatalogStore({ service });

  store.setQuery('เสื้อ');
  assert.equal(calls.length, 0);
  t.mock.timers.tick(SEARCH_DEBOUNCE_MS - 1);
  assert.equal(calls.length, 0, 'must not fire before the debounce window elapses');
  t.mock.timers.tick(1);
  assert.equal(calls.length, 1, 'must fire exactly at the debounce window');
  assert.equal(calls[0].q, 'เสื้อ');
});

test('typing again before the debounce fires restarts the timer and only searches the latest text', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { calls, service } = setup();
  const store = createProductCatalogStore({ service });

  store.setQuery('เ');
  t.mock.timers.tick(200);
  store.setQuery('เสื้อ');
  t.mock.timers.tick(299);
  assert.equal(calls.length, 0, 'restarted timer must not fire at the old deadline');
  t.mock.timers.tick(1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].q, 'เสื้อ');
});

test('changing the search query always resets to page 1 and replaces the items', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { calls, service } = setup((params, n) => (
    n === 1
      ? page([item(1), item(2)], { page: 1, total: 3, hasNext: true })
      : n === 2
        ? page([item(3)], { page: 2, total: 3, hasNext: false })
        : page([item(9)], { page: 1, total: 1, hasNext: false })
  ));
  const store = createProductCatalogStore({ service });
  await store.load();
  await store.loadMore();
  assert.equal(store.getSnapshot().items.length, 3);
  assert.equal(store.getSnapshot().page, 2);

  store.setQuery('อื่น');
  t.mock.timers.tick(SEARCH_DEBOUNCE_MS);
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(calls[2].page, 1, 'a new search must ask for page 1, not continue from the old page');
  const state = store.getSnapshot();
  assert.deepEqual(state.items.map(i => i.id), [9], 'items from the previous query must be replaced, not appended');
  assert.equal(state.page, 1);
});

test('a stale response from an earlier query never overwrites the current query results', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const slow = deferred();
  const { service } = setup((params, n) => (n === 1 ? slow.promise : page([item(2)], { page: 1, total: 1 })));
  const store = createProductCatalogStore({ service });

  store.setQuery('a');
  t.mock.timers.tick(SEARCH_DEBOUNCE_MS);
  store.setQuery('b');
  t.mock.timers.tick(SEARCH_DEBOUNCE_MS);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(store.getSnapshot().items.map(i => i.id), [2], 'the fast "b" response should already be showing');

  slow.resolve(page([item(1)], { page: 1, total: 1 }));
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(store.getSnapshot().items.map(i => i.id), [2], 'the late "a" response must be discarded');
});

test('loadMore appends the next page and deduplicates by id', async () => {
  const { calls, service } = setup((params, n) => (
    n === 1 ? page([item(1), item(2)], { page: 1, total: 3, hasNext: true }) : page([item(2), item(3)], { page: 2, total: 3, hasNext: false })
  ));
  const store = createProductCatalogStore({ service });
  await store.load();
  await store.loadMore();
  assert.equal(calls[1].page, 2);
  assert.deepEqual(store.getSnapshot().items.map(i => i.id), [1, 2, 3]);
});

test('loadMore is a no-op once has_next is false', async () => {
  const { calls, service } = setup(() => page([item(1)], { page: 1, total: 1, hasNext: false }));
  const store = createProductCatalogStore({ service });
  await store.load();
  assert.equal(store.hasMore(), false);
  await store.loadMore();
  assert.equal(calls.length, 1, 'loadMore must not call the service when there is no next page');
});

test('a stale loadMore response from a query the user has since left is discarded', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const slowMore = deferred();
  const { calls, service } = setup((params, n) => {
    if (n === 1) return page([item(1), item(2)], { page: 1, total: 4, hasNext: true });
    if (n === 2) return slowMore.promise; // loadMore ของคำค้นเดิมที่ค้างอยู่
    return page([item(9)], { page: 1, total: 1, hasNext: false }); // ผลของคำค้นใหม่
  });
  const store = createProductCatalogStore({ service });
  await store.load();
  const stalePending = store.loadMore();

  store.setQuery('คำค้นใหม่');
  t.mock.timers.tick(SEARCH_DEBOUNCE_MS);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(store.getSnapshot().items.map(i => i.id), [9], 'the new query result must already be showing');

  slowMore.resolve(page([item(3), item(4)], { page: 2, total: 4, hasNext: false }));
  await stalePending;
  await Promise.resolve();
  assert.deepEqual(
    store.getSnapshot().items.map(i => i.id), [9],
    'the stale loadMore result must not be appended onto the new query results',
  );
});

test('calling loadMore again while the next page is already loading does not send a second request', async () => {
  const nextPage = deferred();
  const { calls, service } = setup((params, n) => (n === 1 ? page([item(1)], { page: 1, total: 3, hasNext: true }) : nextPage.promise));
  const store = createProductCatalogStore({ service });
  await store.load();

  const first = store.loadMore();
  const second = store.loadMore();
  assert.equal(calls.length, 2, 'only the first-page load and one loadMore call should have reached the service');

  nextPage.resolve(page([item(2)], { page: 2, total: 3, hasNext: true }));
  await first;
  await second;
  assert.equal(calls.length, 2, 'the second loadMore call must not have triggered another request for the same page');
  assert.deepEqual(store.getSnapshot().items.map(i => i.id), [1, 2]);
});

test('a failed loadMore keeps existing items, reports an error, and retry resumes the same page (append, not replace)', async () => {
  let attempt = 0;
  const { calls, service } = setup((params, n) => {
    attempt += 1;
    if (n === 2) throw Object.assign(new Error('network down'), { kind: 'network-error' });
    if (n === 1) return page([item(1), item(2)], { page: 1, total: 4, hasNext: true });
    return page([item(3), item(4)], { page: 2, total: 4, hasNext: false });
  });
  const store = createProductCatalogStore({ service });
  await store.load();
  await store.loadMore();

  let state = store.getSnapshot();
  assert.equal(state.error, 'network-error');
  assert.deepEqual(state.items.map(i => i.id), [1, 2], 'existing items must remain after a failed loadMore');
  assert.equal(state.page, 1, 'the failed page must not be counted as loaded');

  await store.retry();
  assert.equal(calls[2].page, 2, 'retry must ask for the same page that failed, not restart from page 1');
  state = store.getSnapshot();
  assert.equal(state.error, null);
  assert.deepEqual(state.items.map(i => i.id), [1, 2, 3, 4], 'a successful retry must append to the existing items');
  assert.equal(state.page, 2);
});

test('refresh re-fetches page 1 immediately, without waiting for the debounce', async () => {
  const { calls, service } = setup(() => page([item(1)], { page: 1, total: 1, hasNext: false }));
  const store = createProductCatalogStore({ service });
  await store.load();
  await store.refresh();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].page, 1);
});

test('a network error is reported without losing the ability to retry', async () => {
  let attempt = 0;
  const { calls, service } = setup(() => {
    attempt += 1;
    if (attempt === 1) throw Object.assign(new Error('offline'), { kind: 'network-error' });
    return page([item(1)], { page: 1, total: 1, hasNext: false });
  });
  const store = createProductCatalogStore({ service });
  await store.load();
  let state = store.getSnapshot();
  assert.equal(state.error, 'network-error');
  assert.equal(state.loading, false);
  assert.equal(state.items.length, 0);

  await store.retry();
  state = store.getSnapshot();
  assert.equal(state.error, null);
  assert.equal(state.items.length, 1);
  assert.equal(calls.length, 2);
});

test('a pending debounced search is cancelled by an immediate refresh', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { calls, service } = setup();
  const store = createProductCatalogStore({ service });
  store.setQuery('เสื้อ');
  void store.refresh();
  t.mock.timers.tick(SEARCH_DEBOUNCE_MS);
  assert.equal(calls.length, 1, 'the cancelled debounce must not fire a second call later');
});

test('subscribers are notified as the state changes', async () => {
  const { service } = setup(() => page([item(1)], { page: 1, total: 1, hasNext: false }));
  const store = createProductCatalogStore({ service });
  let notifications = 0;
  const unsubscribe = store.subscribe(() => { notifications += 1; });
  await store.load();
  assert.ok(notifications >= 2);
  unsubscribe();
  const seen = notifications;
  await store.refresh();
  assert.equal(notifications, seen);
});
