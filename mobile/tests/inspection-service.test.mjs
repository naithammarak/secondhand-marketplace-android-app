import test from 'node:test';
import assert from 'node:assert/strict';
import { createInspectionService, InspectionServiceError } from '../src/services/inspection-service.ts';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('Seller and Inspector mutations send bearer token and stable idempotency key', async () => {
  const calls = [];
  const service = createInspectionService({ baseUrl: 'https://api.test/ignored', fetch: async (url, init) => {
    calls.push({ url, init });
    return json(200, { order_status: 'SHIPPING_TO_CENTER' });
  } });
  await service.ship('tok', 42, { carrier: 'Demo', tracking_number: 'D-42' }, 'same-key-123');
  await service.receive('tok', 7, null, 'receive-key-123');
  await service.result('tok', 7, { result: 'FAKE', summary: 'Not authentic', evidence_ids: [9] }, 'result-key-123');
  await service.list('tok', 20, 'RECEIVED_AT_CENTER');
  assert.equal(calls[0].url, 'https://api.test/orders/42/ship-to-center');
  assert.equal(calls[1].url, 'https://api.test/inspections/7/receive');
  assert.equal(calls[2].url, 'https://api.test/inspections/7/result');
  assert.equal(calls[3].url, 'https://api.test/inspections?limit=20&offset=20&status=RECEIVED_AT_CENTER');
  assert.deepEqual(calls.slice(0, 3).map(call => call.init.headers['Idempotency-Key']), ['same-key-123', 'receive-key-123', 'result-key-123']);
  assert(calls.every(call => call.init.headers.Authorization === 'Bearer tok'));
  assert.deepEqual(JSON.parse(calls[2].init.body), { result: 'FAKE', summary: 'Not authentic', evidence_ids: [9] });
});

test('evidence upload uses multipart and never trusts raw object paths for image URLs', async () => {
  const calls = [];
  const service = createInspectionService({ baseUrl: 'https://api.test', fetch: async (url, init) => {
    calls.push({ url, init });
    return json(201, { evidence: { id: 3, mime_type: 'image/png', size_bytes: 8 } });
  } });
  await service.upload('tok', 4, { uri: 'file:///image.png', name: 'image.png', type: 'image/png', file: new Blob(['image'], { type: 'image/png' }) }, 'upload-key-123');
  assert.equal(calls[0].url, 'https://api.test/inspections/4/evidence');
  assert(calls[0].init.body instanceof FormData);
  assert.equal(calls[0].init.headers['Content-Type'], undefined);
  assert.deepEqual(service.privateImageSource('tok', { id: 3, mime_type: 'image/png', size_bytes: 8, url: '/inspection-evidence/3' }),
    { uri: 'https://api.test/inspection-evidence/3', headers: { Authorization: 'Bearer tok' } });
  assert.throws(() => service.privateImageSource('tok', { id: 3, mime_type: 'image/png', size_bytes: 8, url: 'https://evil.test/object' }),
    error => error instanceof InspectionServiceError && error.code === 'invalid_evidence_url');
});

test('Certificate failure code and body timeout are surfaced without claiming success', async () => {
  const failed = createInspectionService({ baseUrl: 'https://api.test', fetch: async () => json(503, { detail: { code: 'certificate_unavailable' } }) });
  await assert.rejects(failed.result('tok', 7, { result: 'PASS', summary: 'Matches Order', evidence_ids: [2] }, 'key-12345678'),
    error => error instanceof InspectionServiceError && error.code === 'certificate_unavailable');

  const stalled = createInspectionService({ baseUrl: 'https://api.test', fetch: async () => ({
    ok: true, status: 200, json: () => new Promise(() => {}),
  }), timeoutMs: 20 });
  const outcome = await Promise.race([
    stalled.getProgress('tok', 42).then(() => 'success', error => error.code),
    new Promise(resolve => setTimeout(() => resolve('hung'), 500)),
  ]);
  assert.equal(outcome, 'timeout');
});
