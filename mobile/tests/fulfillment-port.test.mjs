import test from 'node:test';
import assert from 'node:assert/strict';
import { createFulfillmentPort } from '../src/orders/fulfillment-port.ts';
import { createFulfillmentService } from '../src/services/fulfillment-service.ts';

function setup(reply = () => ({ status: 200, body: { ok: true } })) {
  const requests = [];
  let token = 'account-a';
  const service = createFulfillmentService({ baseUrl: 'https://api.test', fetch: async (url, init) => {
    requests.push({ url, ...init, json: init.body ? JSON.parse(init.body) : undefined });
    const { status, body } = reply();
    return new Response(JSON.stringify(body), { status });
  } });
  const port = createFulfillmentPort(service, request => request(token));
  return { port, requests, switchAccount: () => { token = 'account-b'; } };
}

test('UI1 reads use UI2 client paths and the current authorization on each call', async () => {
  const { port, requests, switchAccount } = setup();
  assert.deepEqual(await port.getDelivery(7), { ok: true });
  await port.getHistory(7);
  switchAccount();
  await port.getReturnAddress(8);
  assert.deepEqual(requests.map(r => r.url), [
    'https://api.test/orders/7/delivery', 'https://api.test/orders/7/history?limit=100&offset=0', 'https://api.test/orders/8/return-address',
  ]);
  assert.deepEqual(requests.map(r => r.headers.Authorization), ['Bearer account-a', 'Bearer account-a', 'Bearer account-b']);
});

test('receipt/return/report retain caller keys and accepted command bodies', async () => {
  const { port, requests } = setup();
  await port.confirmReceipt(7, 'receipt-key-001');
  await port.confirmReturn(8, 'return-key-001');
  await port.reportNotReceived(7, '  ยังไม่ได้รับสินค้าตามเลขพัสดุ  ', 'report-key-001');
  const address = { recipient_name: 'Seller', phone: '0899999999', address_line: '1', subdistrict: 'A', district: 'B', province: 'C', postal_code: '10200' };
  await port.saveReturnAddress(8, address, 'address-key-001');
  assert.deepEqual(requests.map(r => [r.method, r.json, r.headers['Idempotency-Key']]), [
    ['POST', {}, 'receipt-key-001'], ['POST', {}, 'return-key-001'],
    ['POST', { reason: 'ยังไม่ได้รับสินค้าตามเลขพัสดุ' }, 'report-key-001'], ['PUT', address, 'address-key-001'],
  ]);
});

test('an ambiguous command propagates its uncertainty and retries with the original key', async () => {
  let failed = false;
  const { port, requests } = setup(() => failed ? { status: 200, body: { order_id: 7 } } : (failed = true, { status: 503, body: { detail: { code: 'retry_later' } } }));
  await assert.rejects(port.confirmReceipt(7, 'receipt-key-001'), error => error.uncertain && error.code === 'retry_later');
  await port.confirmReceipt(7, 'receipt-key-001');
  assert.deepEqual(requests.map(r => r.headers['Idempotency-Key']), ['receipt-key-001', 'receipt-key-001']);
});
