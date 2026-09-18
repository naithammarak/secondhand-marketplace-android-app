import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewStore } from '../src/admin/review-store.ts';
import { AdminVerificationServiceError } from '../src/services/admin-verification-service.ts';

const request = (id, status = 'PENDING', extra = {}) => ({
  id,
  status,
  sellerId: id + 100,
  sellerName: `ผู้ขาย ${id}`,
  sellerEmail: `seller${id}@example.test`,
  bankName: 'ธนาคารทดสอบ',
  bankAccountName: `ผู้ขาย ${id}`,
  bankAccountLast4: '7890',
  submittedAt: '2026-09-18T03:00:00Z',
  rejectReason: null,
  reviewedAt: null,
  verifiedAt: null,
  reviewedByName: null,
  hasIdCardImage: true,
  ...extra,
});

const pageOf = (items) => ({ items, total: items.length, limit: 20, offset: 0 });

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function setup(overrides = {}) {
  const calls = { list: [], getIdCard: [], decide: [], refreshes: 0 };
  const service = {
    list: async (token, query, signal) => {
      calls.list.push({ token, query, signal });
      return overrides.list
        ? overrides.list(calls.list.length, query)
        : pageOf([request(1), request(2)]);
    },
    getIdCard: async (token, id, signal) => {
      calls.getIdCard.push({ token, id, signal });
      return overrides.getIdCard
        ? overrides.getIdCard(calls.getIdCard.length, id)
        : { url: 'https://storage.test/card.png?token=abc', expiresIn: 120 };
    },
    decide: async (token, id, decision, rejectReason, signal) => {
      calls.decide.push({ token, id, decision, rejectReason, signal });
      return overrides.decide
        ? overrides.decide(calls.decide.length, { id, decision, rejectReason })
        : request(id, decision);
    },
  };
  const store = createReviewStore({
    service,
    getAccessToken: overrides.getAccessToken ?? (async () => 'token'),
    refreshAccessToken: overrides.refreshAccessToken
      ?? (async () => { calls.refreshes += 1; return 'fresh-token'; }),
  });
  return { store, calls };
}

async function loadedStore(overrides = {}) {
  const { store, calls } = setup(overrides);
  store.setOwner('admin-1');
  await store.load();
  return { store, calls };
}

test('nothing is loaded until an admin account owns the store', async () => {
  const { store, calls } = setup();
  await store.load();
  assert.equal(calls.list.length, 0);
  assert.deepEqual(store.getSnapshot().items, []);
});

test('loads the pending queue for the signed in admin', async () => {
  const { store, calls } = await loadedStore();
  const state = store.getSnapshot();
  assert.deepEqual(calls.list[0].query, { status: 'PENDING', limit: 20 });
  assert.equal(calls.list[0].token, 'token');
  assert.deepEqual(state.items.map(item => item.id), [1, 2]);
  assert.equal(state.total, 2);
  assert.equal(state.loading, false);
  assert.equal(state.loaded, true);
  assert.equal(state.loadError, null);
});

test('an empty queue is a loaded state, not an error', async () => {
  const { store } = await loadedStore({ list: () => pageOf([]) });
  const state = store.getSnapshot();
  assert.deepEqual(state.items, []);
  assert.equal(state.total, 0);
  assert.equal(state.loaded, true);
  assert.equal(state.loadError, null);
});

test('a failed load is reported and can be retried', async () => {
  let attempt = 0;
  const { store } = await loadedStore({
    list: () => {
      attempt += 1;
      if (attempt === 1) throw new AdminVerificationServiceError('network-error');
      return pageOf([request(1)]);
    },
  });
  assert.equal(store.getSnapshot().loadError, 'network-error');
  assert.equal(store.getSnapshot().items.length, 0);

  await store.retry();
  assert.equal(store.getSnapshot().loadError, null);
  assert.deepEqual(store.getSnapshot().items.map(item => item.id), [1]);
});

test('an account without the admin role never loads request data', async () => {
  const { store, calls } = setup();
  // provider ผูก owner เป็น null เมื่อบทบาทไม่ใช่ ADMIN
  store.setOwner(null);
  await store.load();
  await store.refresh();
  await store.loadEvidence();
  await store.decide('APPROVED');
  assert.deepEqual(calls, { list: [], getIdCard: [], decide: [], refreshes: 0 });
  assert.deepEqual(store.getSnapshot().items, []);
});

test('changing account drops the previous admin data', async () => {
  const { store } = await loadedStore();
  store.select(1);
  store.setOwner('admin-2');
  const state = store.getSnapshot();
  assert.deepEqual(state.items, []);
  assert.equal(state.selectedId, null);
  assert.equal(state.loaded, false);
});

test('switching the status filter reloads the queue for that status', async () => {
  const { store, calls } = await loadedStore({
    list: (_call, query) => pageOf(query.status === 'PENDING' ? [request(1)] : [request(9, 'REJECTED')]),
  });
  store.select(1);
  await store.setStatus('REJECTED');

  const state = store.getSnapshot();
  assert.equal(calls.list[1].query.status, 'REJECTED');
  assert.deepEqual(state.items.map(item => item.id), [9]);
  assert.equal(state.status, 'REJECTED');
  assert.equal(state.selectedId, null);
});

test('the id card link is only fetched when the admin asks for it', async () => {
  const { store, calls } = await loadedStore();
  assert.equal(calls.getIdCard.length, 0);

  store.select(1);
  await store.loadEvidence();
  assert.deepEqual(calls.getIdCard.map(call => call.id), [1]);
  assert.equal(store.getSnapshot().evidence.url, 'https://storage.test/card.png?token=abc');
});

test('evidence the api refuses is reported without hiding the request', async () => {
  const { store } = await loadedStore({
    getIdCard: () => { throw new AdminVerificationServiceError('forbidden'); },
  });
  store.select(1);
  await store.loadEvidence();
  const state = store.getSnapshot();
  assert.equal(state.evidence, null);
  assert.equal(state.evidenceError, 'forbidden');
  assert.equal(state.selectedId, 1);
});

test('selecting another request drops the evidence of the previous one', async () => {
  const { store } = await loadedStore();
  store.select(1);
  await store.loadEvidence();
  store.select(2);
  assert.equal(store.getSnapshot().evidence, null);
});

test('approving sends the decision and refreshes the queue from the backend', async () => {
  let listed = 0;
  const { store, calls } = await loadedStore({
    list: () => {
      listed += 1;
      return pageOf(listed === 1 ? [request(1), request(2)] : [request(2)]);
    },
  });
  store.select(1);
  await store.decide('APPROVED');

  const state = store.getSnapshot();
  assert.deepEqual(calls.decide.map(call => [call.id, call.decision, call.rejectReason]), [
    [1, 'APPROVED', null],
  ]);
  assert.equal(calls.list.length, 2);
  assert.deepEqual(state.items.map(item => item.id), [2]);
  assert.deepEqual(state.lastDecision, { id: 1, decision: 'APPROVED' });
  assert.equal(state.deciding, null);
  assert.equal(state.selectedId, null);
  assert.equal(state.decisionError, null);
});

test('rejecting sends the trimmed reason and refreshes the queue', async () => {
  const { store, calls } = await loadedStore({ list: () => pageOf([request(2)]) });
  store.select(1);
  store.setRejectReason('  รูปบัตรไม่ชัด  ');
  await store.decide('REJECTED');

  assert.deepEqual(calls.decide.map(call => [call.id, call.decision, call.rejectReason]), [
    [1, 'REJECTED', 'รูปบัตรไม่ชัด'],
  ]);
  assert.deepEqual(store.getSnapshot().lastDecision, { id: 1, decision: 'REJECTED' });
  assert.equal(calls.list.length, 2);
});

test('rejecting without a reason never reaches the backend', async () => {
  const { store, calls } = await loadedStore();
  store.select(1);
  await store.decide('REJECTED');

  const state = store.getSnapshot();
  assert.equal(calls.decide.length, 0);
  assert.equal(state.reasonError, 'กรุณากรอกเหตุผลที่ปฏิเสธ');
  assert.equal(state.decisionError, 'validation-error');
  assert.equal(state.selectedId, 1);
});

test('rejecting with only spaces or a too short reason never reaches the backend', async () => {
  for (const reason of ['   ', 'สั้น']) {
    const { store, calls } = await loadedStore();
    store.select(1);
    store.setRejectReason(reason);
    await store.decide('REJECTED');
    assert.equal(calls.decide.length, 0, `reason ${JSON.stringify(reason)} should be refused`);
    assert.ok(store.getSnapshot().reasonError);
  }
});

test('typing a reason clears the earlier reason error', async () => {
  const { store } = await loadedStore();
  store.select(1);
  await store.decide('REJECTED');
  assert.ok(store.getSnapshot().reasonError);

  store.setRejectReason('รูปบัตรไม่ชัด');
  assert.equal(store.getSnapshot().reasonError, null);
  assert.equal(store.getSnapshot().decisionError, null);
});

test('a second tap while saving does not send a second decision', async () => {
  const pending = deferred();
  const { store, calls } = await loadedStore({
    decide: (call) => (call === 1 ? pending.promise : request(1, 'APPROVED')),
  });
  store.select(1);

  const first = store.decide('APPROVED');
  const second = store.decide('APPROVED');
  const third = store.decide('REJECTED');
  assert.equal(store.getSnapshot().deciding, 'APPROVED');

  pending.resolve(request(1, 'APPROVED'));
  await Promise.all([first, second, third]);
  assert.equal(calls.decide.length, 1);
});

test('the selection cannot change while a decision is being saved', async () => {
  const pending = deferred();
  const { store } = await loadedStore({
    decide: (call) => (call === 1 ? pending.promise : request(1, 'APPROVED')),
  });
  store.select(1);
  const saving = store.decide('APPROVED');
  store.select(2);
  assert.equal(store.getSnapshot().selectedId, 1);

  pending.resolve(request(1, 'APPROVED'));
  await saving;
});

test('a request another admin already reviewed is reported and the queue is refreshed', async () => {
  let listed = 0;
  const { store, calls } = await loadedStore({
    list: () => {
      listed += 1;
      return pageOf(listed === 1 ? [request(1), request(2)] : [request(2)]);
    },
    decide: () => {
      throw new AdminVerificationServiceError('conflict', {
        alreadyReviewed: { status: 'APPROVED', reviewedByName: 'แอดมิน หนึ่ง' },
      });
    },
  });
  store.select(1);
  await store.decide('APPROVED');

  const state = store.getSnapshot();
  assert.equal(state.decisionError, 'conflict');
  assert.deepEqual(state.alreadyReviewed, { status: 'APPROVED', reviewedByName: 'แอดมิน หนึ่ง' });
  assert.equal(calls.list.length, 2);
  assert.deepEqual(state.items.map(item => item.id), [2]);
  // คำขอที่ถูกตรวจไปแล้วหายจากคิว จึงไม่ค้างอยู่บนหน้ารายละเอียด
  assert.equal(state.selectedId, null);
  assert.equal(state.deciding, null);
});

test('a decision that fails on the network keeps the request selected for another try', async () => {
  let attempt = 0;
  const { store, calls } = await loadedStore({
    decide: () => {
      attempt += 1;
      if (attempt === 1) throw new AdminVerificationServiceError('network-error');
      return request(1, 'APPROVED');
    },
  });
  store.select(1);
  await store.decide('APPROVED');

  assert.equal(store.getSnapshot().decisionError, 'network-error');
  assert.equal(store.getSnapshot().selectedId, 1);
  assert.equal(store.getSnapshot().deciding, null);
  // รายการไม่ถูกรีเฟรชเมื่อบันทึกไม่สำเร็จ เพราะสถานะฝั่ง backend ยังเหมือนเดิม
  assert.equal(calls.list.length, 1);

  await store.decide('APPROVED');
  assert.equal(calls.decide.length, 2);
  assert.deepEqual(store.getSnapshot().lastDecision, { id: 1, decision: 'APPROVED' });
});

test('an expired token is refreshed once before the decision is retried', async () => {
  let attempt = 0;
  const { store, calls } = await loadedStore({
    decide: (call) => {
      attempt += 1;
      if (attempt === 1) throw new AdminVerificationServiceError('unauthorized');
      return request(1, 'APPROVED');
    },
  });
  store.select(1);
  await store.decide('APPROVED');

  assert.equal(calls.refreshes, 1);
  assert.equal(calls.decide[1].token, 'fresh-token');
  assert.equal(store.getSnapshot().decisionError, null);
});

test('a session that cannot be refreshed reports unauthorized without calling the backend twice', async () => {
  const { store, calls } = await loadedStore({
    decide: () => { throw new AdminVerificationServiceError('unauthorized'); },
    refreshAccessToken: async () => null,
  });
  store.select(1);
  await store.decide('APPROVED');

  assert.equal(calls.decide.length, 1);
  assert.equal(store.getSnapshot().decisionError, 'unauthorized');
});

test('a queue load while one is already running is ignored', async () => {
  const pending = deferred();
  const { store, calls } = setup({ list: (call) => (call === 1 ? pending.promise : pageOf([])) });
  store.setOwner('admin-1');
  const first = store.load();
  await store.load();
  await store.refresh();
  assert.equal(calls.list.length, 1);

  pending.resolve(pageOf([request(1)]));
  await first;
  assert.deepEqual(store.getSnapshot().items.map(item => item.id), [1]);
});
