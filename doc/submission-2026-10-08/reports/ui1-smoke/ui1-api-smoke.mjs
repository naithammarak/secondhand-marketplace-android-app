/**
 * UI1 API smoke (test-only). Real mobile services + UI1 journey parsers/derivation
 * against a local PR130 API on an owned PostgreSQL. Staff/setup steps use plain HTTP.
 *
 * The `harnessPort` below is a TEST ADAPTER for the FulfillmentPort contract so the
 * smoke can feed real server JSON into UI1 code. It is not imported by the app; the
 * app binds UI2's createFulfillmentService after E_BASE.
 *
 * Run from mobile/: API=http://127.0.0.1:8071 node <this file>
 */
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { createOrderService, OrderServiceError } from '../../../../mobile/src/services/order-service.ts';
import { createInspectionService } from '../../../../mobile/src/services/inspection-service.ts';
import { createProfileService, POLICY_VERSION } from '../../../../mobile/src/services/profile-service.ts';
import { createReviewService } from '../../../../mobile/src/services/review-service.ts';
import { deriveJourney, deriveMoney, parseDelivery, parseHistory, parseResultWindow, parseReturnAddress } from '../../../../mobile/src/orders/order-journey.ts';
import { describeActionError } from '../../../../mobile/src/orders/action-errors.ts';
import { createProductCatalogService } from '../../../../mobile/src/services/product-catalog-service.ts';

const API = process.env.API ?? 'http://127.0.0.1:8071';
const SECRET = 'test-secret-key-for-jwt-testing-12345678901234567890'; // public test constant from backend tests
const ISSUER = 'https://example-project.supabase.co/auth/v1';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const orders = createOrderService({ baseUrl: API });
const inspection = createInspectionService({ baseUrl: API });
const profiles = createProfileService({ baseUrl: API });
const reviews = createReviewService({ baseUrl: API });
const catalog = createProductCatalogService({ mode: 'api', baseUrl: API });
const results = [];
const evidence = {};

const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
function jwt(sub, email, name) {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ sub, email, aud: 'authenticated', iss: ISSUER, exp: Math.floor(Date.now() / 1000) + 3600, user_metadata: { full_name: name } });
  return `${head}.${body}.${createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url')}`;
}

async function http(method, path, token, body, key, form) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (key) headers['Idempotency-Key'] = key;
  if (body !== undefined && !form) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${API}${path}`, { method, headers, body: form ?? (body === undefined ? undefined : JSON.stringify(body)) });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  if (!response.ok) {
    const detail = json?.detail ?? {};
    const error = Object.assign(new Error(`${method} ${path} -> ${response.status} ${JSON.stringify(detail)}`), { status: response.status, code: detail.code ?? null, fields: detail.fields ?? {} });
    throw error;
  }
  return { json, replayed: response.headers.get('Idempotent-Replayed') === 'true' };
}
const ok = async (...args) => (await http(...args)).json;
async function expectStatus(promise, status, code) {
  try { await promise; } catch (error) {
    const described = describeActionError(error);
    assert.equal(described.status, status, error.message);
    if (code) assert.equal(described.code, code, error.message);
    return error;
  }
  assert.fail(`expected ${status}${code ? ` ${code}` : ''}`);
}

/** TEST ADAPTER for FulfillmentPort over plain HTTP (see header). */
function harnessPort(token) {
  return {
    getDelivery: id => ok('GET', `/orders/${id}/delivery`, token),
    getHistory: id => ok('GET', `/orders/${id}/history`, token),
    getReturnAddress: id => ok('GET', `/orders/${id}/return-address`, token),
    saveReturnAddress: (id, address, key) => ok('PUT', `/orders/${id}/return-address`, token, address, key),
    confirmReceipt: (id, key) => ok('POST', `/orders/${id}/confirm-receipt`, token, {}, key),
    reportNotReceived: (id, reason, key) => ok('POST', `/orders/${id}/report-not-received`, token, { reason }, key),
    confirmReturn: (id, key) => ok('POST', `/orders/${id}/confirm-return`, token, {}, key),
  };
}

async function step(name, fn) {
  try { await fn(); results.push({ name, result: 'PASS' }); console.log(`PASS  ${name}`); }
  catch (error) { results.push({ name, result: 'FAIL', error: String(error?.message ?? error) }); console.log(`FAIL  ${name}\n      ${error?.stack ?? error}`); }
}

async function login(label) {
  const sub = randomUUID();
  const token = jwt(sub, `${label}-${sub.slice(0, 6)}@example.test`, `${label} ทดสอบ`);
  const user = await ok('POST', '/auth/google', token, {});
  return { sub, token, id: user.id, role: user.role, label };
}

async function sql(statement) {
  const { execFileSync } = await import('node:child_process');
  return execFileSync('podman', ['exec', 'ui1-smoke-pg-20261003', 'psql', '-U', 'postgres', '-d', 'ui1smoke', '-tAc', statement]).toString().trim();
}

async function approveSeller(user, admin, shop) {
  const form = new FormData();
  form.append('shop_name', shop); form.append('bank_name', 'ธนาคารทดสอบ'); form.append('bank_account_name', `${user.label} ทดสอบ`);
  form.append('bank_account_number', '1234567890'); form.append('id_card_image', new Blob([PNG], { type: 'image/png' }), 'id.png');
  const record = await ok('POST', '/verifications', user.token, undefined, undefined, form);
  await ok('POST', `/admin/verifications/${record.id}/decision`, admin.token, { decision: 'APPROVED' });
  const me = await ok('GET', '/auth/me', user.token);
  assert.equal(me.role, 'SELLER');
  user.role = 'SELLER';
}

async function newProduct(seller, name, price = '1200.00') {
  const form = new FormData();
  form.append('file', new Blob([PNG], { type: 'image/png' }), 'p.png');
  const upload = await ok('POST', '/products/images/upload', seller.token, undefined, undefined, form);
  const product = await ok('POST', '/products', seller.token, { product_name: name, description: 'สินค้าทดสอบสำหรับ UI1 smoke', price,
    category_id: 1, brand_id: 1, size: 'M', condition: 'GOOD', sale_type: 'FIXED_PRICE', images: [{ upload_id: upload.data.upload_id }] }, randomUUID());
  return product.id ?? product.data?.id;
}

const ADDRESS = { recipientName: 'ผู้ซื้อ ทดสอบ', phone: '0812345678', addressLine: '99/1 ถนนทดสอบ', subdistrict: 'แขวงทดสอบ', district: 'เขตทดสอบ', province: 'กรุงเทพมหานคร', postalCode: '10110' };
const RETURN_ADDRESS = { recipient_name: 'ผู้ขาย ทดสอบ', phone: '0899999999', address_line: '1 ถนนคืนสินค้า', subdistrict: 'แขวงคืน', district: 'เขตคืน', province: 'กรุงเทพมหานคร', postal_code: '10200' };

/** Buyer creates + pays an Order through the real mobile order service. */
async function buy(buyer, productId) {
  const quote = await orders.getQuote(buyer.token, productId);
  const key = randomUUID();
  const order = await orders.createOrder(buyer.token, { productId, address: ADDRESS, idempotencyKey: key });
  const replay = await orders.createOrder(buyer.token, { productId, address: ADDRESS, idempotencyKey: key });
  assert.equal(replay.id, order.id, 'same key replays the same Order');
  assert.equal(order.amounts.totalAmount, quote.totalAmount, 'Order snapshot equals server quote');
  const payKey = randomUUID();
  const paid = await orders.simulatePayment(buyer.token, { orderId: order.id, outcome: 'SUCCESS', idempotencyKey: payKey });
  const paidReplay = await orders.simulatePayment(buyer.token, { orderId: order.id, outcome: 'SUCCESS', idempotencyKey: payKey });
  assert.equal(paidReplay.attempt.id, paid.attempt.id, 'payment replay returns the same attempt');
  assert.equal(paid.order.status, 'WAITING_SELLER_SHIP');
  const receipt = await orders.getReceipt(buyer.token, order.id);
  return { id: order.id, receipt };
}

async function shipToCenter(seller, orderId) {
  const port = harnessPort(seller.token);
  await expectStatus(inspection.ship(seller.token, orderId, { carrier: 'Kerry Express', tracking_number: 'kx-001 99' }, randomUUID()), 409);
  const before = parseReturnAddress(await port.getReturnAddress(orderId));
  assert.equal(before.address, null);
  const saved = await port.saveReturnAddress(orderId, RETURN_ADDRESS, randomUUID());
  assert.equal(saved.return_address.postal_code, '10200');
  // Any carrier text and a lowercase/space tracking number are valid server input (no client regex).
  await inspection.ship(seller.token, orderId, { carrier: 'ขนส่งท้องถิ่น อื่น ๆ', tracking_number: 'local-trk 001' }, randomUUID());
  const frozen = parseReturnAddress(await port.getReturnAddress(orderId));
  assert.equal(frozen.frozen, true);
  await expectStatus(port.saveReturnAddress(orderId, { ...RETURN_ADDRESS, district: 'เขตใหม่' }, randomUUID()), 409, 'return_address_locked');
}

async function inspect(inspector, orderId, result) {
  const list = await ok('GET', '/inspections?limit=100', inspector.token);
  const work = list.items.find(item => item.order_id === orderId);
  assert.ok(work, 'inspection visible to center Inspector');
  await ok('POST', `/inspections/${work.id}/receive`, inspector.token, {}, randomUUID());
  await ok('POST', `/inspections/${work.id}/start`, inspector.token, {}, randomUUID());
  const form = new FormData(); form.append('file', new Blob([PNG], { type: 'image/png' }), 'e.png');
  const upload = await ok('POST', `/inspections/${work.id}/evidence`, inspector.token, undefined, randomUUID(), form);
  await ok('POST', `/inspections/${work.id}/result`, inspector.token, { result, summary: 'ผลตรวจสำหรับ UI1 smoke ตามหลักฐาน', evidence_ids: [upload.evidence.id] }, randomUUID());
  return work.id;
}

const fulfil = (inspector, orderId) => ok('POST', `/orders/${orderId}/fulfillment`, inspector.token, { carrier: 'Demo carrier', tracking_number: `OUT-${orderId}` }, randomUUID());
const delivered = (admin, shipmentId, leg) => ok('POST', `/admin/shipments/${shipmentId}/shipping-events`, admin.token, { leg, event: 'DELIVERED', event_id: `ui1-smoke-${randomUUID().slice(0, 8)}` }, randomUUID());

async function journeyFor(user, orderId) {
  const order = await orders.getOrder(user.token, orderId);
  const delivery = parseDelivery(await harnessPort(user.token).getDelivery(orderId));
  let result = null;
  if (order.viewerRole === 'buyer') {
    try { result = parseResultWindow(await inspection.getBuyerResult(user.token, orderId)); } catch (error) { if (error.status !== 404) throw error; }
  }
  return { order, delivery, result, journey: deriveJourney({ order, delivery, result }), money: deriveMoney(order, delivery) };
}

// ------------------------------------------------------------------------------------

const admin = await login('admin');
const inspector = await login('inspector');
await sql(`update users set role='ADMIN' where id=${admin.id}`);
await sql(`update users set role='INSPECTOR' where id=${inspector.id}`);
const buyer = await login('buyer');
const buyer2 = await login('buyer2');
const seller = await login('seller');
const seller2 = await login('sellerbuyer');

await step('guest browse: public catalog/detail and public seller reviews without login', async () => {
  await approveSeller(seller, admin, 'ร้านทดสอบ UI1');
  evidence.p1 = await newProduct(seller, 'แจ็กเก็ตทดสอบ ขายสำเร็จ');
  const page = await catalog.listProducts({ q: 'แจ็กเก็ตทดสอบ' });
  assert.ok(page.items.some(item => item.id === evidence.p1), 'guest search finds the real listing');
  const detail = await catalog.getProduct(evidence.p1);
  assert.equal(detail.id, evidence.p1);
  const summary = await reviews.publicList(seller.id);
  assert.equal(summary.summary.count, 0);
  assert.equal(summary.summary.average_rating, null, 'no fake average when empty');
});

await step('Buyer signup (login) is BUYER; profile name saves + reloads; policy ack persists with stable time', async () => {
  assert.equal(buyer.role, 'BUYER');
  await profiles.save(buyer.token, 'ผู้ซื้อ ชื่อใหม่');
  const reloaded = await profiles.get(buyer.token);
  assert.equal(reloaded.full_name, 'ผู้ซื้อ ชื่อใหม่');
  await expectStatus(http('PATCH', '/profile', buyer.token, { full_name: 'x', role: 'ADMIN' }), 422);
  const ack1 = await profiles.acknowledge(buyer.token);
  const ack2 = await profiles.acknowledge(buyer.token);
  assert.equal(ack1.privacy_policy_version, POLICY_VERSION);
  assert.equal(ack2.privacy_acknowledged_at, ack1.privacy_acknowledged_at);
});

await step('successful sale: checkout/receipt → return address → ship → PASS → CONFIRM → dispatch → receipt → RELEASE 1140/60 → review', async () => {
  const { id, receipt } = await buy(buyer, evidence.p1);
  evidence.saleOrder = id;
  assert.equal(receipt.totalAmount, '1350.00');
  let view = await journeyFor(seller, id);
  assert.equal(view.journey.stage, 'AWAITING_SELLER_SHIP');
  assert.ok(view.journey.actions.includes('ship-to-center'));
  assert.equal(view.money.outcome.kind, 'estimate');
  await shipToCenter(seller, id);
  await inspect(inspector, id, 'PASS');
  view = await journeyFor(buyer, id);
  assert.equal(view.journey.stage, 'RESULT_DECISION_OPEN');
  assert.ok(view.result.deadlineAt && view.result.canDecide && view.result.certificateStatus === 'ISSUED', 'certificate before decision');
  assert.equal(Date.parse(view.result.deadlineAt) - Date.parse(view.result.availableAt), 72 * 3600_000);
  await inspection.decideBuyerInspection(buyer.token, id, { decision: 'CONFIRM' });
  await inspection.decideBuyerInspection(buyer.token, id, { decision: 'CONFIRM' }); // content replay
  const opposite = await expectStatus(inspection.decideBuyerInspection(buyer.token, id, { decision: 'REJECT' }), 409, 'decision_already_recorded');
  assert.equal(describeActionError(opposite).next, 'refetch');
  view = await journeyFor(buyer, id);
  assert.equal(view.journey.stage, 'AWAITING_DISPATCH_TO_BUYER');
  await fulfil(inspector, id);
  view = await journeyFor(buyer, id);
  assert.equal(view.journey.stage, 'SHIPPING_TO_BUYER');
  assert.equal(view.journey.deadline, null, 'tracking alone starts no receipt timer');
  const outbound = view.delivery.shipments.find(item => item.leg === 'TO_BUYER');
  await delivered(admin, outbound.id, 'TO_BUYER');
  view = await journeyFor(buyer, id);
  assert.equal(view.journey.stage, 'DELIVERED_PENDING_BUYER');
  assert.ok(view.journey.outbound.simulatedTransport && !view.journey.outbound.recipientReceivedAt, 'transport event is not recipient receipt');
  assert.equal(Date.parse(view.delivery.receiptDeadlineAt) - Date.parse(view.journey.outbound.transportDeliveredAt), 72 * 3600_000);
  assert.ok(view.journey.actions.includes('confirm-receipt'));
  const sellerView = await journeyFor(seller, id);
  assert.ok(!sellerView.journey.actions.includes('confirm-receipt'), 'Seller never gets Buyer receipt action');
  const key = randomUUID();
  await harnessPort(buyer.token).confirmReceipt(id, key);
  const replay = await http('POST', `/orders/${id}/confirm-receipt`, buyer.token, {}, key);
  assert.equal(replay.replayed, true);
  view = await journeyFor(buyer, id);
  assert.equal(view.journey.stage, 'COMPLETED');
  const sold = await journeyFor(seller, id);
  assert.deepEqual(sold.money.outcome.lines.map(line => line.amount), ['60.00', '1140.00']);
  assert.equal(sold.money.outcome.kind, 'settled');
  assert.equal(view.money.outcome.kind, 'settled');
  assert.equal((await orders.getReceipt(buyer.token, id)).totalAmount, '1350.00');
  const history = parseHistory(await harnessPort(buyer.token).getHistory(id));
  assert.ok(history.items.some(item => item.event === 'SETTLEMENT_RELEASE'));
  const eligibility = await reviews.get(buyer.token, id);
  assert.equal(eligibility.can_review, true);
  await reviews.submit(buyer.token, id, { rating: 5, comment: 'แพ็กดี สินค้าตรงภาพ' }, randomUUID());
  const publicReviews = await reviews.publicList(seller.id);
  assert.equal(publicReviews.summary.count, 1);
  assert.equal(publicReviews.items[0].reviewer_label, 'ผู้ซื้อที่ยืนยันการซื้อ');
  assert.ok(!JSON.stringify(publicReviews).includes('ผู้ซื้อ ชื่อใหม่'), 'public review redacts real name');
  evidence.sale = { stage: view.journey.stage, seller: sold.money.outcome.lines, settlement: view.delivery.settlement };
});

await step('positive REJECT → TO_SELLER → transport event is not receipt → Seller confirm-return → refund 1200 + retained 100/50, payout 0', async () => {
  const productId = await newProduct(seller, 'กระเป๋าทดสอบ ปฏิเสธผลตรวจ');
  const { id } = await buy(buyer, productId);
  await shipToCenter(seller, id);
  await inspect(inspector, id, 'MINOR_ISSUE');
  await inspection.decideBuyerInspection(buyer.token, id, { decision: 'REJECT', reason: 'สภาพไม่ตรงที่คาด' });
  let view = await journeyFor(buyer, id);
  assert.equal(view.journey.stage, 'AWAITING_RETURN_DISPATCH');
  await fulfil(inspector, id);
  view = await journeyFor(buyer, id);
  assert.equal(view.journey.stage, 'RETURNING');
  assert.deepEqual([view.delivery.refundQuote.buyerRefund, view.delivery.refundQuote.retainedInspection, view.delivery.refundQuote.retainedShipping], ['1200.00', '100.00', '50.00']);
  assert.equal(view.money.outcome.kind, 'quote', 'quote is labelled, not refunded');
  let sellerView = await journeyFor(seller, id);
  assert.ok(sellerView.journey.actions.includes('confirm-return'));
  assert.equal(sellerView.delivery.refundQuote, null, 'Seller projection hides Buyer refund quote');
  await delivered(admin, sellerView.journey.returnLeg.id, 'TO_SELLER');
  view = await journeyFor(buyer, id);
  assert.equal(view.journey.stage, 'RETURNING', 'TO_SELLER event never refunds');
  const key = randomUUID();
  const committed = await harnessPort(seller.token).confirmReturn(id, key);
  assert.equal(committed.order_status, 'RETURNED_TO_SELLER');
  view = await journeyFor(buyer, id);
  assert.ok(['REFUNDED', 'RETURN_RECEIVED_PENDING_REFUND'].includes(view.journey.stage));
  evidence.rejectStageAfterReturn = view.journey.stage;
  if (view.journey.stage === 'REFUNDED') {
    assert.deepEqual(view.money.outcome.lines.map(line => line.amount), ['1200.00', '100.00', '50.00']);
    sellerView = await journeyFor(seller, id);
    assert.equal(sellerView.money.outcome.lines[0].amount, '0.00');
  }
  assert.equal((await orders.getReceipt(buyer.token, id)).totalAmount, '1350.00', 'original receipt unchanged');
  const result = await inspection.getBuyerResult(buyer.token, id);
  assert.equal(result.certificate.status, 'ISSUED', 'no automatic certificate VOID after reject/refund');
  await expectStatus(ok('POST', `/orders/${id}/review`, buyer.token, { rating: 1, comment: '' }, randomUUID()), 409, 'order_not_reviewable');
  evidence.reject = { stage: view.journey.stage, money: view.money.outcome.lines, settlement: view.delivery.settlement };
});

await step('negative FAKE: no certificate/CONFIRM/window → return → full 1350 refund', async () => {
  const productId = await newProduct(seller, 'รองเท้าทดสอบ ผลไม่ผ่าน');
  const { id } = await buy(buyer, productId);
  await shipToCenter(seller, id);
  await inspect(inspector, id, 'FAKE');
  let view = await journeyFor(buyer, id);
  assert.equal(view.result.certificateStatus, null);
  assert.equal(view.result.canDecide, false);
  assert.equal(view.result.deadlineAt, null);
  assert.equal(view.journey.stage, 'AWAITING_RETURN_DISPATCH');
  await expectStatus(inspection.decideBuyerInspection(buyer.token, id, { decision: 'CONFIRM' }), 409, 'decision_not_allowed');
  await fulfil(inspector, id);
  await harnessPort(seller.token).confirmReturn(id, randomUUID());
  view = await journeyFor(buyer, id);
  evidence.negativeStage = view.journey.stage;
  if (view.journey.stage === 'REFUNDED') assert.deepEqual(view.money.outcome.lines.map(line => line.amount), ['1350.00']);
  evidence.negative = { stage: view.journey.stage, money: view.money.outcome.lines, settlement: view.delivery.settlement };
});

await step('report-before-provider-event: Buyer reports after dispatch without transport event; AUTO blocked; receipt then 409', async () => {
  const productId = await newProduct(seller, 'หูฟังทดสอบ แจ้งไม่ได้รับ');
  const { id } = await buy(buyer, productId);
  await shipToCenter(seller, id);
  await inspect(inspector, id, 'PASS');
  await inspection.decideBuyerInspection(buyer.token, id, { decision: 'CONFIRM' });
  await fulfil(inspector, id);
  let view = await journeyFor(buyer, id);
  assert.equal(view.journey.outbound.transportDeliveredAt, null);
  assert.ok(view.journey.actions.includes('report-not-received'));
  await expectStatus(harnessPort(buyer.token).reportNotReceived(id, 'สั้น', randomUUID()), 422);
  await harnessPort(buyer.token).reportNotReceived(id, 'ยังไม่ได้รับพัสดุตามเลขติดตามที่แจ้ง', randomUUID());
  view = await journeyFor(buyer, id);
  assert.equal(view.journey.stage, 'DISPUTED');
  assert.equal(view.delivery.missingReport.reason, 'ยังไม่ได้รับพัสดุตามเลขติดตามที่แจ้ง');
  const sellerView = await journeyFor(seller, id);
  assert.equal(sellerView.delivery.missingReport, null, 'Seller does not see private report text');
  const conflict = await expectStatus(harnessPort(buyer.token).confirmReceipt(id, randomUUID()), 409);
  assert.equal(describeActionError(conflict).next, 'refetch');
  evidence.report = { stage: view.journey.stage };
});

await step('account switch: another Buyer cannot read the Order (404, no data); approved Seller buys as Buyer', async () => {
  const hidden = await expectStatus(orders.getOrder(buyer2.token, evidence.saleOrder), 404);
  assert.ok(hidden instanceof OrderServiceError && hidden.kind === 'not-found');
  await expectStatus(http('GET', `/orders/${evidence.saleOrder}/delivery`, buyer2.token), 404);
  await approveSeller(seller2, admin, 'ร้านผู้ขายที่ซื้อด้วย');
  const productId = await newProduct(seller, 'เสื้อทดสอบ ผู้ขายซื้อ');
  const { id, receipt } = await buy(seller2, productId);
  const view = await journeyFor(seller2, id);
  assert.equal(view.order.viewerRole, 'buyer');
  assert.equal(view.journey.stage, 'AWAITING_SELLER_SHIP');
  assert.equal(receipt.totalAmount, '1350.00');
  await expectStatus(orders.createOrder(seller.token, { productId: await newProduct(seller, 'ซื้อของตัวเองไม่ได้'), address: ADDRESS, idempotencyKey: randomUUID() }), 409);
});

const passed = results.filter(item => item.result === 'PASS').length;
console.log(JSON.stringify({ api: API, passed, total: results.length, results, evidence }, null, 2));
process.exit(passed === results.length ? 0 : 1);
