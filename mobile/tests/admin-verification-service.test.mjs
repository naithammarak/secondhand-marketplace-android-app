import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AdminVerificationServiceError,
  createAdminVerificationService,
} from '../src/services/admin-verification-service.ts';

const pendingItem = {
  id: 7,
  status: 'PENDING',
  seller_id: 3,
  seller_name: 'ผู้ขาย ทดสอบ',
  seller_email: 'seller@example.test',
  bank_name: 'ธนาคารทดสอบ',
  bank_account_name: 'ผู้ขาย ทดสอบ',
  bank_account_last4: '7890',
  submitted_at: '2026-09-18T03:00:00Z',
  reject_reason: null,
  reviewed_at: null,
  verified_at: null,
  reviewed_by_name: null,
  has_id_card_image: true,
};

const page = { items: [pendingItem], total: 1, limit: 20, offset: 0 };

function serviceOf(handler) {
  const calls = [];
  const service = createAdminVerificationService({
    baseUrl: 'https://api.example.test/',
    fetch: async (url, init) => {
      calls.push({ url, init });
      return handler(calls.length, { url, init });
    },
  });
  return { service, calls };
}

test('reads the pending queue with the access token and the status filter', async () => {
  const { service, calls } = serviceOf(() => new Response(JSON.stringify(page)));
  const result = await service.list('token', { status: 'PENDING', limit: 20 });

  assert.equal(calls[0].url, 'https://api.example.test/admin/verifications?status=PENDING&limit=20');
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer token');
  assert.equal(result.total, 1);
  assert.deepEqual(
    {
      id: result.items[0].id,
      sellerName: result.items[0].sellerName,
      bankAccountLast4: result.items[0].bankAccountLast4,
      hasIdCardImage: result.items[0].hasIdCardImage,
    },
    { id: 7, sellerName: 'ผู้ขาย ทดสอบ', bankAccountLast4: '7890', hasIdCardImage: true },
  );
});

test('passes the offset when a later page is requested', async () => {
  const { service, calls } = serviceOf(() => new Response(JSON.stringify(page)));
  await service.list('token', { status: 'REJECTED', limit: 5, offset: 10 });
  assert.equal(
    calls[0].url,
    'https://api.example.test/admin/verifications?status=REJECTED&limit=5&offset=10',
  );
});

test('maps an empty queue', async () => {
  const { service } = serviceOf(() => new Response(JSON.stringify({ items: [], total: 0, limit: 20, offset: 0 })));
  const result = await service.list('token', { status: 'PENDING' });
  assert.deepEqual(result.items, []);
  assert.equal(result.total, 0);
});

test('keeps the rejection reason only while the request is rejected', async () => {
  const { service } = serviceOf(() => new Response(JSON.stringify({
    items: [
      { ...pendingItem, id: 1, status: 'REJECTED', reject_reason: 'รูปบัตรไม่ชัด' },
      { ...pendingItem, id: 2, status: 'APPROVED', reject_reason: 'ข้อมูลเก่า' },
    ],
    total: 2, limit: 20, offset: 0,
  })));
  const result = await service.list('token', { status: 'REJECTED' });
  assert.equal(result.items[0].rejectReason, 'รูปบัตรไม่ชัด');
  assert.equal(result.items[1].rejectReason, null);
});

test('asks for the id card evidence of one request only', async () => {
  const { service, calls } = serviceOf(() => new Response(JSON.stringify({
    url: 'https://storage.test/sign/card.png?token=abc',
    expires_in: 120,
  })));
  const evidence = await service.getIdCard('token', 7);
  assert.equal(calls[0].url, 'https://api.example.test/admin/verifications/7/id-card');
  assert.equal(evidence.url, 'https://storage.test/sign/card.png?token=abc');
  assert.equal(evidence.expiresIn, 120);
});

test('refuses an evidence link that is not https', async () => {
  const { service } = serviceOf(() => new Response(JSON.stringify({
    url: 'javascript:alert(1)', expires_in: 120,
  })));
  await assert.rejects(service.getIdCard('token', 7), error => error.kind === 'server-error');
});

test('sends an approval without a reason', async () => {
  const { service, calls } = serviceOf(() => new Response(JSON.stringify({
    ...pendingItem, status: 'APPROVED', verified_at: '2026-09-18T04:00:00Z',
  })));
  const result = await service.decide('token', 7, 'APPROVED', null);

  assert.equal(calls[0].url, 'https://api.example.test/admin/verifications/7/decision');
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].init.body), { decision: 'APPROVED' });
  assert.equal(result.status, 'APPROVED');
});

test('sends a rejection together with its reason', async () => {
  const { service, calls } = serviceOf(() => new Response(JSON.stringify({
    ...pendingItem, status: 'REJECTED', reject_reason: 'รูปบัตรไม่ชัด',
  })));
  const result = await service.decide('token', 7, 'REJECTED', 'รูปบัตรไม่ชัด');

  assert.deepEqual(JSON.parse(calls[0].init.body), {
    decision: 'REJECTED', reject_reason: 'รูปบัตรไม่ชัด',
  });
  assert.equal(result.rejectReason, 'รูปบัตรไม่ชัด');
});

test('reports who already reviewed a request that comes back as a conflict', async () => {
  const { service } = serviceOf(() => new Response(JSON.stringify({
    detail: { code: 'already_reviewed', status: 'APPROVED', reviewed_by_name: 'แอดมิน หนึ่ง' },
  }), { status: 409 }));

  await assert.rejects(service.decide('token', 7, 'APPROVED', null), error => {
    assert.ok(error instanceof AdminVerificationServiceError);
    assert.equal(error.kind, 'conflict');
    assert.deepEqual(error.alreadyReviewed, { status: 'APPROVED', reviewedByName: 'แอดมิน หนึ่ง' });
    return true;
  });
});

test('reports the field error when the reason is refused by the backend', async () => {
  const { service } = serviceOf(() => new Response(JSON.stringify({
    detail: { code: 'validation_error', fields: { reject_reason: 'กรุณากรอกเหตุผลที่ปฏิเสธ' } },
  }), { status: 422 }));

  await assert.rejects(service.decide('token', 7, 'REJECTED', ''), error => {
    assert.equal(error.kind, 'validation-error');
    assert.equal(error.fields.reject_reason, 'กรุณากรอกเหตุผลที่ปฏิเสธ');
    return true;
  });
});

test('maps the http status of a refused request to an error kind', async () => {
  const cases = [[401, 'unauthorized'], [403, 'forbidden'], [404, 'not-found'], [503, 'unavailable'],
    [500, 'server-error']];
  for (const [status, kind] of cases) {
    const { service } = serviceOf(() => new Response('{}', { status }));
    await assert.rejects(service.list('token', { status: 'PENDING' }), error => error.kind === kind);
  }
});

test('never leaks the raw backend message to the caller', async () => {
  const { service } = serviceOf(() => new Response('database url postgres://secret', { status: 500 }));
  await assert.rejects(service.list('token', { status: 'PENDING' }), error => {
    assert.equal(error.message, 'server-error');
    assert.ok(!error.message.includes('postgres'));
    return true;
  });
});

test('a network failure is reported as a network error', async () => {
  const service = createAdminVerificationService({
    baseUrl: 'https://api.example.test',
    fetch: async () => { throw new TypeError('Failed to fetch'); },
  });
  await assert.rejects(service.list('token', { status: 'PENDING' }), error => error.kind === 'network-error');
});

test('reports the service as unavailable when no api origin is configured', async () => {
  const service = createAdminVerificationService({});
  await assert.rejects(service.list('token', { status: 'PENDING' }), error => error.kind === 'unavailable');
});

test('rejects an api origin that is not http or https', () => {
  assert.throws(() => createAdminVerificationService({ baseUrl: 'file:///etc/passwd' }));
});

test('an abort is passed through instead of being reported as a network error', async () => {
  const controller = new AbortController();
  const service = createAdminVerificationService({
    baseUrl: 'https://api.example.test',
    fetch: async (_url, init) => {
      controller.abort();
      throw Object.assign(new Error('aborted'), { name: 'AbortError', signal: init.signal });
    },
  });
  await assert.rejects(
    service.list('token', { status: 'PENDING' }, controller.signal),
    error => error.name === 'AbortError',
  );
});
