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


test('Courier and Admin use protected routes and stable mutation keys', async () => {
  const calls = [];
  const service = createInspectionService({ baseUrl: 'https://api.test', fetch: async (url, init) => {
    calls.push({url,init});
    return url.includes('/courier/shipments')
      ? json(200, { items: [], scope: 'pending', offset: 0, limit: 100, has_more: false, next_offset: null })
      : json(200,{});
  } });
  await service.adminOrders('admin',20);
  await service.assignCourier('admin',42,12,'assign-key');
  await service.courierShipments('courier');
  await service.confirmDelivery('courier',7,'delivery-key',[9,4]);
  assert.equal(calls[0].url, 'https://api.test/admin/orders?status=SHIPPING_TO_CENTER&limit=20&offset=20');
  assert.deepEqual(JSON.parse(calls[1].init.body), {courier_id:12});
  assert.equal(calls[1].init.headers['Idempotency-Key'],'assign-key');
  assert.equal(calls[2].url, 'https://api.test/courier/shipments?scope=pending&offset=0&limit=100');
  assert.equal(calls[3].init.headers.Authorization,'Bearer courier');
  assert.equal(calls[3].init.headers['Idempotency-Key'],'delivery-key');
  assert.deepEqual(JSON.parse(calls[3].init.body), {proof_ids:[4,9]});
  assert.deepEqual(service.privateImageSource('courier',{url:'/shipment-delivery-proofs/4'}), {uri:'https://api.test/shipment-delivery-proofs/4',headers:{Authorization:'Bearer courier'}});
  assert.throws(() => service.privateImageSource('courier',{url:'https://evil.test/4'}));
});

test('Courier follows every next_offset page for the selected scope and removes repeated shipments', async () => {
  const calls = [];
  const firstPage = Array.from({ length: 100 }, (_, index) => ({ id: index + 1, order_id: index + 101, proofs: [] }));
  const service = createInspectionService({ baseUrl: 'https://api.test', fetch: async url => {
    calls.push(url);
    const offset = Number(new URL(url).searchParams.get('offset'));
    return offset === 0
      ? json(200, { items: firstPage, scope: 'history', offset: 0, limit: 100, has_more: true, next_offset: 100 })
      : json(200, { items: [firstPage[99], { id: 101, order_id: 201, proofs: [] }], scope: 'history', offset: 100, limit: 100, has_more: false, next_offset: null });
  } });

  const result = await service.courierShipments('courier', 'history');
  assert.deepEqual(calls, [
    'https://api.test/courier/shipments?scope=history&offset=0&limit=100',
    'https://api.test/courier/shipments?scope=history&offset=100&limit=100',
  ]);
  assert.equal(result.items.length, 101);
  assert.equal(result.items[100].id, 101);
  assert.equal(result.scope, 'history');
  assert.equal(result.offset, 0);
  assert.equal(result.has_more, false);
  assert.equal(result.next_offset, null);
});

test('Courier rejects a non-advancing pagination cursor instead of looping', async () => {
  const service = createInspectionService({ baseUrl: 'https://api.test', fetch: async () =>
    json(200, { items: [], scope: 'pending', offset: 0, limit: 100, has_more: true, next_offset: 0 }) });
  await assert.rejects(service.courierShipments('courier'), error => error.code === 'invalid_pagination');
});

test('public certificate read needs no session and sends no bearer token', async () => {
  let request;
  const service = createInspectionService({ baseUrl:'https://api.test', fetch:async (url, init) => {request={url,init};return json(200,{certificate_no:'C1',result:'PASS',issued_at:'2026-09-28T00:00:00Z',status:'ISSUED'});} });
  const result=await service.publicCertificate('opaque-token');
  assert.equal(result.certificate_no,'C1');
  assert.equal(result.status, 'ISSUED');
  assert.equal(request.url,'https://api.test/certificates/opaque-token/json');
  assert.equal(request.init.headers.Authorization,undefined);
});

test('buyer inspection decision posts the documented payload to the protected route', async () => {
  let request;
  const service = createInspectionService({ baseUrl:'https://api.test', fetch:async (url, init) => {
    request = { url, init };
    return json(200, { decision: { decision: 'REJECT', reason: 'สภาพไม่ตรง', decided_at: '2026-09-29T00:00:00Z' }, next_action: 'RETURN_TO_SELLER' });
  } });
  const result = await service.decideBuyerInspection('buyer-token', 42, { decision: 'REJECT', reason: 'สภาพไม่ตรง' });
  assert.equal(request.url, 'https://api.test/orders/42/inspection/decision');
  assert.equal(request.init.method, 'POST');
  assert.equal(request.init.headers.Authorization, 'Bearer buyer-token');
  assert.deepEqual(JSON.parse(request.init.body), { decision: 'REJECT', reason: 'สภาพไม่ตรง' });
  assert.equal(result.next_action, 'RETURN_TO_SELLER');
});

test('evidence and proof uploads without a readable file fail as local_file_unreadable, never network_error', async () => {
  let calls = 0;
  const service = createInspectionService({ baseUrl: 'https://api.test', fetch: async () => { calls += 1; return json(201, {}); } });
  for (const method of ['upload', 'uploadProof']) {
    await assert.rejects(service[method]('tok', 4, { uri: 'file:///missing.jpg', name: 'missing.jpg', type: 'image/jpeg' }, 'key-12345678'),
      error => error instanceof InspectionServiceError && error.status === 422 && error.code === 'local_file_unreadable');
  }
  assert.equal(calls, 0);
});
