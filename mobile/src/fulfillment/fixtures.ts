/**
 * Typed fixtures shaped like PR130 responses (amounts from the accepted 1200 + 50 + 100
 * example). For tests and visual QA only; never imported by production screens.
 */
import type {
  BuyerSettlement, DeliveryCasesPage, DeliveryReviewResult, DeliveryShipment, DeliveryView, HistoryPage,
  ReturnReviewResult, SellerSettlement,
} from './contract';

const T0 = '2026-10-05T10:00:00Z';
const at = (hours: number) => new Date(Date.parse(T0) + hours * 3600_000).toISOString();

export function shipmentFixture(leg: DeliveryShipment['leg'], extra: Partial<DeliveryShipment> = {}): DeliveryShipment {
  return {
    id: leg === 'TO_CENTER' ? 11 : leg === 'TO_BUYER' ? 12 : 13, leg, status: 'IN_TRANSIT', carrier: 'Demo carrier',
    tracking_number: `${leg}-001`, shipped_at: at(-20), delivered_at: null, delivery_proof_confirmed_at: null,
    transport_delivered_at: null, transport_source: null, simulated_transport: false,
    recipient_received_at: null, recipient_source: null, proofs: [], ...extra,
  };
}
const center = shipmentFixture('TO_CENTER', { status: 'DELIVERED', shipped_at: at(-60), recipient_received_at: at(-50), recipient_source: 'INSPECTOR' });

export function deliveryFixture(extra: Partial<DeliveryView> = {}): DeliveryView {
  return {
    order_id: 7, order_status: 'RESULT_NOTIFIED', server_time: T0, fulfillment_policy: 'EXTERNAL_V2',
    result_available_at: at(-24), result_decision_deadline_at: at(48), result_timed_out_at: null,
    can_confirm_return: false, charged_amount: '1350.00', refund_quote: null, shipments: [center],
    receipt_deadline_at: null, receipt_confirmed_at: null, receipt_confirmation_source: null,
    missing_reported_at: null, missing_report: null, settlement_status: 'HELD', settlement: null,
    pending_processing: false, inspection_overdue_escalated_at: null, can_confirm_receipt: false, can_report_missing: false,
    ...extra,
  };
}

const settlementBase = { currency: 'THB', settled_at: at(30), simulated: true as const, fulfillment_policy: 'EXTERNAL_V2' as const };
export const buyerRejectRefund: BuyerSettlement = { ...settlementBase, id: 55, kind: 'REFUND', source: 'RETURN_DELIVERY', reason: 'BUYER_REJECTED_INSPECTION',
  held_amount: '1350.00', buyer_refund: '1200.00', retained_inspection_amount: '100.00', retained_shipping_amount: '50.00' };
export const buyerFullRefund: BuyerSettlement = { ...buyerRejectRefund, id: 56, reason: 'INSPECTION_FAKE', buyer_refund: '1350.00',
  retained_inspection_amount: '0.00', retained_shipping_amount: '0.00' };
export const sellerRelease: SellerSettlement = { ...settlementBase, id: 57, kind: 'RELEASE', source: 'BUYER_RECEIPT', reason: 'RECEIPT_CONFIRMED',
  seller_payout: '1140.00', commission_amount: '60.00' };
export const sellerRefund: SellerSettlement = { ...settlementBase, id: 55, kind: 'REFUND', source: 'RETURN_DELIVERY', reason: 'BUYER_REJECTED_INSPECTION',
  seller_payout: '0.00', commission_amount: '0.00' };

const itemQuote = { buyer_refund: '1200.00', retained_inspection: '100.00', retained_shipping: '50.00', requires_actual_return: true };
const returning = shipmentFixture('TO_SELLER');
const returnedBySeller = shipmentFixture('TO_SELLER', { status: 'DELIVERED', recipient_received_at: at(28), recipient_source: 'SELLER' });

/** Named role projections for the main journeys (Buyer B / Seller S). */
export const deliveryFixtures = {
  decisionOpenBuyer: deliveryFixture(),
  shippingNoEventBuyer: deliveryFixture({ order_status: 'SHIPPING_TO_BUYER', shipments: [center, shipmentFixture('TO_BUYER')], can_confirm_receipt: true, can_report_missing: true }),
  deliveredEventBuyer: deliveryFixture({ order_status: 'DELIVERED_PENDING_BUYER', receipt_deadline_at: at(72),
    shipments: [center, shipmentFixture('TO_BUYER', { status: 'DELIVERED', transport_delivered_at: T0, transport_source: 'ADMIN_DEMO', simulated_transport: true })],
    can_confirm_receipt: true, can_report_missing: true }),
  disputedBuyer: deliveryFixture({ order_status: 'DELIVERY_DISPUTED', missing_reported_at: at(2), missing_report: { id: '91', reason: 'ยังไม่ได้รับพัสดุตามเลขติดตาม' },
    shipments: [center, shipmentFixture('TO_BUYER')] }),
  disputedSeller: deliveryFixture({ order_status: 'DELIVERY_DISPUTED', missing_reported_at: at(2), missing_report: null, charged_amount: null, shipments: [center, shipmentFixture('TO_BUYER')] }),
  returningBuyer: deliveryFixture({ refund_quote: itemQuote, shipments: [center, returning] }),
  returningSeller: deliveryFixture({ charged_amount: null, can_confirm_return: true, shipments: [center, returning] }),
  returnPendingBuyer: deliveryFixture({ order_status: 'RETURNED_TO_SELLER', refund_quote: itemQuote, pending_processing: true, shipments: [center, returnedBySeller] }),
  returnPendingSeller: deliveryFixture({ order_status: 'RETURNED_TO_SELLER', charged_amount: null, pending_processing: true, shipments: [center, returnedBySeller] }),
  refundedItemOnlyBuyer: deliveryFixture({ order_status: 'REFUNDED', settlement_status: 'REFUNDED', refund_quote: itemQuote, settlement: buyerRejectRefund, shipments: [center, returnedBySeller] }),
  refundedItemOnlySeller: deliveryFixture({ order_status: 'REFUNDED', settlement_status: 'REFUNDED', charged_amount: null, settlement: sellerRefund, shipments: [center, returnedBySeller] }),
  refundedNegativeBuyer: deliveryFixture({ order_status: 'REFUNDED', settlement_status: 'REFUNDED', result_available_at: null, result_decision_deadline_at: null,
    refund_quote: { ...itemQuote, buyer_refund: '1350.00', retained_inspection: '0.00', retained_shipping: '0.00' }, settlement: buyerFullRefund, shipments: [center, returnedBySeller] }),
  releasedSeller: deliveryFixture({ order_status: 'COMPLETED', settlement_status: 'RELEASED', charged_amount: null, settlement: sellerRelease, receipt_confirmed_at: at(30),
    receipt_confirmation_source: 'BUYER_RECEIPT', shipments: [center, shipmentFixture('TO_BUYER', { status: 'DELIVERED', recipient_received_at: at(30), recipient_source: 'BUYER' })] }),
  legacyBuyer: deliveryFixture({ fulfillment_policy: 'LEGACY_V1', result_available_at: null, result_decision_deadline_at: null }),
} satisfies Record<string, DeliveryView>;

export const historyFixture: HistoryPage = { items: [
  { id: 1, from_status: 'RESULT_NOTIFIED', to_status: 'RESULT_NOTIFIED', event: 'FULFILLMENT_CREATED', source: 'INSPECTOR', occurred_at: at(1) },
  { id: 2, from_status: 'RESULT_NOTIFIED', to_status: 'RETURNED_TO_SELLER', event: 'RETURN_RECIPIENT_CONFIRMED', source: 'SELLER', occurred_at: at(28) },
], limit: 100, offset: 0, has_more: false };

export const deliveryCasesFixture: DeliveryCasesPage = { items: [{ order_id: 7, reported_at: at(2) }, { order_id: 9, reported_at: at(3) }], limit: 20, offset: 0, has_more: false };
export const deliveryReviewFixture: DeliveryReviewResult = { order_id: 7, order_status: 'DELIVERY_DISPUTED', audit_id: 23,
  report: { id: '91', reason: 'ยังไม่ได้รับพัสดุตามเลขติดตาม', reference: 'delivery-report:91' }, proofs: [], audit_reference: 'delivery-audit:23' };
export const returnReviewFixture: ReturnReviewResult = { order_id: 7, shipment_id: 13, simulated: true,
  return_recipient: { recipient_name: 'ผู้ขาย ตัวอย่าง', phone: '0899999999', address_line: '1 ถนนคืนสินค้า', subdistrict: 'แขวงคืน', district: 'เขตคืน', province: 'กรุงเทพมหานคร', postal_code: '10200' },
  evidence_refs: ['delivery-audit:24', 'return-shipment:13'] };

/** `{status, code}` the client raises for the main server outcomes. */
export const errorFixtures = {
  network: { status: 0, code: 'network_error' }, timeout: { status: 0, code: 'timeout' },
  unauthorized: { status: 401, code: 'unauthorized' }, simulationDisabled: { status: 403, code: 'fulfillment_simulation_disabled' },
  demoDisabled: { status: 403, code: 'shipping_demo_disabled' }, hidden: { status: 404, code: 'order_not_found' },
  receiptDeadline: { status: 409, code: 'receipt_deadline_passed' }, decisionDeadline: { status: 409, code: 'result_decision_deadline_passed' },
  keyReused: { status: 409, code: 'idempotency_key_reused' }, badRef: { status: 422, code: 'invalid_evidence_reference' },
} as const;
