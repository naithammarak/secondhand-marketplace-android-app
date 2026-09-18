import test from 'node:test';
import assert from 'node:assert/strict';
import { createVerificationStore } from '../src/verification/verification-store.ts';
import { VerificationServiceError } from '../src/services/verification-service.ts';

const record = (status, extra = {}) => ({
  status,
  id: 1,
  bankName: 'ธนาคารทดสอบ',
  bankAccountName: 'ผู้ขาย ทดสอบ',
  bankAccountLast4: '7890',
  rejectReason: null,
  reviewedAt: null,
  verifiedAt: null,
  canSubmit: status === 'REJECTED' || status === 'NOT_SUBMITTED',
  ...extra,
});

const validForm = {
  bankName: 'ธนาคารทดสอบ',
  bankAccountName: 'ผู้ขาย ทดสอบ',
  bankAccountNumber: '1234567890',
  idCard: { uri: 'file:///card.png', name: 'card.png', type: 'image/png', size: 10 },
};

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function setup(overrides = {}) {
  const calls = { getMine: [], submit: [], refreshes: 0 };
  const service = {
    getMine: async (token, signal) => {
      calls.getMine.push({ token, signal });
      return overrides.getMine ? overrides.getMine(calls.getMine.length, token) : record('NOT_SUBMITTED');
    },
    submit: async (token, input, signal) => {
      calls.submit.push({ token, input, signal });
      return overrides.submit ? overrides.submit(calls.submit.length, input) : record('PENDING');
    },
  };
  const store = createVerificationStore({
    service,
    getAccessToken: overrides.getAccessToken ?? (async () => 'token'),
    refreshAccessToken: overrides.refreshAccessToken ?? (async () => { calls.refreshes += 1; return 'fresh-token'; }),
  });
  return { store, calls };
}

test('nothing is loaded until an account owns the store', async () => {
  const { store, calls } = setup();
  await store.load();
  assert.equal(calls.getMine.length, 0);
  assert.equal(store.getSnapshot().record, null);
});

test('loads the current request for the signed in seller', async () => {
  const { store, calls } = setup({ getMine: () => record('PENDING') });
  store.setOwner('user-1');
  const loading = store.load();
  assert.equal(store.getSnapshot().loading, true);
  await loading;
  const state = store.getSnapshot();
  assert.equal(state.loading, false);
  assert.equal(state.record.status, 'PENDING');
  assert.equal(state.loadError, null);
  assert.equal(calls.getMine[0].token, 'token');
});

test('a failed load keeps a retryable error and recovers on retry', async () => {
  const { store, calls } = setup({
    getMine: attempt => {
      if (attempt === 1) throw new VerificationServiceError('network-error');
      return record('APPROVED');
    },
  });
  store.setOwner('user-1');
  await store.load();
  assert.equal(store.getSnapshot().loadError, 'network-error');
  assert.equal(store.getSnapshot().record, null);

  await store.retry();
  assert.equal(store.getSnapshot().loadError, null);
  assert.equal(store.getSnapshot().record.status, 'APPROVED');
  assert.equal(calls.getMine.length, 2);
});

test('refresh keeps the current record visible while it reloads', async () => {
  const gate = deferred();
  const { store } = setup({
    getMine: attempt => (attempt === 1 ? record('PENDING') : gate.promise),
  });
  store.setOwner('user-1');
  await store.load();
  const refreshing = store.refresh();
  assert.equal(store.getSnapshot().refreshing, true);
  assert.equal(store.getSnapshot().record.status, 'PENDING');
  gate.resolve(record('APPROVED'));
  await refreshing;
  assert.equal(store.getSnapshot().refreshing, false);
  assert.equal(store.getSnapshot().record.status, 'APPROVED');
});

test('a 401 refreshes the session once and retries with the new token', async () => {
  const { store, calls } = setup({
    getMine: (attempt, token) => {
      if (token === 'token') throw new VerificationServiceError('unauthorized');
      return record('PENDING');
    },
  });
  store.setOwner('user-1');
  await store.load();
  assert.equal(calls.refreshes, 1);
  assert.deepEqual(calls.getMine.map(call => call.token), ['token', 'fresh-token']);
  assert.equal(store.getSnapshot().record.status, 'PENDING');
});

test('a failed session refresh ends as unauthorized without looping', async () => {
  const { store, calls } = setup({
    getMine: () => { throw new VerificationServiceError('unauthorized'); },
    refreshAccessToken: async () => null,
  });
  store.setOwner('user-1');
  await store.load();
  assert.equal(store.getSnapshot().loadError, 'unauthorized');
  assert.equal(calls.getMine.length, 1);
});

test('submitting stores the pending result returned by the backend', async () => {
  const { store, calls } = setup();
  store.setOwner('user-1');
  await store.load();
  await store.submit(validForm);
  assert.equal(store.getSnapshot().record.status, 'PENDING');
  assert.equal(store.getSnapshot().submitting, false);
  assert.deepEqual(calls.submit[0].input.bankAccountNumber, '1234567890');
});

test('invalid fields are reported without calling the backend', async () => {
  const { store, calls } = setup();
  store.setOwner('user-1');
  await store.submit({ ...validForm, bankAccountNumber: '12', bankName: '' });
  const state = store.getSnapshot();
  assert.equal(calls.submit.length, 0);
  assert.equal(state.submitError, 'validation-error');
  assert.equal(typeof state.fieldErrors.bankAccountNumber, 'string');
  assert.equal(typeof state.fieldErrors.bankName, 'string');

  store.clearFieldError('bankName');
  assert.equal(store.getSnapshot().fieldErrors.bankName, undefined);
  assert.equal(typeof store.getSnapshot().fieldErrors.bankAccountNumber, 'string');
});

test('a second press while submitting does not send a second request', async () => {
  const gate = deferred();
  const { store, calls } = setup({ submit: () => gate.promise });
  store.setOwner('user-1');
  const first = store.submit(validForm);
  await store.submit(validForm);
  assert.equal(calls.submit.length, 1);
  assert.equal(store.getSnapshot().submitting, true);
  gate.resolve(record('PENDING'));
  await first;
  assert.equal(store.getSnapshot().submitting, false);
});

test('a pending request blocks another submission locally', async () => {
  const { store, calls } = setup({ getMine: () => record('PENDING') });
  store.setOwner('user-1');
  await store.load();
  await store.submit(validForm);
  assert.equal(calls.submit.length, 0);
  assert.equal(store.getSnapshot().submitError, 'conflict');
  assert.equal(store.getSnapshot().record.status, 'PENDING');
});

test('an approved request also blocks resubmission', async () => {
  const { store, calls } = setup({ getMine: () => record('APPROVED') });
  store.setOwner('user-1');
  await store.load();
  await store.submit(validForm);
  assert.equal(calls.submit.length, 0);
});

test('a rejected request can be sent again and shows its reason until then', async () => {
  const { store, calls } = setup({
    getMine: () => record('REJECTED', { rejectReason: 'รูปบัตรไม่ชัด' }),
    submit: () => record('PENDING'),
  });
  store.setOwner('user-1');
  await store.load();
  assert.equal(store.getSnapshot().record.rejectReason, 'รูปบัตรไม่ชัด');
  await store.submit(validForm);
  assert.equal(calls.submit.length, 1);
  assert.equal(store.getSnapshot().record.status, 'PENDING');
});

test('a 409 from the backend reloads the status the backend already holds', async () => {
  const { store, calls } = setup({
    getMine: attempt => (attempt === 1 ? record('NOT_SUBMITTED') : record('PENDING')),
    submit: () => { throw new VerificationServiceError('conflict'); },
  });
  store.setOwner('user-1');
  await store.load();
  await store.submit(validForm);
  assert.equal(store.getSnapshot().submitError, 'conflict');
  assert.equal(store.getSnapshot().record.status, 'PENDING');
  assert.equal(calls.getMine.length, 2);
});

test('backend field errors from a 422 land on the matching inputs', async () => {
  const { store } = setup({
    submit: () => { throw new VerificationServiceError('validation-error', {
      bank_account_number: 'เลขที่บัญชีต้องมี 10-15 หลัก',
    }); },
  });
  store.setOwner('user-1');
  await store.submit(validForm);
  assert.equal(store.getSnapshot().fieldErrors.bankAccountNumber, 'เลขที่บัญชีต้องมี 10-15 หลัก');
  assert.equal(store.getSnapshot().submitError, 'validation-error');
});

test('logging out clears the request data', async () => {
  const { store } = setup({ getMine: () => record('APPROVED') });
  store.setOwner('user-1');
  await store.load();
  store.setOwner(null);
  const state = store.getSnapshot();
  assert.equal(state.record, null);
  assert.equal(state.owner, null);
  assert.equal(state.loadError, null);
  assert.deepEqual(state.fieldErrors, {});
});

test('switching accounts never shows the previous account data', async () => {
  const gate = deferred();
  const { store } = setup({ getMine: attempt => (attempt === 1 ? gate.promise : record('NOT_SUBMITTED')) });
  store.setOwner('user-1');
  const slowLoad = store.load();
  store.setOwner('user-2');
  gate.resolve(record('APPROVED'));
  await slowLoad;
  assert.equal(store.getSnapshot().owner, 'user-2');
  assert.equal(store.getSnapshot().record, null);

  await store.load();
  assert.equal(store.getSnapshot().record.status, 'NOT_SUBMITTED');
});

test('a submission answered after an account switch is discarded', async () => {
  const gate = deferred();
  const { store } = setup({ submit: () => gate.promise });
  store.setOwner('user-1');
  const submission = store.submit(validForm);
  store.setOwner('user-2');
  gate.resolve(record('PENDING'));
  await submission;
  assert.equal(store.getSnapshot().record, null);
  assert.equal(store.getSnapshot().submitting, false);
});

test('subscribers are notified as the state changes', async () => {
  const { store } = setup();
  let notifications = 0;
  const unsubscribe = store.subscribe(() => { notifications += 1; });
  store.setOwner('user-1');
  await store.load();
  assert.ok(notifications >= 2);
  unsubscribe();
  const seen = notifications;
  store.setOwner(null);
  assert.equal(notifications, seen);
});
