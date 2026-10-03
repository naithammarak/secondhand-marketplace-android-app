import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveJourney, deriveMoney, parseDelivery, parseHistory, parseResultWindow, parseReturnAddress, JourneyParseError,
} from '../src/orders/order-journey.ts';

const NOW = Date.parse('2026-10-05T10:00:00Z');

const order = (extra = {}) => ({
  id: 7, status: 'RESULT_NOTIFIED', paymentStatus: 'PAID', viewerRole: 'buyer',
  product: { id: 3, name: 'เสื้อแจ็กเก็ต', condition: 'GOOD', size: 'M' },
  amounts: { currency: 'THB', itemPrice: '1200.00', shippingFee: '50.00', inspectionFee: '100.00', totalAmount: '1350.00', commissionFee: '60.00', sellerPayout: '1140.00' },
  shippingAddress: null, lastPaymentAttempt: null, paidAt: '2026-10-01T10:00:00Z', receiptNo: 'RC-7', canPay: false, canCancel: false,
  expiresAt: null, cancelledAt: null, cancelReason: null, createdAt: '2026-10-01T09:50:00Z', ...extra,
});

const shipment = (leg, extra = {}) => ({
  id: leg === 'TO_CENTER' ? 1 : leg === 'TO_BUYER' ? 2 : 3, leg, status: 'SHIPPED', carrier: 'Demo carrier', tracking_number: `${leg}-001`,
  shipped_at: '2026-10-02T10:00:00Z', delivered_at: null, delivery_proof_confirmed_at: null, transport_delivered_at: null,
  transport_source: null, recipient_received_at: null, recipient_source: null, simulated_transport: false, proofs: [], ...extra,
});

const delivery = (extra = {}) => ({
  order_id: 7, order_status: 'RESULT_NOTIFIED', server_time: '2026-10-05T10:00:00Z', fulfillment_policy: 'EXTERNAL_V2',
  result_available_at: '2026-10-04T10:00:00Z', result_decision_deadline_at: '2026-10-07T10:00:00Z', result_timed_out_at: null,
  can_confirm_return: false, charged_amount: '1350.00', refund_quote: null,
  shipments: [shipment('TO_CENTER', { recipient_received_at: '2026-10-03T10:00:00Z', recipient_source: 'INSPECTOR' })],
  receipt_deadline_at: null, receipt_confirmed_at: null, receipt_confirmation_source: null, missing_reported_at: null, missing_report: null,
  settlement_status: 'HELD', settlement: null, pending_processing: false, inspection_overdue_escalated_at: null,
  can_confirm_receipt: false, can_report_missing: false, ...extra,
});

const result = (extra = {}) => parseResultWindow({
  order_id: 7, order_status: 'RESULT_NOTIFIED', result: 'PASS', summary: 'ok', inspected_at: '2026-10-04T10:00:00Z', evidence: [],
  certificate: { certificate_no: 'C-1', public_url: 'https://x.test/c/1', issued_at: '2026-10-04T10:00:00Z', status: 'ISSUED' },
  decision: null, fulfillment_policy: 'EXTERNAL_V2', result_available_at: '2026-10-04T10:00:00Z',
  result_decision_deadline_at: '2026-10-07T10:00:00Z', result_timed_out_at: null, server_time: '2026-10-05T10:00:00Z',
  can_decide: true, next_action: 'WAIT_BUYER_DECISION', ...extra,
});

test('positive result opens the decision window only from server can_decide and deadline', () => {
  const journey = deriveJourney({ order: order(), delivery: parseDelivery(delivery()), result: result(), now: NOW });
  assert.equal(journey.stage, 'RESULT_DECISION_OPEN');
  assert.deepEqual(journey.deadline?.at, '2026-10-07T10:00:00Z');
  assert.ok(journey.actions.includes('open-result'));
  const closed = deriveJourney({ order: order(), delivery: parseDelivery(delivery()), result: result({ can_decide: false }), now: Date.parse('2026-10-07T10:00:00Z') });
  assert.equal(closed.stage, 'RESULT_DECISION_CLOSED_PENDING');
  assert.match(closed.title, /หมดเวลาตัดสินใจ/);
  assert.equal(closed.deadline, null);
});

test('client time never opens a decision the server closed', () => {
  const journey = deriveJourney({ order: order(), delivery: parseDelivery(delivery()), result: result({ can_decide: false }), now: NOW });
  assert.notEqual(journey.stage, 'RESULT_DECISION_OPEN');
});

test('negative result has no decision window and goes to return', () => {
  const negative = result({ result: 'FAKE', certificate: null, can_decide: false, result_available_at: null, result_decision_deadline_at: null, next_action: 'RETURN_TO_SELLER' });
  const journey = deriveJourney({ order: order(), delivery: parseDelivery(delivery({ result_available_at: null, result_decision_deadline_at: null })), result: negative, now: NOW });
  assert.equal(journey.stage, 'AWAITING_RETURN_DISPATCH');
  assert.equal(journey.deadline, null);
  assert.match(journey.detail, /ไม่มีใบรับรอง/);
});

test('timeout is a return authorization, never an acceptance', () => {
  const timed = result({ can_decide: false, result_timed_out_at: '2026-10-07T10:01:00Z', next_action: 'RETURN_TO_SELLER' });
  const journey = deriveJourney({ order: order(), delivery: parseDelivery(delivery({ result_timed_out_at: '2026-10-07T10:01:00Z' })), result: timed, now: NOW });
  assert.equal(journey.stage, 'AWAITING_RETURN_DISPATCH');
  assert.match(journey.title, /หมดเวลาตัดสินใจ ระบบจะดำเนินการส่งคืนผู้ขาย/);
});

test('return in transit: Seller gets confirm-return only from the server flag', () => {
  const returning = delivery({ shipments: [shipment('TO_CENTER'), shipment('TO_SELLER', { transport_delivered_at: '2026-10-06T08:00:00Z', transport_source: 'ADMIN_DEMO', simulated_transport: true })],
    can_confirm_return: true, charged_amount: null });
  const seller = deriveJourney({ order: order({ viewerRole: 'seller' }), delivery: parseDelivery(returning), now: NOW });
  assert.equal(seller.stage, 'RETURNING');
  assert.ok(seller.actions.includes('confirm-return'));
  assert.equal(seller.returnLeg?.simulatedTransport, true);
  assert.equal(seller.returnLeg?.recipientReceivedAt, null, 'transport event is not recipient receipt');
  const denied = deriveJourney({ order: order({ viewerRole: 'seller' }), delivery: parseDelivery({ ...returning, can_confirm_return: false }), now: NOW });
  assert.ok(!denied.actions.includes('confirm-return'));
});

test('actual return with pending settlement is never shown as refunded', () => {
  const pending = parseDelivery(delivery({ order_status: 'RETURNED_TO_SELLER', pending_processing: true, settlement: null,
    refund_quote: { buyer_refund: '1200.00', retained_inspection: '100.00', retained_shipping: '50.00', requires_actual_return: true },
    shipments: [shipment('TO_SELLER', { recipient_received_at: '2026-10-06T10:00:00Z', recipient_source: 'SELLER' })] }));
  const journey = deriveJourney({ order: order(), delivery: pending, now: NOW });
  assert.equal(journey.stage, 'RETURN_RECEIVED_PENDING_REFUND');
  assert.equal(journey.title, 'รับคืนแล้ว กำลังดำเนินการคืนเงิน');
  const money = deriveMoney(order(), pending);
  assert.equal(money.outcome.kind, 'quote');
  assert.equal(money.outcome.lines[0].amount, '1200.00');
  assert.match(money.outcome.note, /ยังไม่ใช่การคืนเงิน/);
});

test('positive reject refund shows 1200 refund with retained 100 + 50, no re-deduction', () => {
  const settled = parseDelivery(delivery({ order_status: 'REFUNDED', settlement_status: 'REFUNDED', settlement: {
    id: 55, kind: 'REFUND', source: 'RETURN_DELIVERY', reason: 'BUYER_REJECTED_INSPECTION', currency: 'THB', settled_at: '2026-10-06T10:00:01Z', simulated: true,
    fulfillment_policy: 'EXTERNAL_V2', held_amount: '1350.00', buyer_refund: '1200.00', retained_inspection_amount: '100.00', retained_shipping_amount: '50.00' } }));
  const journey = deriveJourney({ order: order({ status: 'REFUNDED', paymentStatus: 'REFUNDED' }), delivery: settled, now: NOW });
  assert.equal(journey.stage, 'REFUNDED');
  const money = deriveMoney(order({ paymentStatus: 'REFUNDED' }), settled);
  assert.equal(money.outcome.kind, 'settled');
  assert.deepEqual(money.outcome.lines.map(line => line.amount), ['1200.00', '100.00', '50.00']);
  assert.equal(money.outcome.reference, '#55');
  assert.equal(money.lines.at(-1).amount, '1350.00', 'original charge kept');
});

test('negative / full refund shows one 1350 line and no retained rows', () => {
  const settled = parseDelivery(delivery({ order_status: 'REFUNDED', settlement: { id: 56, kind: 'REFUND', source: 'RETURN_DELIVERY', reason: 'INSPECTION_FAKE',
    currency: 'THB', settled_at: '2026-10-06T10:00:01Z', simulated: true, fulfillment_policy: 'EXTERNAL_V2', held_amount: '1350.00', buyer_refund: '1350.00',
    retained_inspection_amount: '0.00', retained_shipping_amount: '0.00' } }));
  const money = deriveMoney(order({ paymentStatus: 'REFUNDED' }), settled);
  assert.deepEqual(money.outcome.lines.map(line => line.amount), ['1350.00']);
});

test('Seller sees settled payout 1140 / commission 60, estimates are labelled before settlement', () => {
  const seller = order({ viewerRole: 'seller', status: 'COMPLETED' });
  const released = parseDelivery(delivery({ order_status: 'COMPLETED', charged_amount: null, settlement: { id: 57, kind: 'RELEASE', source: 'BUYER_RECEIPT',
    reason: 'RECEIPT_CONFIRMED', currency: 'THB', settled_at: '2026-10-08T10:00:00Z', simulated: true, fulfillment_policy: 'EXTERNAL_V2',
    seller_payout: '1140.00', commission_amount: '60.00' } }));
  const money = deriveMoney(seller, released);
  assert.deepEqual(money.outcome.lines.map(line => line.amount), ['60.00', '1140.00']);
  const estimate = deriveMoney(order({ viewerRole: 'seller', status: 'WAITING_SELLER_SHIP' }), null);
  assert.equal(estimate.outcome.kind, 'estimate');
  assert.match(estimate.outcome.note, /ยังไม่ใช่เงินที่จ่ายจริง/);
});

test('report before provider event: Buyer actions come from server flags without a transport event', () => {
  const shipping = parseDelivery(delivery({ order_status: 'SHIPPING_TO_BUYER', shipments: [shipment('TO_BUYER')], can_confirm_receipt: true, can_report_missing: true }));
  const journey = deriveJourney({ order: order({ status: 'SHIPPING_TO_BUYER' }), delivery: shipping, now: NOW });
  assert.equal(journey.stage, 'SHIPPING_TO_BUYER');
  assert.ok(journey.actions.includes('confirm-receipt'));
  assert.ok(journey.actions.includes('report-not-received'));
  assert.equal(journey.deadline, null, 'tracking alone starts no receipt timer');
});

test('trusted TO_BUYER event shows the server receipt deadline', () => {
  const delivered = parseDelivery(delivery({ order_status: 'DELIVERED_PENDING_BUYER', receipt_deadline_at: '2026-10-08T10:00:00Z',
    shipments: [shipment('TO_BUYER', { transport_delivered_at: '2026-10-05T10:00:00Z', transport_source: 'ADMIN_DEMO', simulated_transport: true })],
    can_confirm_receipt: true, can_report_missing: true }));
  const journey = deriveJourney({ order: order({ status: 'DELIVERED_PENDING_BUYER' }), delivery: delivered, now: NOW });
  assert.equal(journey.stage, 'DELIVERED_PENDING_BUYER');
  assert.equal(journey.deadline?.at, '2026-10-08T10:00:00Z');
  const seller = deriveJourney({ order: order({ viewerRole: 'seller', status: 'DELIVERED_PENDING_BUYER' }), delivery: delivered, now: NOW });
  assert.deepEqual(seller.actions, [], 'Seller never gets Buyer receipt actions');
});

test('disputed and completed states keep their backend meaning', () => {
  const disputed = deriveJourney({ order: order({ status: 'DELIVERY_DISPUTED' }), delivery: parseDelivery(delivery({ order_status: 'DELIVERY_DISPUTED', missing_reported_at: '2026-10-06T10:00:00Z', missing_report: { id: '9', reason: 'ไม่ได้รับพัสดุตามที่แจ้ง' } })), now: NOW });
  assert.equal(disputed.stage, 'DISPUTED');
  assert.ok(!disputed.actions.includes('confirm-receipt'));
  const completed = deriveJourney({ order: order({ status: 'COMPLETED' }), delivery: parseDelivery(delivery({ order_status: 'COMPLETED' })), now: NOW });
  assert.ok(completed.actions.includes('review'));
});

test('legacy LEGACY_V1 orders parse and are flagged without a new-policy window', () => {
  const legacy = parseDelivery(delivery({ fulfillment_policy: 'LEGACY_V1', result_available_at: null, result_decision_deadline_at: null }));
  const journey = deriveJourney({ order: order(), delivery: legacy, result: result({ fulfillment_policy: 'LEGACY_V1', result_decision_deadline_at: null, can_decide: true }), now: NOW });
  assert.equal(journey.legacy, true);
  assert.equal(journey.stage, 'RESULT_DECISION_OPEN', 'legacy decision follows the server flag');
  assert.equal(journey.deadline, null, 'no invented deadline for legacy');
});

test('parsers reject malformed money and keep unknown statuses visible', () => {
  assert.throws(() => parseDelivery(delivery({ charged_amount: 1350 })), JourneyParseError);
  const journey = deriveJourney({ order: order({ status: 'UNKNOWN' }), delivery: parseDelivery(delivery({ order_status: 'SOMETHING_NEW' })), now: NOW });
  assert.equal(journey.stage, 'UNKNOWN');
});

test('history and return-address projections parse', () => {
  const history = parseHistory({ items: [{ id: 1, from_status: 'RESULT_NOTIFIED', to_status: 'RETURNED_TO_SELLER', event: 'RETURN_RECIPIENT_CONFIRMED', source: 'SELLER', occurred_at: '2026-10-06T10:00:00Z' }], limit: 100, offset: 0, has_more: false });
  assert.equal(history.items[0].event, 'RETURN_RECIPIENT_CONFIRMED');
  const address = parseReturnAddress({ order_id: 7, return_address: { recipient_name: 'ผู้ขาย', phone: '0812345678', address_line: '1', subdistrict: 'a', district: 'b', province: 'c', postal_code: '10110' }, saved_at: '2026-10-02T09:00:00Z', frozen: true });
  assert.equal(address.frozen, true);
  assert.equal(parseReturnAddress({ order_id: 7, return_address: null, saved_at: null, frozen: false }).address, null);
});

test('waiting payment exposes pay/cancel only from server flags', () => {
  const unpaid = deriveJourney({ order: order({ status: 'WAITING_PAYMENT', paymentStatus: 'UNPAID', canPay: true, canCancel: true, receiptNo: null, expiresAt: '2026-10-05T10:30:00Z' }), now: NOW });
  assert.deepEqual(unpaid.actions, ['pay', 'cancel']);
  assert.equal(unpaid.deadline?.at, '2026-10-05T10:30:00Z');
  const seller = deriveJourney({ order: order({ viewerRole: 'seller', status: 'WAITING_PAYMENT', paymentStatus: 'UNPAID', canPay: true, canCancel: true }), now: NOW });
  assert.deepEqual(seller.actions, []);
});
