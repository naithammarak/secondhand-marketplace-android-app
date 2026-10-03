import test from 'node:test';
import assert from 'node:assert/strict';
import { createInspectionService } from '../src/services/inspection-service.ts';

function service(body = {}) {
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url, body: init.body ? JSON.parse(init.body) : undefined }); return new Response(JSON.stringify(body), { status: 200 }); };
  return { calls, client: createInspectionService({ baseUrl: 'http://api.test', fetch }) };
}

test('center receive sends {} without a note and never needs a courier proof field', async () => {
  const { calls, client } = service({ id: 1 });
  await client.receive('tok', 4, null, 'receive-key-01');
  await client.receive('tok', 4, '  รับจริงที่ศูนย์  ', 'receive-key-02');
  assert.deepEqual(calls.map(call => call.body), [{}, { note: 'รับจริงที่ศูนย์' }]);
});

test('Buyer result keeps window, timeout, policy and server_time fields unchanged', async () => {
  const payload = { order_id: 7, result: 'PASS', can_decide: true, fulfillment_policy: 'EXTERNAL_V2', result_available_at: '2026-10-05T10:00:00Z',
    result_decision_deadline_at: '2026-10-08T10:00:00Z', result_timed_out_at: null, server_time: '2026-10-05T11:00:00Z', next_action: 'WAIT_BUYER_DECISION' };
  const { client } = service(payload);
  assert.deepEqual(await client.getBuyerResult('tok', 7), payload);
});

test('Buyer decision keeps the existing content-replay contract (no Idempotency-Key)', async () => {
  const calls = [];
  const client = createInspectionService({ baseUrl: 'http://api.test', fetch: async (_url, init) => { calls.push(init); return new Response('{"decision":{}}', { status: 200 }); } });
  await client.decideBuyerInspection('tok', 7, { decision: 'REJECT', reason: 'สภาพไม่ตรง' });
  assert.equal(calls[0].headers['Idempotency-Key'], undefined);
  assert.deepEqual(JSON.parse(calls[0].body), { decision: 'REJECT', reason: 'สภาพไม่ตรง' });
});
