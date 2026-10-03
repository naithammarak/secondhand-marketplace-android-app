import test from 'node:test';
import assert from 'node:assert/strict';
import { carrierBody, createFulfillmentService, FulfillmentServiceError } from '../src/services/fulfillment-service.ts';
import { canReportNotReceived } from '../src/fulfillment/contract.ts';
import { deliveryFixtures } from '../src/fulfillment/fixtures.ts';

function recorder(respond = () => ({ status: 200, body: { ok: true } })) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : undefined });
    const { status, body, headers = {} } = respond(url, init);
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
  };
  return { calls, service: createFulfillmentService({ baseUrl: 'http://api.test/ignored', fetch, timeoutMs: 50 }) };
}
const KEY = 'attempt-key-0001';

test('reads use Bearer token, no-store and exact paths', async () => {
  const { calls, service } = recorder(() => ({ status: 200, body: deliveryFixtures.shippingNoEventBuyer }));
  const view = await service.getDelivery('tok-a', 7);
  await service.getHistory('tok-a', 7, { offset: 100 });
  await service.listDeliveryCases('tok-a');
  assert.equal(view.order_status, 'SHIPPING_TO_BUYER');
  assert.deepEqual(calls.map(call => call.url), ['http://api.test/orders/7/delivery', 'http://api.test/orders/7/history?limit=100&offset=100', 'http://api.test/admin/delivery-cases?limit=20&offset=0']);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok-a');
  assert.equal(calls[0].init.cache, 'no-store');
});

test('mutations send the caller key and canonical strict bodies', async () => {
  const { calls, service } = recorder(() => ({ status: 200, body: {}, headers: { 'Idempotent-Replayed': 'true' } }));
  const out = await service.createFulfillment('tok', 7, { carrier: '  Kerry Express ', tracking_number: ' kx-001 99 ' }, KEY);
  assert.equal(out.replayed, true);
  await service.reportNotReceived('tok', 7, '  ยังไม่ได้รับพัสดุตามเลขติดตาม  ', KEY);
  await service.confirmReceipt('tok', 7, KEY);
  await service.confirmReturn('tok', 7, KEY);
  await service.recordShippingEvent('tok', 13, { leg: 'TO_SELLER', event: 'DELIVERED', event_id: 'demo-delivered-001' }, KEY);
  await service.resolveDelivery('tok', 7, { resolution: 'REFUND', reason: 'ตรวจหลักฐานแล้วไม่พบการส่งถึง', evidence_refs: ['delivery-report:91', 'delivery-audit:23'] }, KEY);
  await service.confirmAdminReturn('tok', 7, { reason: 'ผู้ขายยืนยันทางโทรศัพท์และมีหลักฐาน', evidence_refs: ['return-shipment:13', 'delivery-audit:24'] }, KEY);
  await service.saveReturnAddress('tok', 7, { recipient_name: 'ผู้ขาย', phone: '0899999999', address_line: '1', subdistrict: 'a', district: 'b', province: 'c', postal_code: '10200' }, KEY);
  assert.deepEqual(calls[0].body, { carrier: 'Kerry Express', tracking_number: 'kx-001 99' }, 'trim only, no case/format change');
  assert.deepEqual(calls[1].body, { reason: 'ยังไม่ได้รับพัสดุตามเลขติดตาม' });
  assert.deepEqual(calls[2].body, {});
  assert.deepEqual(calls[3].body, {});
  assert.deepEqual(calls[4].body, { leg: 'TO_SELLER', event: 'DELIVERED', event_id: 'demo-delivered-001' });
  assert.deepEqual(calls[5].body.evidence_refs, ['delivery-audit:23', 'delivery-report:91'], 'sorted canonical refs');
  assert.deepEqual(calls[6].body.evidence_refs, ['delivery-audit:24', 'return-shipment:13']);
  assert.equal(calls[7].init.method, 'PUT');
  for (const call of calls) assert.equal(call.init.headers['Idempotency-Key'], KEY);
  assert.ok(!('leg' in calls[0].body) && !('destination' in calls[0].body), 'no client leg/destination');
});

test('invalid input is rejected locally without a request', async () => {
  const { calls, service } = recorder();
  await assert.rejects(service.reportNotReceived('tok', 7, 'สั้นไป', KEY), error => error.status === 422 && 'reason' in error.fields);
  await assert.rejects(service.reportNotReceived('tok', 7, 'ก'.repeat(1001), KEY), FulfillmentServiceError);
  await assert.rejects(service.createFulfillment('tok', 7, { carrier: '   ', tracking_number: 'x' }, KEY), error => 'carrier' in error.fields);
  await assert.rejects(service.createFulfillment('tok', 7, { carrier: 'x', tracking_number: 'y'.repeat(101) }, KEY), error => 'tracking_number' in error.fields);
  await assert.rejects(service.confirmReceipt('tok', 7, 'short'), error => 'Idempotency-Key' in error.fields);
  await assert.rejects(service.recordShippingEvent('tok', 1, { leg: 'TO_BUYER', event: 'DELIVERED', event_id: 'bad id!' }, KEY), error => 'event_id' in error.fields);
  await assert.rejects(service.resolveDelivery('tok', 7, { resolution: 'RELEASE', reason: 'เหตุผลยาวพอสำหรับตรวจ', evidence_refs: ['made-up:1'] }, KEY), error => 'evidence_refs' in error.fields);
  await assert.rejects(service.resolveDelivery('tok', 7, { resolution: 'BOTH', reason: 'เหตุผลยาวพอสำหรับตรวจ', evidence_refs: ['delivery-audit:1'] }, KEY), error => 'resolution' in error.fields);
  await assert.rejects(service.confirmAdminReturn('tok', 7, { reason: 'เหตุผลยาวพอสำหรับตรวจ', evidence_refs: ['delivery-audit:1'] }, KEY), error => 'evidence_refs' in error.fields);
  assert.equal(calls.length, 0);
  assert.deepEqual(carrierBody({ carrier: ' ไปรษณีย์ไทย ', tracking_number: 'EF123TH' }), { carrier: 'ไปรษณีย์ไทย', tracking_number: 'EF123TH' });
});

test('server errors keep status, code and fields; uncertain only for network/5xx', async () => {
  const responses = [
    { status: 409, body: { detail: { code: 'receipt_deadline_passed', message: 'x' } } },
    { status: 403, body: { detail: { code: 'shipping_demo_disabled' } } },
    { status: 422, body: { detail: { code: 'validation_error', fields: { reason: 'bad' } } } },
    { status: 422, body: { detail: [{ loc: ['body', 'x'], msg: 'extra' }] } },
    { status: 503, body: { detail: { code: 'storage_unavailable' } } },
  ];
  let index = 0;
  const { service } = recorder(() => responses[index++]);
  const outcomes = [];
  for (let i = 0; i < responses.length; i++) outcomes.push(await service.confirmReceipt('tok', 7, KEY).catch(error => error));
  assert.deepEqual(outcomes.map(error => [error.status, error.code, error.uncertain]), [
    [409, 'receipt_deadline_passed', false], [403, 'shipping_demo_disabled', false], [422, 'validation_error', false], [422, 'validation_error', false], [503, 'storage_unavailable', true],
  ]);
  assert.deepEqual(outcomes[2].fields, { reason: 'bad' });
});

test('network failure and timeout surface as status 0 (refetch, then retry same key)', async () => {
  const failing = createFulfillmentService({ baseUrl: 'http://api.test', fetch: async () => { throw new TypeError('offline'); } });
  await assert.rejects(failing.confirmReturn('tok', 7, KEY), error => error.status === 0 && error.code === 'network_error' && error.uncertain);
  const slow = createFulfillmentService({ baseUrl: 'http://api.test', timeoutMs: 20, fetch: (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('abort')))) });
  await assert.rejects(slow.confirmReturn('tok', 7, KEY), error => error.status === 0 && error.code === 'timeout');
});

test('missing origin or token never sends a request', async () => {
  const none = createFulfillmentService({});
  await assert.rejects(none.getDelivery('tok', 7), error => error.status === 503);
  const { calls, service } = recorder();
  await assert.rejects(service.getDelivery('', 7), error => error.status === 401);
  assert.equal(calls.length, 0);
  assert.throws(() => createFulfillmentService({ baseUrl: 'ftp://x' }));
});

test('report flag helper reads the PR130 server name', () => {
  assert.equal(canReportNotReceived(deliveryFixtures.shippingNoEventBuyer), true);
  assert.equal(canReportNotReceived({ can_report_missing: false, can_report_not_received: true }), true);
  assert.equal(deliveryFixtures.returningSeller.refund_quote, null, 'Seller projection has no Buyer quote');
  assert.equal(deliveryFixtures.disputedSeller.missing_report, null, 'Seller never sees the private report');
});
