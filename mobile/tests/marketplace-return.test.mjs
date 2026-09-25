import test from 'node:test';
import assert from 'node:assert/strict';
import { createMarketplaceReturn } from '../src/auth/marketplace-return.ts';

function setup() {
  let raw = null;
  let time = 100;
  const storage = { getItem: async () => raw, setItem: async (_, value) => { raw = value; }, removeItem: async () => { raw = null; } };
  return { store: createMarketplaceReturn(storage, () => time), advance: () => { time += 31 * 60 * 1000; }, corrupt: value => { raw = value; } };
}
test('login returns to the chosen product once', async () => {
  const { store } = setup();
  await store.save({ kind: 'checkout', productId: 42 });
  assert.deepEqual(await store.peek(), { kind: 'checkout', productId: 42 });
  assert.deepEqual(await store.peek(), { kind: 'checkout', productId: 42 });
  assert.deepEqual(await store.consume(), { kind: 'checkout', productId: 42 });
  assert.equal(await store.peek(), null);
  assert.equal(await store.consume(), null);
});
test('cancel clears a pending write and expiry prevents a later unrelated checkout', async () => {
  const { store, advance } = setup();
  const save = store.save({ kind: 'orders' });
  const clear = store.clear();
  await Promise.all([save, clear]);
  assert.equal(await store.consume(), null);
  await store.save({ kind: 'checkout', productId: 42 });
  advance();
  assert.equal(await store.peek(), null);
  assert.equal(await store.consume(), null);
});
test('storage cannot redirect to arbitrary URLs or invalid product IDs', async () => {
  const { store, corrupt } = setup();
  for (const destination of [{ kind: 'https://example.invalid' }, { kind: 'checkout', productId: -1 }, { kind: 'checkout', productId: '42' }]) {
    await assert.rejects(store.save(destination));
    corrupt(JSON.stringify({ destination, expiresAt: 5000 }));
    assert.equal(await store.peek(), null);
    assert.equal(await store.consume(), null);
  }
  corrupt('broken JSON');
  assert.equal(await store.consume(), null);
});
