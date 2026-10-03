/**
 * UI2-00 shipping/delivery/recipient/Admin DTO contract (PR130 accepted API).
 *
 * Field names are the server's snake_case JSON so nothing is renamed or dropped.
 * Money is a decimal string, times are UTC ISO strings, and every flag comes from
 * the server. The client never derives deadlines, settlements or recipient facts.
 */

export type FulfillmentPolicy = 'EXTERNAL_V2' | 'LEGACY_V1';
export type ShipmentLeg = 'TO_CENTER' | 'TO_BUYER' | 'TO_SELLER';
/** Transport fact source. ADMIN_DEMO is a simulated carrier event, never a recipient receipt. */
export type TransportSource = 'ADMIN_DEMO' | 'LEGACY_COURIER';
/** Who actually received the parcel. */
export type RecipientSource = 'INSPECTOR' | 'BUYER' | 'SELLER' | 'ADMIN' | 'AUTO_RECEIPT' | string;
export type EscrowStatus = 'HELD' | 'RELEASED' | 'REFUNDED';
export type SettlementKind = 'RELEASE' | 'REFUND';
export type SettlementSource = 'BUYER_RECEIPT' | 'AUTO_RECEIPT' | 'ADMIN_RESOLUTION' | 'RETURN_DELIVERY' | 'SELLER_NO_SHIP';
export type SettlementReason =
  | 'RECEIPT_CONFIRMED' | 'RECEIPT_TIMEOUT' | 'DELIVERY_REVIEW_RELEASE'
  | 'BUYER_REJECTED_INSPECTION' | 'RESULT_DECISION_TIMEOUT' | 'INSPECTION_NOT_AS_DESCRIBED' | 'INSPECTION_FAKE'
  | 'SELLER_NO_SHIP' | 'DELIVERY_REVIEW_REFUND';

export type DeliveryShipment = {
  id: number; leg: ShipmentLeg; status: string;
  carrier: string | null; tracking_number: string | null; shipped_at: string | null;
  /** Legacy Courier projection only. */
  delivered_at: string | null; delivery_proof_confirmed_at: string | null;
  transport_delivered_at: string | null; transport_source: TransportSource | null; simulated_transport: boolean;
  recipient_received_at: string | null; recipient_source: RecipientSource | null;
  proofs: { id: number; url: string; expires_at: string | null }[];
};

/** Buyer-only estimate of the refund the policy requires. Not proof of money. */
export type RefundQuote = { buyer_refund: string; retained_inspection: string; retained_shipping: string; requires_actual_return: boolean };

type SettlementBase = {
  id: number; kind: SettlementKind; source: SettlementSource; reason: SettlementReason;
  currency: string; settled_at: string; simulated: true; fulfillment_policy: FulfillmentPolicy;
};
export type BuyerSettlement = SettlementBase & {
  held_amount: string; buyer_refund: string; retained_inspection_amount: string; retained_shipping_amount: string;
};
export type SellerSettlement = SettlementBase & { seller_payout: string; commission_amount: string };

/** GET /orders/{id}/delivery — role-redacted for the owning Buyer or Seller. */
export type DeliveryView = {
  order_id: number; order_status: string; server_time: string; fulfillment_policy: FulfillmentPolicy;
  result_available_at: string | null; result_decision_deadline_at: string | null; result_timed_out_at: string | null;
  can_confirm_return: boolean;
  /** Buyer: charged total; Seller: null. */
  charged_amount: string | null;
  /** Buyer with a dispatched return: quote; Seller: always null. */
  refund_quote: RefundQuote | null;
  shipments: DeliveryShipment[];
  receipt_deadline_at: string | null; receipt_confirmed_at: string | null; receipt_confirmation_source: string | null;
  missing_reported_at: string | null;
  /** Buyer only; the Seller projection is null. */
  missing_report: { id: string; reason: string } | null;
  settlement_status: EscrowStatus | null;
  settlement: BuyerSettlement | SellerSettlement | null;
  /** Actual return committed but the single settlement has not; wait for the server retry. */
  pending_processing: boolean;
  inspection_overdue_escalated_at: string | null;
  can_confirm_receipt: boolean;
  /**
   * Server name for "can report not received". The API mapping doc calls it
   * `can_report_not_received`; PR130 returns `can_report_missing`. Use canReportNotReceived().
   */
  can_report_missing: boolean;
};

export const canReportNotReceived = (view: Pick<DeliveryView, 'can_report_missing'> & { can_report_not_received?: boolean }) =>
  view.can_report_not_received ?? view.can_report_missing;

export const isBuyerSettlement = (value: DeliveryView['settlement']): value is BuyerSettlement => !!value && 'buyer_refund' in value;

export type HistoryItem = { id: number; from_status: string | null; to_status: string; event: string; source: string; occurred_at: string };
export type HistoryPage = { items: HistoryItem[]; limit: number; offset: number; has_more: boolean };

export type AddressDto = {
  recipient_name: string; phone: string; address_line: string; subdistrict: string; district: string; province: string; postal_code: string;
};
export type ReturnAddressView = { order_id: number; return_address: AddressDto | null; saved_at: string | null; frozen: boolean };
export type SaveReturnAddressResult = { order_id: number; return_address: AddressDto; saved_at: string };

/** Carrier/tracking only; the server selects leg and destination. */
export type CarrierInput = { carrier: string; tracking_number: string };
export type FulfillmentResult = {
  shipment: { id: number; leg: ShipmentLeg; status: string; carrier: string; tracking_number: string }; order_status: string;
};

export type ReceiptResult = { order_id: number; order_status: string; receipt_confirmed_at: string | null; receipt_confirmation_source: string | null };
export type ReportResult = { order_id: number; order_status: 'DELIVERY_DISPUTED'; reported_at: string; report_id: string; settlement_status: 'HELD' };
/** Seller/Admin actual return: the physical fact commits first; refetch delivery for money. */
export type ReturnReceiptResult = {
  order_id: number; shipment_id: number; return_received_at: string; recipient_source: 'SELLER' | 'ADMIN';
  order_status: 'RETURNED_TO_SELLER'; settlement_attempt: 'SEPARATE'; simulated: true;
};

export type ShippingEventInput = { leg: ShipmentLeg; event: 'DELIVERED'; event_id: string };
export type ShippingEventResult = {
  order_id: number; shipment_id: number; leg: ShipmentLeg; event_id: string; event: 'DELIVERED';
  source: 'ADMIN_DEMO'; confirmed_at: string; simulated: true; recipient_confirmed: false;
};

export type DeliveryCasesPage = { items: { order_id: number; reported_at: string }[]; limit: number; offset: number; has_more: boolean };
export type DeliveryReviewResult = {
  order_id: number; order_status: string; audit_id: number;
  report: { id: string; reason: string; reference: string };
  proofs: { id: number; reference: string; url: string }[];
  audit_reference: string;
};
export type DeliveryResolution = 'RELEASE' | 'REFUND';
export type ResolveDeliveryInput = { resolution: DeliveryResolution; reason: string; evidence_refs: string[] };
export type ResolveDeliveryResult = ReceiptResult;
export type ReturnReviewResult = {
  order_id: number; shipment_id: number; return_recipient: AddressDto | null; evidence_refs: string[]; simulated: true;
};
export type AdminConfirmReturnInput = { reason: string; evidence_refs: string[] };

/** Admin order reads (existing ORDER-09): masked parties, shipment IDs only (no destination/tracking). */
export type AdminOrderSummary = { id: number; status: string; payment_status: string; product: { id: number; name: string }; total_amount: string; created_at: string | null; paid_at: string | null };
export type AdminOrdersPage = { items: AdminOrderSummary[]; total: number; limit: number; offset: number };
export type AdminOrderShipments = { id: number; status: string; product: { id: number; name: string }; shipments: { id: number; leg: ShipmentLeg; status: string; courier_id: number | null }[] };

/** Every mutation resolves with the server body plus whether it was an Idempotent-Replayed answer. */
export type CommandResult<T> = { result: T; replayed: boolean };

export const REASON_MIN = 10;
export const REASON_MAX = 1000;
export const CARRIER_MAX = 100;
export const DELIVERY_CASE_REF = /^(delivery-report|delivery-proof|delivery-audit):[1-9][0-9]*$/;
export const RETURN_CASE_REF = /^(return-shipment|delivery-audit):[1-9][0-9]*$/;
export const EVENT_ID = /^[A-Za-z0-9_-]{8,100}$/;
export const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,100}$/;
