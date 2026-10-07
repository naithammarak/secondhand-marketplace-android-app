/**
 * UI2 API smoke (test-only). Real mobile fulfillment-service + inspection-service +
 * order-service against a local PR130 API on an owned PostgreSQL. Setup (signup,
 * seller approval, products, payment) uses normal API calls; no terminal seeds.
 * Run from mobile/: API=http://127.0.0.1:8081 node <this file>
 */
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createFulfillmentService } from '../../../../mobile/src/services/fulfillment-service.ts';
import { createInspectionService } from '../../../../mobile/src/services/inspection-service.ts';
import { createOrderService } from '../../../../mobile/src/services/order-service.ts';
import { canReportNotReceived, isBuyerSettlement } from '../../../../mobile/src/fulfillment/contract.ts';

const API = process.env.API ?? 'http://127.0.0.1:8091';
const DB = process.env.DB_CONTAINER ?? 'e-ui-integration-pg-20261003';
const SECRET = 'test-secret-key-for-jwt-testing-12345678901234567890'; // public backend test constant
const ISSUER = 'https://example-project.supabase.co/auth/v1';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const ship = createFulfillmentService({ baseUrl: API });
const inspection = createInspectionService({ baseUrl: API });
const orders = createOrderService({ baseUrl: API });
const results = [];
const evidence = {};
const key = () => randomUUID();
const REASON = 'ตรวจสอบเคสตามหลักฐานที่ระบบออกให้';

const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
function jwt(sub, email) {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ sub, email, aud: 'authenticated', iss: ISSUER, exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${head}.${body}.${createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url')}`;
}
async function http(method, path, token, body, idem, form) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (idem) headers['Idempotency-Key'] = idem;
  if (body !== undefined && !form) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${API}${path}`, { method, headers, body: form ?? (body === undefined ? undefined : JSON.stringify(body)) });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok) throw Object.assign(new Error(`${method} ${path} -> ${response.status} ${text}`), { status: response.status, code: json?.detail?.code });
  return json;
}
async function rejects(promise, status, code) {
  try { await promise; } catch (error) {
    assert.equal(error.status, status, error.message); if (code) assert.equal(error.code, code, error.message); return error;
  }
  assert.fail(`expected ${status} ${code ?? ''}`);
}
async function step(name, fn) {
  try { await fn(); results.push({ name, result: 'PASS' }); console.log(`PASS  ${name}`); }
  catch (error) { results.push({ name, result: 'FAIL', error: String(error?.message ?? error) }); console.log(`FAIL  ${name}\n      ${error?.stack ?? error}`); }
}
const sql = statement => execFileSync('podman', ['exec', DB, 'psql', '-U', 'postgres', '-d', process.env.DB_NAME ?? 'eui', '-tAc', statement]).toString().trim();
async function login(label) {
  const sub = randomUUID();
  const token = jwt(sub, `${label}-${sub.slice(0, 6)}@example.test`);
  const user = await http('POST', '/auth/google', token, {});
  return { token, id: user.id, label };
}
async function approveSeller(user, admin) {
  const form = new FormData();
  form.append('shop_name', `ร้าน ${user.label}`); form.append('bank_name', 'ธนาคารทดสอบ'); form.append('bank_account_name', 'ผู้ขาย ทดสอบ');
  form.append('bank_account_number', '1234567890'); form.append('id_card_image', new Blob([PNG], { type: 'image/png' }), 'id.png');
  const record = await http('POST', '/verifications', user.token, undefined, undefined, form);
  const queue = await http('GET', '/admin/verifications?status=PENDING', admin.token);
  assert.ok(JSON.stringify(queue).includes(`"id":${record.id}`), 'Admin sees the pending application');
  await http('POST', `/admin/verifications/${record.id}/decision`, admin.token, { decision: 'APPROVED' });
  assert.equal((await http('GET', '/auth/me', user.token)).role, 'SELLER');
}
async function product(seller, name) {
  const form = new FormData(); form.append('file', new Blob([PNG], { type: 'image/png' }), 'p.png');
  const upload = await http('POST', '/products/images/upload', seller.token, undefined, undefined, form);
  const created = await http('POST', '/products', seller.token, { product_name: name, description: 'สินค้าทดสอบ UI2', price: '1200.00', category_id: 1, brand_id: 1,
    size: 'M', condition: 'GOOD', sale_type: 'FIXED_PRICE', images: [{ upload_id: upload.data.upload_id }] }, key());
  return created.id ?? created.data?.id;
}
const ADDRESS = { recipientName: 'ผู้ซื้อ ทดสอบ', phone: '0812345678', addressLine: '99/1 ถนนทดสอบ', subdistrict: 'แขวงทดสอบ', district: 'เขตทดสอบ', province: 'กรุงเทพมหานคร', postalCode: '10110' };
const RETURN = { recipient_name: 'ผู้ขาย ทดสอบ', phone: '0899999999', address_line: '1 ถนนคืน', subdistrict: 'แขวงคืน', district: 'เขตคืน', province: 'กรุงเทพมหานคร', postal_code: '10200' };

/** Paid Order already shipped to center by its Seller (normal API path). */
async function toCenter(buyer, seller, name) {
  const productId = await product(seller, name);
  const order = await orders.createOrder(buyer.token, { productId, address: ADDRESS, idempotencyKey: key() });
  await orders.simulatePayment(buyer.token, { orderId: order.id, outcome: 'SUCCESS', idempotencyKey: key() });
  await ship.saveReturnAddress(seller.token, order.id, RETURN, key());
  await inspection.ship(seller.token, order.id, { carrier: 'Kerry Express', tracking_number: `in-${order.id}` }, key());
  const queue = await inspection.list(inspector.token, 0, 'SHIPPING_TO_CENTER');
  const work = queue.items.find(item => item.order_id === order.id);
  assert.ok(work);
  return { orderId: order.id, workId: work.id };
}
async function inspect(workId, result) {
  const received = await inspection.receive(inspector.token, workId, null, key());
  assert.equal(received.order_status, 'RECEIVED_AT_CENTER');
  await inspection.start(inspector.token, workId, key());
  const form = new FormData(); form.append('file', new Blob([PNG], { type: 'image/png' }), 'e.png');
  const upload = await http('POST', `/inspections/${workId}/evidence`, inspector.token, undefined, key(), form);
  return inspection.result(inspector.token, workId, { result, summary: 'ผลตรวจจากหลักฐานจริงสำหรับ UI2 smoke', evidence_ids: [upload.evidence.id] }, key());
}

const admin = await login('admin');
const inspector = await login('inspector');
const inspector2 = await login('inspector2');
sql(`update users set role='ADMIN' where id=${admin.id}`);
sql(`update users set role='INSPECTOR' where id in (${inspector.id}, ${inspector2.id})`);
const buyer = await login('buyer');
const seller = await login('seller');
await approveSeller(seller, admin);

await step('Inspector: actual center receipt without provider/courier event, private evidence, positive result issues certificate before Buyer decision', async () => {
  const { orderId, workId } = await toCenter(buyer, seller, 'สินค้า PASS');
  const detailBefore = await inspection.detail(inspector.token, workId);
  assert.equal(detailBefore.shipment.courier_delivered_at, null, 'no courier/provider arrival needed');
  const done = await inspect(workId, 'PASS');
  assert.equal(done.certificate.status, 'ISSUED');
  assert.equal(done.next_action, 'WAIT_BUYER_DECISION');
  assert.equal(done.can_create_fulfillment, false, 'no outbound before Buyer decision');
  assert.equal(Date.parse(done.result_decision_deadline_at) - Date.parse(done.result_available_at), 72 * 3600_000);
  await rejects(inspection.detail(inspector2.token, workId), 404); // assigned Inspector scope
  const buyerView = await inspection.getBuyerResult(buyer.token, orderId);
  assert.ok(buyerView.can_decide && buyerView.server_time && buyerView.result_decision_deadline_at, 'UI2-00 result window fields reach Buyer');
  const photo = buyerView.evidence[0].url;
  await rejects(http('GET', photo, seller.token), 404); // private evidence: Seller cannot read
  evidence.positive = { orderId, workId, certificate: done.certificate.certificate_no, publicUrl: done.certificate.public_url };
});

await step('Inspector outbound: carrier/tracking only, server leg, replay vs changed payload, Admin TO_BUYER event is not receipt, Buyer report before deadline', async () => {
  const { orderId, workId } = evidence.positive;
  await inspection.decideBuyerInspection(buyer.token, orderId, { decision: 'CONFIRM' });
  const ready = await inspection.detail(inspector.token, workId);
  assert.equal(ready.can_create_fulfillment, true);
  assert.equal(ready.next_action, 'SHIP_TO_BUYER');
  const attempt = key();
  const first = await ship.createFulfillment(inspector.token, orderId, { carrier: ' Flash Express ', tracking_number: ' th-0001 x ' }, attempt);
  assert.equal(first.result.shipment.leg, 'TO_BUYER');
  assert.equal(first.result.shipment.tracking_number, 'th-0001 x');
  const replay = await ship.createFulfillment(inspector.token, orderId, { carrier: 'Flash Express', tracking_number: 'th-0001 x' }, attempt);
  assert.equal(replay.replayed, true);
  await rejects(ship.createFulfillment(inspector.token, orderId, { carrier: 'Other', tracking_number: 'x' }, attempt), 409, 'idempotency_key_reused');
  await rejects(ship.createFulfillment(seller.token, orderId, { carrier: 'x', tracking_number: 'y' }, key()), 403);
  let view = await ship.getDelivery(buyer.token, orderId);
  assert.equal(canReportNotReceived(view), true, 'report allowed after dispatch before any event');
  const outbound = view.shipments.find(item => item.leg === 'TO_BUYER');
  const event = await ship.recordShippingEvent(admin.token, outbound.id, { leg: 'TO_BUYER', event: 'DELIVERED', event_id: `ui2-${randomUUID().slice(0, 8)}` }, key());
  assert.equal(event.result.recipient_confirmed, false);
  assert.equal(event.result.source, 'ADMIN_DEMO');
  view = await ship.getDelivery(buyer.token, orderId);
  const leg = view.shipments.find(item => item.leg === 'TO_BUYER');
  assert.ok(leg.transport_delivered_at && leg.simulated_transport && leg.recipient_received_at === null, 'transport fact is not recipient receipt');
  assert.equal(Date.parse(view.receipt_deadline_at) - Date.parse(event.result.confirmed_at), 72 * 3600_000);
  await rejects(ship.recordShippingEvent(admin.token, outbound.id, { leg: 'TO_SELLER', event: 'DELIVERED', event_id: `ui2-${randomUUID().slice(0, 8)}` }, key()), 409, 'shipping_leg_mismatch');
  await rejects(ship.recordShippingEvent(buyer.token, outbound.id, { leg: 'TO_BUYER', event: 'DELIVERED', event_id: `ui2-${randomUUID().slice(0, 8)}` }, key()), 403);
  const report = await ship.reportNotReceived(buyer.token, orderId, 'ยังไม่ได้รับพัสดุแม้ขนส่งแจ้งว่าส่งถึง', key());
  assert.equal(report.result.order_status, 'DELIVERY_DISPUTED');
  evidence.disputedRefund = orderId;
});

await step('Admin non-receipt: list → audited review → issued refs → REFUND full 1350, no Seller payout; invented ref 422; second resolution 409', async () => {
  const orderId = evidence.disputedRefund;
  await rejects(ship.listDeliveryCases(buyer.token), 403);
  const cases = await ship.listDeliveryCases(admin.token);
  assert.ok(cases.items.some(item => item.order_id === orderId));
  await rejects(ship.resolveDelivery(admin.token, orderId, { resolution: 'REFUND', reason: REASON, evidence_refs: ['delivery-audit:1'] }, key()), 409, 'delivery_review_required');
  const review = (await ship.reviewDelivery(admin.token, orderId, REASON, key())).result;
  assert.equal(review.report.reason, 'ยังไม่ได้รับพัสดุแม้ขนส่งแจ้งว่าส่งถึง');
  await rejects(ship.resolveDelivery(admin.token, orderId, { resolution: 'REFUND', reason: REASON, evidence_refs: ['delivery-audit:999999'] }, key()), 422, 'invalid_evidence_reference');
  const resolved = await ship.resolveDelivery(admin.token, orderId, { resolution: 'REFUND', reason: REASON, evidence_refs: [review.report.reference, review.audit_reference] }, key());
  assert.equal(resolved.result.order_status, 'REFUNDED');
  await rejects(ship.resolveDelivery(admin.token, orderId, { resolution: 'RELEASE', reason: REASON, evidence_refs: [review.audit_reference] }, key()), 409);
  const buyerView = await ship.getDelivery(buyer.token, orderId);
  assert.ok(isBuyerSettlement(buyerView.settlement));
  assert.equal(buyerView.settlement.buyer_refund, '1350.00');
  const sellerView = await ship.getDelivery(seller.token, orderId);
  assert.equal(sellerView.settlement.seller_payout, '0.00');
  assert.equal(sellerView.settlement.commission_amount, '0.00');
  assert.equal(sellerView.missing_report, null, 'Seller does not see the private report');
  evidence.refund = { buyer: buyerView.settlement, seller: sellerView.settlement };
});

await step('Admin non-receipt RELEASE: one settlement, Seller 1140 / commission 60, no Buyer refund', async () => {
  const { orderId, workId } = await toCenter(buyer, seller, 'สินค้า RELEASE');
  await inspect(workId, 'PASS');
  await inspection.decideBuyerInspection(buyer.token, orderId, { decision: 'CONFIRM' });
  await ship.createFulfillment(inspector.token, orderId, { carrier: 'Demo', tracking_number: `out-${orderId}` }, key());
  await ship.reportNotReceived(buyer.token, orderId, 'ยังไม่ได้รับพัสดุตามเลขติดตามที่แจ้ง', key());
  const review = (await ship.reviewDelivery(admin.token, orderId, REASON, key())).result;
  const resolved = await ship.resolveDelivery(admin.token, orderId, { resolution: 'RELEASE', reason: REASON, evidence_refs: [review.audit_reference] }, key());
  assert.equal(resolved.result.order_status, 'COMPLETED');
  const sellerView = await ship.getDelivery(seller.token, orderId);
  assert.deepEqual([sellerView.settlement.seller_payout, sellerView.settlement.commission_amount], ['1140.00', '60.00']);
  assert.equal((await ship.getDelivery(buyer.token, orderId)).settlement.buyer_refund, '0.00');
  evidence.release = sellerView.settlement;
});

await step('Negative result: no certificate/decision, outbound TO_SELLER; Admin event on return does not refund; audited Admin return exception commits actual return then full refund', async () => {
  const { orderId, workId } = await toCenter(buyer, seller, 'สินค้า NOT_AS_DESCRIBED');
  const done = await inspect(workId, 'NOT_AS_DESCRIBED');
  assert.equal(done.certificate, null);
  assert.equal(done.next_action, 'RETURN_TO_SELLER');
  assert.equal(done.can_create_fulfillment, true);
  await rejects(inspection.decideBuyerInspection(buyer.token, orderId, { decision: 'CONFIRM' }), 409, 'decision_not_allowed');
  const out = await ship.createFulfillment(inspector.token, orderId, { carrier: 'Demo', tracking_number: `ret-${orderId}` }, key());
  assert.equal(out.result.shipment.leg, 'TO_SELLER');
  await ship.recordShippingEvent(admin.token, out.result.shipment.id, { leg: 'TO_SELLER', event: 'DELIVERED', event_id: `ui2-${randomUUID().slice(0, 8)}` }, key());
  let view = await ship.getDelivery(buyer.token, orderId);
  assert.equal(view.order_status, 'RESULT_NOTIFIED', 'transport event never returns or refunds');
  assert.equal(view.settlement, null);
  const detail = await ship.getAdminOrder(admin.token, orderId);
  assert.ok(detail.shipments.some(item => item.leg === 'TO_SELLER'));
  const review = (await ship.reviewReturn(admin.token, orderId, REASON, key())).result;
  assert.deepEqual([...review.evidence_refs].sort(), [`delivery-audit:${review.evidence_refs.find(ref => ref.startsWith('delivery-audit')).split(':')[1]}`, `return-shipment:${out.result.shipment.id}`].sort());
  await rejects(ship.confirmAdminReturn(admin.token, orderId, { reason: REASON, evidence_refs: ['delivery-audit:999999', `return-shipment:${out.result.shipment.id}`] }, key()), 422, 'invalid_evidence_reference');
  const committed = await ship.confirmAdminReturn(admin.token, orderId, { reason: REASON, evidence_refs: review.evidence_refs }, key());
  assert.equal(committed.result.recipient_source, 'ADMIN');
  assert.equal(committed.result.settlement_attempt, 'SEPARATE');
  view = await ship.getDelivery(buyer.token, orderId);
  assert.ok(['REFUNDED', 'RETURNED_TO_SELLER'].includes(view.order_status));
  evidence.adminReturn = { status: view.order_status, pending: view.pending_processing, refund: view.settlement?.buyer_refund ?? null };
  if (view.order_status === 'REFUNDED') assert.equal(view.settlement.buyer_refund, '1350.00');
  await rejects(ship.confirmReturn(seller.token, orderId, key()), 409);
});

await step('D certificate: public JSON has 4 fields/no PII; Admin revoke with reason + replay; REVOKED publicly; result and settlement history unchanged', async () => {
  const token = new URL(evidence.positive.publicUrl).pathname.split('/').pop();
  const before = await inspection.publicCertificate(token);
  assert.deepEqual(Object.keys(before).sort(), ['certificate_no', 'issued_at', 'result', 'status']);
  assert.equal(before.status, 'ISSUED');
  await rejects(inspection.publicCertificate('x'.repeat(32)), 404, 'certificate_not_found');
  const list = await inspection.adminCertificates(admin.token);
  const cert = list.items.find(item => item.certificate_no === evidence.positive.certificate);
  const revokeKey = key();
  const revoked = await inspection.revokeCertificate(admin.token, cert.id, 'เพิกถอนเพื่อทดสอบการตรวจสอบภายใน', revokeKey);
  const replay = await inspection.revokeCertificate(admin.token, cert.id, 'เพิกถอนเพื่อทดสอบการตรวจสอบภายใน', revokeKey);
  assert.equal(revoked.status, 'REVOKED'); assert.equal(replay.revoked_at, revoked.revoked_at);
  const after = await inspection.publicCertificate(token);
  assert.equal(after.status, 'REVOKED');
  assert.ok(!JSON.stringify(after).includes('ทดสอบการตรวจสอบภายใน'), 'private reason not public');
  const html = await (await fetch(`${API}/certificates/${token}`)).text();
  assert.ok(!html.includes('ทดสอบการตรวจสอบภายใน') && !html.includes('@example.test'));
  const result = await inspection.getBuyerResult(buyer.token, evidence.positive.orderId);
  assert.equal(result.result, 'PASS');
  assert.equal(result.decision.decision, 'CONFIRM');
  const settled = await ship.getDelivery(buyer.token, evidence.positive.orderId);
  assert.equal(settled.settlement.buyer_refund, '1350.00', 'revoke does not reverse settlement');
  await rejects(inspection.revokeCertificate(buyer.token, cert.id, 'พยายามเพิกถอนโดยไม่มีสิทธิ์', key()), 403);
});

await step('Wrong role/account: Buyer/Seller/Inspector blocked from Admin and staff actions; other Buyer cannot read delivery', async () => {
  const other = await login('otherbuyer');
  await rejects(ship.getDelivery(other.token, evidence.disputedRefund), 404);
  await rejects(ship.reviewDelivery(inspector.token, evidence.disputedRefund, REASON, key()), 403);
  await rejects(inspection.list(buyer.token), 403);
  await rejects(ship.getAdminOrder(seller.token, evidence.disputedRefund), 403);
});

const passed = results.filter(item => item.result === 'PASS').length;
console.log(JSON.stringify({ api: API, passed, total: results.length, results, evidence }, null, 2));
process.exit(passed === results.length ? 0 : 1);
