import test from 'node:test';
import assert from 'node:assert/strict';
import { createInspectionService, InspectionServiceError } from '../src/services/inspection-service.ts';

test('Admin certificate routes use bearer auth, bounded cursor and exact private reason/key', async () => {
  const calls = [];
  const service = createInspectionService({ baseUrl: 'https://api.test', fetch: async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ status: 'REVOKED' }), { status: 200 });
  } });
  await service.adminCertificates('admin', 42);
  await service.adminCertificate('admin', 41);
  await service.revokeCertificate('admin', 41, 'Private reason for audit', 'unchanged-key-01');
  assert.deepEqual(calls.map(x => x.url), ['https://api.test/admin/certificates?limit=20&before_id=42',
    'https://api.test/admin/certificates/41', 'https://api.test/admin/certificates/41/revoke']);
  assert(calls.every(x => x.init.headers.Authorization === 'Bearer admin'));
  assert.equal(calls[2].init.headers['Idempotency-Key'], 'unchanged-key-01');
  assert.deepEqual(JSON.parse(calls[2].init.body), { reason: 'Private reason for audit' });
  assert.equal(calls[0].init.cache, 'no-store');
  assert.equal(calls[1].init.cache, 'no-store');
  await assert.rejects(service.revokeCertificate('', 41, 'Private reason', 'test-key-01'), e => e.status === 401);
  assert.equal(calls.length, 3);
});

test('public certificate reads omit auth and bypass cached issued responses', async () => {
  let request;
  const service = createInspectionService({ baseUrl: 'https://api.test', fetch: async (url, init) => {
    request = { url, init };
    return new Response(JSON.stringify({ status: 'REVOKED' }), { status: 200 });
  } });
  assert.equal((await service.publicCertificate('public-token')).status, 'REVOKED');
  assert.equal(request.init.cache, 'no-store');
  assert.equal(request.init.headers.Authorization, undefined);
});

test('revoke response-body timeout and field/conflict failures remain visible to the caller', async () => {
  const stalled = createInspectionService({ baseUrl: 'https://api.test', timeoutMs: 10,
    fetch: async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) }) });
  await assert.rejects(stalled.revokeCertificate('admin', 1, 'Valid private reason', 'test-key-01'), e => e.code === 'timeout');
  for (const status of [403, 409, 422, 503]) {
    const service = createInspectionService({ baseUrl: 'https://api.test', fetch: async () => new Response(
      JSON.stringify({ detail: { code: 'test_error', fields: { reason: 'invalid' } } }), { status }) });
    await assert.rejects(service.revokeCertificate('admin', 1, 'Valid private reason', 'test-key-01'),
      e => e instanceof InspectionServiceError && e.status === status && e.fields.reason === 'invalid');
  }
});
