import test from 'node:test';
import assert from 'node:assert/strict';
import { createVerificationService } from '../src/services/verification-service.ts';

const pendingBody = {
  status: 'PENDING',
  id: 7,
  bank_name: 'ธนาคารทดสอบ',
  bank_account_name: 'ผู้ขาย ทดสอบ',
  bank_account_last4: '7890',
  reject_reason: null,
  reviewed_at: null,
  verified_at: null,
  can_submit: false,
};

// Node covers response/error handling using a browser File. Native URI files
// are exercised with Expo's actual serializer in component-tests.
const idCard = {
  uri: 'blob:synthetic-card', name: 'card.png', type: 'image/png',
  file: new File([new Uint8Array([1, 2, 3])], 'card.png', { type: 'image/png' }),
};
const input = {
  shopName: 'ร้านทดสอบ',
  bankName: 'ธนาคารทดสอบ',
  bankAccountName: 'ผู้ขาย ทดสอบ',
  bankAccountNumber: '1234567890',
  idCard,
};

test('reads the current request from the backend with the access token', async () => {
  const calls = [];
  const service = createVerificationService({ baseUrl: 'https://api.example.test/', fetch: async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(pendingBody), { status: 200 });
  }});
  const record = await service.getMine('token');
  assert.deepEqual(calls.map(call => [call.url, call.init.method]), [
    ['https://api.example.test/verifications/me', 'GET'],
  ]);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer token');
  assert.equal(record.status, 'PENDING');
  assert.equal(record.bankAccountLast4, '7890');
  assert.equal(record.canSubmit, false);
});

test('maps a not submitted response', async () => {
  const service = createVerificationService({ baseUrl: 'https://api.example.test',
    fetch: async () => new Response(JSON.stringify({ status: 'NOT_SUBMITTED', can_submit: true })) });
  const record = await service.getMine('token');
  assert.deepEqual(
    { status: record.status, id: record.id, canSubmit: record.canSubmit },
    { status: 'NOT_SUBMITTED', id: null, canSubmit: true },
  );
});

test('keeps the rejection reason only while the request is rejected', async () => {
  const service = createVerificationService({ baseUrl: 'https://api.example.test',
    fetch: async () => new Response(JSON.stringify({
      status: 'REJECTED', reject_reason: 'รูปบัตรไม่ชัด', can_submit: true,
    })) });
  const record = await service.getMine('token');
  assert.equal(record.rejectReason, 'รูปบัตรไม่ชัด');
  assert.equal(record.canSubmit, true);

  const approved = createVerificationService({ baseUrl: 'https://api.example.test',
    fetch: async () => new Response(JSON.stringify({
      status: 'APPROVED', reject_reason: 'ข้อมูลเก่า', can_submit: false,
    })) });
  assert.equal((await approved.getMine('token')).rejectReason, null);
});

test('submits the form as multipart without leaking the token into the URL', async () => {
  const calls = [];
  const service = createVerificationService({ baseUrl: 'https://api.example.test', fetch: async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(pendingBody), { status: 201 });
  }});
  const record = await service.submit('token', input);
  assert.equal(calls[0].url, 'https://api.example.test/verifications');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer token');
  assert.equal(calls[0].init.body.get('bank_account_number'), '1234567890');
  assert.equal(calls[0].init.body.get('bank_name'), 'ธนาคารทดสอบ');
  assert.equal(calls.every(call => !call.url.includes('token')), true);
  assert.equal(record.status, 'PENDING');
});

test('sends the web File object when the picker provides one', async () => {
  let body;
  const file = new File([new Uint8Array([1, 2, 3])], 'card.png', { type: 'image/png' });
  const service = createVerificationService({ baseUrl: 'https://api.example.test', fetch: async (_url, init) => {
    body = init.body;
    return new Response(JSON.stringify(pendingBody), { status: 201 });
  }});
  await service.submit('token', { ...input, idCard: { ...idCard, file } });
  assert.equal(body.get('id_card_image') instanceof File, true);
});

for (const [status, expected] of [[401, 'unauthorized'], [403, 'forbidden'], [409, 'conflict'],
  [500, 'server-error'], [503, 'unavailable']]) {
  test(`maps backend ${status} without exposing its response body`, async () => {
    const service = createVerificationService({ baseUrl: 'https://api.example.test',
      fetch: async () => new Response('sensitive backend message', { status }) });
    await assert.rejects(service.getMine('token'), error =>
      error.kind === expected && !String(error.message).includes('sensitive'));
  });
}

test('exposes per field errors from a 422 response', async () => {
  const service = createVerificationService({ baseUrl: 'https://api.example.test',
    fetch: async () => new Response(JSON.stringify({ detail: { code: 'validation_error', fields: {
      bank_account_number: 'เลขที่บัญชีต้องมี 10-15 หลัก',
      id_card_image: 'กรุณาแนบรูปบัตรประชาชน',
      ignored: 42,
    } } }), { status: 422 }) });
  await assert.rejects(service.submit('token', input), error => {
    assert.equal(error.kind, 'validation-error');
    assert.deepEqual(error.fields, {
      bank_account_number: 'เลขที่บัญชีต้องมี 10-15 หลัก',
      id_card_image: 'กรุณาแนบรูปบัตรประชาชน',
    });
    return true;
  });
});

test('maps transport failures to a network error', async () => {
  const service = createVerificationService({ baseUrl: 'https://api.example.test',
    fetch: async () => { throw new Error('offline'); } });
  await assert.rejects(service.getMine('token'), error => error.kind === 'network-error');
});

test('propagates aborts instead of reporting a network error', async () => {
  const controller = new AbortController();
  const service = createVerificationService({ baseUrl: 'https://api.example.test',
    fetch: async (_url, init) => { controller.abort(); throw init.signal.reason ?? new Error('aborted'); } });
  await assert.rejects(service.getMine('token', controller.signal), error => error.kind !== 'network-error');
});

test('rejects an unknown status instead of showing it to the seller', async () => {
  const service = createVerificationService({ baseUrl: 'https://api.example.test',
    fetch: async () => new Response(JSON.stringify({ status: 'DELETED' })) });
  await assert.rejects(service.getMine('token'), error => error.kind === 'server-error');
});

test('reports an unconfigured API as unavailable and never calls fetch', async () => {
  let calls = 0;
  const service = createVerificationService({ fetch: async () => { calls += 1; return new Response('{}'); } });
  await assert.rejects(service.getMine('token'), error => error.kind === 'unavailable');
  assert.equal(calls, 0);
});

test('backend base URL is reduced to its http origin', async () => {
  const urls = [];
  const service = createVerificationService({ baseUrl: 'https://api.example.test/untrusted/path?token=no',
    fetch: async url => { urls.push(url); return new Response(JSON.stringify(pendingBody)); } });
  await service.getMine('token');
  assert.deepEqual(urls, ['https://api.example.test/verifications/me']);
});

test('rejects a non-http backend origin', () => {
  assert.throws(() => createVerificationService({ baseUrl: 'file:///private' }));
});
