import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoginController } from '../src/auth/login-controller.ts';

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

test('unconfigured login ends loading without pretending to authenticate', async () => {
  const login = createLoginController();
  await login.start();
  assert.equal(login.getSnapshot(), 'unavailable');
});

test('double press starts one operation; cancel allows retry and ignores old completion', async () => {
  const first = deferred();
  const second = deferred();
  let calls = 0;
  const login = createLoginController({ run: () => ++calls === 1 ? first.promise : second.promise });
  const old = login.start();
  await login.start();
  assert.equal(calls, 1);
  login.cancel();
  assert.equal(login.getSnapshot(), 'cancelled');
  const current = login.start();
  first.resolve('success');
  await old;
  assert.equal(login.getSnapshot(), 'waiting');
  second.resolve('oauth-error');
  await current;
  assert.equal(login.getSnapshot(), 'oauth-error');
});

test('processing failure is distinct and raw exceptions never enter UI state', async () => {
  const login = createLoginController({ run: async ({ processing }) => {
    processing();
    throw new Error('sensitive fake callback');
  } });
  await login.start();
  assert.equal(login.getSnapshot(), 'backend-error');
});

for (const result of ['cancelled', 'oauth-error', 'backend-error', 'unauthorized', 'forbidden', 'network-error', 'server-error', 'success']) {
  test(`adapter result ${result} releases loading`, async () => {
    const login = createLoginController({ run: async () => result });
    await login.start();
    assert.equal(login.getSnapshot(), result);
  });
}

test('cancel aborts adapter and late progress cannot overwrite cancellation', async () => {
  const pending = deferred();
  let context;
  const login = createLoginController({ run: value => { context = value; return pending.promise; } });
  const work = login.start();
  login.cancel();
  assert.equal(context.signal.aborted, true);
  context.processing();
  pending.resolve('success');
  await work;
  assert.equal(login.getSnapshot(), 'cancelled');
});

test('reset after logout allows a second Google login', async () => {
  let calls = 0;
  const login = createLoginController({ run: async () => { calls += 1; return 'success'; } });
  await login.start();
  assert.equal(login.getSnapshot(), 'success');

  login.reset();
  assert.equal(login.getSnapshot(), 'ready');
  await login.start();
  assert.equal(login.getSnapshot(), 'success');
  assert.equal(calls, 2);
});

test('reset aborts a pending login and ignores its late result', async () => {
  const pending = deferred();
  let signal;
  const login = createLoginController({ run: ({ signal: attemptSignal }) => {
    signal = attemptSignal;
    return pending.promise;
  } });
  const work = login.start();
  login.reset();
  assert.equal(signal.aborted, true);
  assert.equal(login.getSnapshot(), 'ready');
  pending.resolve('success');
  await work;
  assert.equal(login.getSnapshot(), 'ready');
});
