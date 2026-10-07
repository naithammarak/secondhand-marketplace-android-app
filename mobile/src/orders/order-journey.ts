/**
 * UI1-05 Buyer/Seller journey: parse server read models and derive what to show.
 *
 * Authority stays on the server. This module never computes money, deadlines or
 * outcomes: stages are presentation labels derived from order_status + shipments +
 * flags + settlement, and every action is gated by a server `can_*` flag.
 * Prototype labels (AWAITING_DISPATCH, DELIVERED, DISPUTED ...) are never sent back.
 */
import type { OrderDetail } from '../services/order-service';

// ---------- server DTOs (snake_case, accepted API mapping PR130) ----------

export type FulfillmentPolicy = 'EXTERNAL_V2' | 'LEGACY_V1';
export type Leg = 'TO_CENTER' | 'TO_BUYER' | 'TO_SELLER';

export type ShipmentView = {
  id: number; leg: Leg; status: string | null;
  carrier: string | null; trackingNumber: string | null; shippedAt: string | null;
  transportDeliveredAt: string | null; transportSource: string | null; simulatedTransport: boolean;
  recipientReceivedAt: string | null; recipientSource: string | null;
};

export type SettlementView = {
  id: number; kind: 'RELEASE' | 'REFUND'; source: string; reason: string; currency: string;
  settledAt: string | null; simulated: boolean; policy: string | null;
  /** Buyer projection */
  heldAmount: string | null; buyerRefund: string | null; retainedInspection: string | null; retainedShipping: string | null;
  /** Seller projection */
  sellerPayout: string | null; commission: string | null;
};

export type RefundQuote = { buyerRefund: string; retainedInspection: string; retainedShipping: string; requiresActualReturn: boolean };

export type DeliveryView = {
  orderId: number; orderStatus: string; serverTime: string | null; policy: FulfillmentPolicy | null;
  resultAvailableAt: string | null; resultDecisionDeadlineAt: string | null; resultTimedOutAt: string | null;
  canConfirmReturn: boolean; canConfirmReceipt: boolean; canReportNotReceived: boolean;
  chargedAmount: string | null; refundQuote: RefundQuote | null;
  shipments: ShipmentView[];
  receiptDeadlineAt: string | null; receiptConfirmedAt: string | null; receiptConfirmationSource: string | null;
  missingReportedAt: string | null; missingReport: { id: string; reason: string } | null;
  settlementStatus: string | null; settlement: SettlementView | null; pendingProcessing: boolean;
  inspectionOverdueEscalatedAt: string | null;
};

export type HistoryItem = { id: number; fromStatus: string | null; toStatus: string | null; event: string; source: string | null; occurredAt: string | null };
export type HistoryPage = { items: HistoryItem[]; hasMore: boolean; offset: number; limit: number };

export type ReturnAddress = {
  recipient_name: string; phone: string; address_line: string; subdistrict: string; district: string; province: string; postal_code: string;
};
export type ReturnAddressView = { orderId: number; address: ReturnAddress | null; savedAt: string | null; frozen: boolean };

/** Buyer result window fields read from GET /orders/{id}/inspection. */
export type ResultWindow = {
  result: 'PASS' | 'MINOR_ISSUE' | 'NOT_AS_DESCRIBED' | 'FAKE' | null;
  policy: FulfillmentPolicy | null;
  availableAt: string | null; deadlineAt: string | null; timedOutAt: string | null; serverTime: string | null;
  canDecide: boolean; decision: 'CONFIRM' | 'REJECT' | null; decidedAt: string | null;
  nextAction: 'WAIT_BUYER_DECISION' | 'RETURN_TO_SELLER' | 'SHIP_TO_BUYER' | null;
  certificateStatus: 'ISSUED' | 'REVOKED' | null;
};

/**
 * Narrow consumer port for UI2's shipping client (OWNERSHIP method names). The binding
 * injects the current account token and keeps one Idempotency-Key per attempt; screens
 * pass the key they hold so a retry after an uncertain outcome is the same command.
 */
export type FulfillmentPort = {
  getDelivery(orderId: number, signal?: AbortSignal): Promise<unknown>;
  getHistory(orderId: number, signal?: AbortSignal): Promise<unknown>;
  getReturnAddress(orderId: number, signal?: AbortSignal): Promise<unknown>;
  saveReturnAddress(orderId: number, address: ReturnAddress, idempotencyKey: string): Promise<unknown>;
  confirmReceipt(orderId: number, idempotencyKey: string): Promise<unknown>;
  reportNotReceived(orderId: number, reason: string, idempotencyKey: string): Promise<unknown>;
  confirmReturn(orderId: number, idempotencyKey: string): Promise<unknown>;
};

// ---------- tolerant-but-typed parsers ----------

export class JourneyParseError extends Error {
  readonly status = 502;
  readonly code = 'invalid_response';
  constructor(field: string) { super(`invalid ${field}`); this.name = 'JourneyParseError'; }
}

type Raw = Record<string, unknown>;
const MONEY = /^-?\d+\.\d{2}$/;
function record(value: unknown, field: string): Raw {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new JourneyParseError(field);
  return value as Raw;
}
const text = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);
const flag = (value: unknown): boolean => value === true;
function int(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new JourneyParseError(field);
  return value;
}
function money(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !MONEY.test(value)) throw new JourneyParseError(field);
  return value;
}
function policy(value: unknown): FulfillmentPolicy | null {
  return value === 'EXTERNAL_V2' || value === 'LEGACY_V1' ? value : null;
}

export function parseShipment(value: unknown): ShipmentView {
  const data = record(value, 'shipment');
  const leg = data.leg;
  if (leg !== 'TO_CENTER' && leg !== 'TO_BUYER' && leg !== 'TO_SELLER') throw new JourneyParseError('shipment.leg');
  return {
    id: int(data.id, 'shipment.id'), leg, status: text(data.status),
    carrier: text(data.carrier), trackingNumber: text(data.tracking_number), shippedAt: text(data.shipped_at),
    transportDeliveredAt: text(data.transport_delivered_at), transportSource: text(data.transport_source),
    simulatedTransport: flag(data.simulated_transport),
    recipientReceivedAt: text(data.recipient_received_at), recipientSource: text(data.recipient_source),
  };
}

export function parseSettlement(value: unknown): SettlementView | null {
  if (value === null || value === undefined) return null;
  const data = record(value, 'settlement');
  if (data.kind !== 'RELEASE' && data.kind !== 'REFUND') throw new JourneyParseError('settlement.kind');
  return {
    id: int(data.id, 'settlement.id'), kind: data.kind, source: text(data.source) ?? '', reason: text(data.reason) ?? '',
    currency: text(data.currency) ?? 'THB', settledAt: text(data.settled_at), simulated: data.simulated !== false,
    policy: text(data.fulfillment_policy),
    heldAmount: money(data.held_amount, 'settlement.held_amount'),
    buyerRefund: money(data.buyer_refund, 'settlement.buyer_refund'),
    retainedInspection: money(data.retained_inspection_amount, 'settlement.retained_inspection_amount'),
    retainedShipping: money(data.retained_shipping_amount, 'settlement.retained_shipping_amount'),
    sellerPayout: money(data.seller_payout, 'settlement.seller_payout'),
    commission: money(data.commission_amount, 'settlement.commission_amount'),
  };
}

export function parseDelivery(value: unknown): DeliveryView {
  const data = record(value, 'delivery');
  const quote = data.refund_quote === null || data.refund_quote === undefined ? null : record(data.refund_quote, 'refund_quote');
  const report = data.missing_report === null || data.missing_report === undefined ? null : record(data.missing_report, 'missing_report');
  if (!Array.isArray(data.shipments)) throw new JourneyParseError('shipments');
  return {
    orderId: int(data.order_id, 'order_id'), orderStatus: text(data.order_status) ?? 'UNKNOWN',
    serverTime: text(data.server_time), policy: policy(data.fulfillment_policy),
    resultAvailableAt: text(data.result_available_at), resultDecisionDeadlineAt: text(data.result_decision_deadline_at),
    resultTimedOutAt: text(data.result_timed_out_at),
    canConfirmReturn: flag(data.can_confirm_return), canConfirmReceipt: flag(data.can_confirm_receipt),
    // PR130 delivery_view returns `can_report_missing`; the mapping doc names it `can_report_not_received`.
    canReportNotReceived: flag(data.can_report_not_received ?? data.can_report_missing),
    chargedAmount: money(data.charged_amount, 'charged_amount'),
    refundQuote: quote && {
      buyerRefund: money(quote.buyer_refund, 'refund_quote.buyer_refund') ?? '0.00',
      retainedInspection: money(quote.retained_inspection, 'refund_quote.retained_inspection') ?? '0.00',
      retainedShipping: money(quote.retained_shipping, 'refund_quote.retained_shipping') ?? '0.00',
      requiresActualReturn: quote.requires_actual_return !== false,
    },
    shipments: data.shipments.map(parseShipment),
    receiptDeadlineAt: text(data.receipt_deadline_at), receiptConfirmedAt: text(data.receipt_confirmed_at),
    receiptConfirmationSource: text(data.receipt_confirmation_source),
    missingReportedAt: text(data.missing_reported_at),
    missingReport: report && { id: String(report.id ?? ''), reason: text(report.reason) ?? '' },
    settlementStatus: text(data.settlement_status), settlement: parseSettlement(data.settlement),
    pendingProcessing: flag(data.pending_processing),
    inspectionOverdueEscalatedAt: text(data.inspection_overdue_escalated_at),
  };
}

export function parseHistory(value: unknown): HistoryPage {
  const data = record(value, 'history');
  if (!Array.isArray(data.items)) throw new JourneyParseError('history.items');
  return {
    items: data.items.map(item => {
      const row = record(item, 'history.item');
      return { id: int(row.id, 'history.id'), fromStatus: text(row.from_status), toStatus: text(row.to_status),
        event: text(row.event) ?? 'UNKNOWN', source: text(row.source), occurredAt: text(row.occurred_at) };
    }),
    hasMore: flag(data.has_more), offset: typeof data.offset === 'number' ? data.offset : 0, limit: typeof data.limit === 'number' ? data.limit : data.items.length,
  };
}

const ADDRESS_FIELDS = ['recipient_name', 'phone', 'address_line', 'subdistrict', 'district', 'province', 'postal_code'] as const;
export function parseReturnAddress(value: unknown): ReturnAddressView {
  const data = record(value, 'return_address');
  let address: ReturnAddress | null = null;
  if (data.return_address !== null && data.return_address !== undefined) {
    const raw = record(data.return_address, 'return_address.address');
    address = Object.fromEntries(ADDRESS_FIELDS.map(key => [key, typeof raw[key] === 'string' ? raw[key] : ''])) as ReturnAddress;
  }
  return { orderId: int(data.order_id, 'order_id'), address, savedAt: text(data.saved_at), frozen: flag(data.frozen) };
}

const RESULTS = ['PASS', 'MINOR_ISSUE', 'NOT_AS_DESCRIBED', 'FAKE'] as const;
const NEXT = ['WAIT_BUYER_DECISION', 'RETURN_TO_SELLER', 'SHIP_TO_BUYER'] as const;
/** Reads window fields that the shared BuyerResult type may not declare yet. */
export function parseResultWindow(value: unknown): ResultWindow {
  const data = record(value, 'inspection');
  const decision = data.decision && typeof data.decision === 'object' ? data.decision as Raw : null;
  const certificate = data.certificate && typeof data.certificate === 'object' ? data.certificate as Raw : null;
  return {
    result: RESULTS.find(item => item === data.result) ?? null,
    policy: policy(data.fulfillment_policy),
    availableAt: text(data.result_available_at), deadlineAt: text(data.result_decision_deadline_at),
    timedOutAt: text(data.result_timed_out_at), serverTime: text(data.server_time),
    canDecide: flag(data.can_decide),
    decision: decision?.decision === 'CONFIRM' || decision?.decision === 'REJECT' ? decision.decision : null,
    decidedAt: decision ? text(decision.decided_at) : null,
    nextAction: NEXT.find(item => item === data.next_action) ?? null,
    certificateStatus: certificate?.status === 'ISSUED' || certificate?.status === 'REVOKED' ? certificate.status : null,
  };
}

// ---------- presentation derivation ----------

export type Stage =
  | 'AWAITING_PAYMENT' | 'CANCELLED' | 'AWAITING_SELLER_SHIP' | 'TO_CENTER' | 'AT_CENTER'
  | 'RESULT_DECISION_OPEN' | 'RESULT_DECISION_CLOSED_PENDING' | 'RESULT_PENDING_BUYER'
  | 'AWAITING_DISPATCH_TO_BUYER' | 'AWAITING_RETURN_DISPATCH' | 'RETURNING' | 'RETURN_RECEIVED_PENDING_REFUND'
  | 'SHIPPING_TO_BUYER' | 'DELIVERED_PENDING_BUYER' | 'DISPUTED' | 'COMPLETED' | 'REFUNDED' | 'UNKNOWN';

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';
export type JourneyAction = 'pay' | 'cancel' | 'ship-to-center' | 'open-result' | 'confirm-receipt' | 'report-not-received' | 'confirm-return' | 'review' | 'receipt';

export type Journey = {
  role: 'buyer' | 'seller';
  stage: Stage;
  tone: Tone;
  title: string;
  detail: string;
  /** Server deadline to count down to, with its server_time for skew. Informative only. */
  deadline: { label: string; at: string; serverTime: string | null; passedText: string } | null;
  actions: JourneyAction[];
  outbound: ShipmentView | null;
  inbound: ShipmentView | null;
  returnLeg: ShipmentView | null;
  legacy: boolean;
};

export type JourneyInput = {
  order: OrderDetail;
  delivery?: DeliveryView | null;
  result?: ResultWindow | null;
  /** Device clock in ms, already corrected by server skew when available. */
  now?: number;
};

const POSITIVE = new Set(['PASS', 'MINOR_ISSUE']);
export const isPositive = (result: string | null | undefined) => !!result && POSITIVE.has(result);

function before(deadline: string | null, now: number): boolean {
  if (!deadline) return false;
  const at = Date.parse(deadline);
  return !Number.isNaN(at) && now < at;
}

/** Copy from RELEASE-DESIGN "ข้อความที่ต้องตรงกัน". */
export const COPY = {
  accept: 'ยอมรับผลการตรวจ',
  reject: 'ปฏิเสธผลการตรวจและส่งคืน',
  confirmReceipt: 'ยืนยันว่าได้รับสินค้าแล้ว',
  reportNotReceived: 'แจ้งว่ายังไม่ได้รับสินค้า',
  confirmReturn: 'ยืนยันว่าได้รับสินค้าคืนแล้ว',
  returnPending: 'รับคืนแล้ว กำลังดำเนินการคืนเงิน',
  simulatedPayment: 'ชำระเงินจำลองสำหรับต้นแบบ',
  resultTimeout: 'หมดเวลาตัดสินใจ ระบบจะดำเนินการส่งคืนผู้ขาย',
  resultWindow: 'โปรดยอมรับหรือปฏิเสธผลตรวจภายในเวลาที่แสดง หากไม่ตอบ ระบบจะเปลี่ยนเป็นขั้นตอนส่งคืนผู้ขาย',
  receiptWindow: 'เมื่อระบบได้รับสถานะขนส่งว่าส่งถึงแล้ว โปรดยืนยันรับหรือแจ้งไม่ได้รับภายในเวลาที่แสดง; ระบบประมวลผลเมื่อถึงเกณฑ์',
  payout: 'ยอดจ่ายให้ผู้ขายจำลองที่บันทึกในระบบ',
  zeroReviews: 'ยังไม่มีรีวิวจากผู้ซื้อที่ซื้อสำเร็จ',
} as const;

export function deriveJourney({ order, delivery = null, result = null, now = Date.now() }: JourneyInput): Journey {
  const role = order.viewerRole;
  const buyer = role === 'buyer';
  const status = delivery?.orderStatus ?? order.status;
  const shipments = delivery?.shipments ?? [];
  const inbound = shipments.find(item => item.leg === 'TO_CENTER') ?? null;
  const outbound = shipments.find(item => item.leg === 'TO_BUYER') ?? null;
  const returnLeg = shipments.find(item => item.leg === 'TO_SELLER') ?? null;
  const settlement = delivery?.settlement ?? null;
  const legacy = (delivery?.policy ?? result?.policy) === 'LEGACY_V1';
  const serverTime = delivery?.serverTime ?? result?.serverTime ?? null;
  const base = { role, outbound, inbound, returnLeg, legacy, deadline: null as Journey['deadline'] };
  const actions: JourneyAction[] = [];
  if (buyer && order.receiptNo && order.paymentStatus !== 'UNPAID') actions.push('receipt');

  const make = (stage: Stage, tone: Tone, title: string, detail: string, extra: Partial<Journey> = {}): Journey =>
    ({ ...base, stage, tone, title, detail, actions, ...extra });

  if (status === 'WAITING_PAYMENT') {
    if (buyer && order.canPay) actions.push('pay');
    if (buyer && order.canCancel) actions.push('cancel');
    return make('AWAITING_PAYMENT', 'warning', buyer ? 'รอชำระเงิน' : 'รอผู้ซื้อชำระเงิน',
      buyer ? `${COPY.simulatedPayment} · สินค้าถูกจองไว้จนถึงเวลาที่แสดง` : 'ถ้าผู้ซื้อไม่ชำระภายในเวลา ระบบจะยกเลิกและสินค้ากลับไปขายต่อ',
      order.expiresAt ? { deadline: { label: 'เหลือเวลาชำระเงิน', at: order.expiresAt, serverTime: null, passedText: 'หมดเวลาชำระเงินแล้ว กำลังตรวจสถานะล่าสุดจากระบบ' } } : {});
  }
  if (status === 'CANCELLED') {
    return make('CANCELLED', 'neutral', 'ยกเลิกแล้ว', order.cancelReason === 'EXPIRED' ? 'หมดเวลาชำระเงิน ระบบยกเลิกให้อัตโนมัติ' : 'คำสั่งซื้อนี้ถูกยกเลิกแล้ว');
  }
  if (status === 'REFUNDED') {
    const cause = settlement ? settlementReasonLabel(settlement.reason) : 'คืนเงินแล้วตามที่ระบบบันทึก';
    return make('REFUNDED', 'info', buyer ? 'คืนเงินจำลองแล้ว' : 'คำสั่งซื้อนี้คืนเงินให้ผู้ซื้อแล้ว', cause);
  }
  if (status === 'COMPLETED') {
    if (buyer) actions.push('review');
    return make('COMPLETED', 'success', buyer ? 'คำสั่งซื้อสำเร็จ' : 'ขายสำเร็จ',
      buyer ? (delivery?.receiptConfirmationSource === 'AUTO_RECEIPT' ? 'ระบบยืนยันรับสินค้าอัตโนมัติเมื่อครบกำหนดหลังสถานะส่งถึง' : 'ยืนยันรับสินค้าแล้ว')
        : COPY.payout);
  }
  if (status === 'WAITING_SELLER_SHIP') {
    if (!buyer) actions.push('ship-to-center');
    return make('AWAITING_SELLER_SHIP', 'success', buyer ? 'ชำระเงินแล้ว รอผู้ขายส่งเข้าศูนย์ตรวจ' : 'ผู้ซื้อชำระแล้ว กรุณาส่งสินค้าเข้าศูนย์ตรวจ',
      buyer ? 'ถ้าผู้ขายไม่ส่งตามกำหนด ระบบจะคืนเงินเต็มจำนวนตามนโยบาย' : 'บันทึกที่อยู่รับคืนก่อน แล้วกรอกผู้ให้บริการขนส่งและเลขพัสดุจริง');
  }
  if (status === 'SHIPPING_TO_CENTER') {
    return make('TO_CENTER', 'info', 'กำลังส่งเข้าศูนย์ตรวจ',
      inbound?.transportDeliveredAt ? 'สถานะขนส่งแจ้งว่าถึงศูนย์แล้ว รอเจ้าหน้าที่ยืนยันรับสินค้าจริง' : 'รอศูนย์ตรวจยืนยันรับสินค้า');
  }
  if (status === 'RECEIVED_AT_CENTER' || status === 'INSPECTING') {
    return make('AT_CENTER', 'info', status === 'INSPECTING' ? 'กำลังตรวจสินค้า' : 'ศูนย์รับสินค้าแล้ว',
      delivery?.inspectionOverdueEscalatedAt ? 'การตรวจใช้เวลานานกว่ากำหนด ผู้ดูแลกำลังติดตาม' : 'ผลตรวจจะแสดงที่หน้านี้เมื่อบันทึกแล้ว');
  }
  if (status === 'DELIVERY_DISPUTED') {
    return make('DISPUTED', 'warning', buyer ? 'แจ้งว่ายังไม่ได้รับสินค้าแล้ว' : 'ผู้ซื้อแจ้งว่ายังไม่ได้รับสินค้า',
      'ผู้ดูแลกำลังตรวจสอบ เงินยังพักไว้ในระบบจนกว่าจะมีผลตัดสิน');
  }
  if (status === 'RETURNED_TO_SELLER') {
    if (settlement === null || delivery?.pendingProcessing) {
      return make('RETURN_RECEIVED_PENDING_REFUND', 'info', COPY.returnPending,
        buyer ? 'ผู้ขายรับสินค้าคืนแล้ว ระบบกำลังบันทึกการคืนเงิน ยังไม่ใช่ยอดคืนสุดท้าย' : 'คุณรับสินค้าคืนแล้ว ระบบกำลังบันทึกการคืนเงินให้ผู้ซื้อ');
    }
    return make('REFUNDED', 'info', buyer ? 'คืนเงินจำลองแล้ว' : 'คืนเงินให้ผู้ซื้อแล้ว', settlementReasonLabel(settlement.reason));
  }
  if (status === 'SHIPPING_TO_BUYER' || status === 'DELIVERED_PENDING_BUYER') {
    if (buyer && delivery?.canConfirmReceipt) actions.push('confirm-receipt');
    if (buyer && delivery?.canReportNotReceived) actions.push('report-not-received');
    const delivered = !!outbound?.transportDeliveredAt || status === 'DELIVERED_PENDING_BUYER';
    const deadline = delivery?.receiptDeadlineAt
      ? { label: 'เวลายืนยันรับหรือแจ้งไม่ได้รับ', at: delivery.receiptDeadlineAt, serverTime, passedText: 'ครบกำหนดแล้ว ระบบจะประมวลผลตามสถานะล่าสุด' }
      : null;
    return make(delivered ? 'DELIVERED_PENDING_BUYER' : 'SHIPPING_TO_BUYER', delivered ? 'warning' : 'info',
      delivered ? (buyer ? 'สถานะขนส่ง: ส่งถึงแล้ว' : 'สถานะขนส่ง: ส่งถึงผู้ซื้อแล้ว') : (buyer ? 'กำลังส่งถึงคุณ' : 'กำลังส่งถึงผู้ซื้อ'),
      buyer ? COPY.receiptWindow : 'เงินยังพักไว้จนกว่าผู้ซื้อยืนยันรับหรือครบกำหนดหลังสถานะส่งถึง',
      { deadline });
  }
  if (status === 'RESULT_NOTIFIED') {
    if (returnLeg) {
      if (!buyer && delivery?.canConfirmReturn) actions.push('confirm-return');
      return make('RETURNING', 'info', buyer ? 'กำลังส่งสินค้าคืนผู้ขาย' : 'ศูนย์กำลังส่งสินค้าคืนคุณ',
        buyer ? 'การคืนเงินเริ่มหลังผู้ขายยืนยันรับสินค้าคืนจริง ยอดด้านล่างเป็นประมาณการ ยังไม่ใช่เงินคืน'
          : 'เมื่อได้รับพัสดุจริง กด "ยืนยันว่าได้รับสินค้าคืนแล้ว" สถานะขนส่งอย่างเดียวไม่ใช่การยืนยันรับคืน');
    }
    if (buyer) {
      actions.push('open-result');
      const positive = isPositive(result?.result);
      if (result && !positive) {
        return make('AWAITING_RETURN_DISPATCH', 'danger', 'ผลตรวจไม่ผ่าน สินค้าจะถูกส่งคืนผู้ขาย',
          'ผลนี้ไม่มีใบรับรองและไม่มีการยอมรับผลตรวจ คืนเงินตามนโยบายหลังผู้ขายรับสินค้าคืนจริง');
      }
      if (result?.decision === 'CONFIRM') return make('AWAITING_DISPATCH_TO_BUYER', 'success', 'ยอมรับผลตรวจแล้ว รอศูนย์จัดส่งถึงคุณ', 'การยอมรับผลตรวจยังไม่ใช่การยืนยันว่าได้รับสินค้า');
      if (result?.decision === 'REJECT') return make('AWAITING_RETURN_DISPATCH', 'info', 'ปฏิเสธผลตรวจแล้ว รอศูนย์ส่งคืนผู้ขาย', 'คืนค่าสินค้าหลังผู้ขายยืนยันรับสินค้าคืนจริง');
      if (result?.timedOutAt) return make('AWAITING_RETURN_DISPATCH', 'info', COPY.resultTimeout, 'ไม่มีการยอมรับผลตรวจแทนคุณ คืนค่าสินค้าหลังผู้ขายรับสินค้าคืนจริง');
      if (result?.canDecide) {
        // Legacy orders keep their accepted decision rule with no new 72h window.
        return make('RESULT_DECISION_OPEN', 'warning', 'ผลตรวจพร้อมแล้ว กรุณาตัดสินใจ', result.deadlineAt ? COPY.resultWindow : 'โปรดอ่านรายงานและหลักฐานก่อนตัดสินผลตรวจ',
          result.deadlineAt ? { deadline: { label: 'เวลาตัดสินผลตรวจ', at: result.deadlineAt, serverTime: result.serverTime, passedText: COPY.resultTimeout } } : {});
      }
      if (positive && result?.deadlineAt && !before(result.deadlineAt, now)) {
        return make('RESULT_DECISION_CLOSED_PENDING', 'info', COPY.resultTimeout, 'หมดเวลาตัดสินผลตรวจแล้ว ระบบกำลังบันทึกขั้นตอนส่งคืน');
      }
      return make('RESULT_PENDING_BUYER', 'info', 'แจ้งผลตรวจแล้ว', 'เปิดผลตรวจเพื่อดูรายละเอียด');
    }
    // Seller: no access to the Buyer result. Use only what delivery exposes.
    if (delivery?.resultTimedOutAt) return make('AWAITING_RETURN_DISPATCH', 'info', 'ผู้ซื้อไม่ตัดสินผลตรวจภายในเวลา', 'ศูนย์จะส่งสินค้าคืนคุณ');
    if (delivery?.resultDecisionDeadlineAt && before(delivery.resultDecisionDeadlineAt, now)) {
      return make('RESULT_PENDING_BUYER', 'info', 'แจ้งผลตรวจแล้ว รอผู้ซื้อตัดสินผลตรวจ', 'ถ้าผู้ซื้อไม่ตอบภายในเวลา ระบบจะเปลี่ยนเป็นขั้นตอนส่งคืน',
        { deadline: { label: 'เวลาผู้ซื้อตัดสินผลตรวจ', at: delivery.resultDecisionDeadlineAt, serverTime, passedText: 'ถึงเวลาแล้ว กำลังตรวจสถานะล่าสุด' } });
    }
    return make('RESULT_PENDING_BUYER', 'info', 'แจ้งผลตรวจแล้ว', 'รอศูนย์ดำเนินการขั้นถัดไปตามผลตรวจ');
  }
  return make('UNKNOWN', 'neutral', 'สถานะอื่น ๆ', 'กรุณาอัปเดตแอปหรือโหลดสถานะล่าสุด');
}

// ---------- labels ----------

export function settlementReasonLabel(reason: string | null | undefined): string {
  switch (reason) {
    case 'RECEIPT_CONFIRMED': return 'ผู้ซื้อยืนยันรับสินค้า';
    case 'RECEIPT_TIMEOUT': return 'ระบบยืนยันรับอัตโนมัติเมื่อครบกำหนดหลังสถานะส่งถึง';
    case 'DELIVERY_REVIEW_RELEASE': return 'ผู้ดูแลตัดสินให้ปล่อยเงินแก่ผู้ขาย';
    case 'BUYER_REJECTED_INSPECTION': return 'ผู้ซื้อปฏิเสธผลตรวจและผู้ขายรับสินค้าคืนแล้ว';
    case 'RESULT_DECISION_TIMEOUT': return 'หมดเวลาตัดสินผลตรวจและผู้ขายรับสินค้าคืนแล้ว';
    case 'INSPECTION_NOT_AS_DESCRIBED': return 'ผลตรวจพบว่าไม่ตรงประกาศ';
    case 'INSPECTION_FAKE': return 'ผลตรวจระบุว่าไม่ผ่านการตรวจความแท้';
    case 'SELLER_NO_SHIP': return 'ผู้ขายไม่ส่งสินค้าเข้าศูนย์ภายในกำหนด';
    case 'DELIVERY_REVIEW_REFUND': return 'ผู้ดูแลตัดสินกรณีไม่ได้รับสินค้าให้คืนเงิน';
    default: return 'รายการเงินที่ระบบบันทึกไว้';
  }
}

const EVENT_LABELS: Record<string, string> = {
  FULFILLMENT_CREATED: 'ศูนย์บันทึกการส่งออก',
  SHIPPING_DELIVERED_SIMULATED: 'สถานะขนส่งจำลอง: ส่งถึงแล้ว',
  DELIVERY_CONFIRMED: 'ผู้ขนส่งยืนยันส่งถึง (รุ่นเดิม)',
  NON_RECEIPT_REPORTED: 'ผู้ซื้อแจ้งว่ายังไม่ได้รับสินค้า',
  RETURN_RECIPIENT_CONFIRMED: 'ยืนยันรับสินค้าคืนแล้ว',
  SETTLEMENT_RELEASE: 'บันทึกการจ่ายเงินให้ผู้ขาย (จำลอง)',
  SETTLEMENT_REFUND: 'บันทึกการคืนเงินให้ผู้ซื้อ (จำลอง)',
  RESULT_DECISION_TIMEOUT: 'หมดเวลาตัดสินผลตรวจ',
  INSPECTION_OVERDUE: 'การตรวจเกินกำหนด ส่งเรื่องให้ผู้ดูแล',
};
const SOURCE_LABELS: Record<string, string> = {
  BUYER: 'ผู้ซื้อ', SELLER: 'ผู้ขาย', ADMIN: 'ผู้ดูแล', INSPECTOR: 'ศูนย์ตรวจ', SYSTEM: 'ระบบ',
  ADMIN_DEMO: 'ขนส่งจำลอง', COURIER: 'ผู้ขนส่งรุ่นเดิม', BUYER_RECEIPT: 'ผู้ซื้อ', AUTO_RECEIPT: 'ระบบ',
  RETURN_DELIVERY: 'การรับคืน', SELLER_NO_SHIP: 'ระบบ', ADMIN_RESOLUTION: 'ผู้ดูแล',
};
export const historyEventLabel = (event: string) => EVENT_LABELS[event] ?? 'อัปเดตสถานะ';
export const historySourceLabel = (source: string | null) => (source ? SOURCE_LABELS[source] ?? 'ระบบ' : 'ระบบ');
export const recipientSourceLabel = historySourceLabel;

// ---------- money (display of server snapshots only; no arithmetic) ----------

export type MoneyLine = { label: string; amount: string | null; emphasis?: boolean; negative?: boolean; note?: string };
export type MoneySummary = {
  title: string;
  lines: MoneyLine[];
  /** Separate block: settled refund/payout, or a labelled quote/estimate. */
  outcome: { kind: 'settled' | 'quote' | 'estimate' | 'none'; title: string; lines: MoneyLine[]; reference: string | null; settledAt: string | null; note: string | null };
};

const isZero = (amount: string | null) => !amount || /^0+\.00$/.test(amount);

export function deriveMoney(order: OrderDetail, delivery: DeliveryView | null): MoneySummary {
  const settlement = delivery?.settlement ?? null;
  const reference = settlement ? `#${settlement.id}` : null;
  if (order.viewerRole === 'buyer') {
    const lines: MoneyLine[] = [
      { label: 'ราคาสินค้า', amount: order.amounts.itemPrice },
      { label: 'ค่าจัดส่ง', amount: order.amounts.shippingFee },
      { label: 'ค่าตรวจสอบสินค้า', amount: order.amounts.inspectionFee },
      { label: order.paymentStatus === 'UNPAID' ? 'ยอดที่ต้องชำระ' : 'ยอดที่ชำระ (จำลอง)', amount: delivery?.chargedAmount ?? order.amounts.totalAmount, emphasis: true },
    ];
    if (settlement?.kind === 'REFUND') {
      const outcome: MoneyLine[] = [{ label: 'คืนเงินจำลอง', amount: settlement.buyerRefund, emphasis: true }];
      if (!isZero(settlement.retainedInspection)) outcome.push({ label: 'ไม่คืนค่าตรวจสอบ', amount: settlement.retainedInspection });
      if (!isZero(settlement.retainedShipping)) outcome.push({ label: 'ไม่คืนค่าจัดส่ง', amount: settlement.retainedShipping });
      return { title: 'สรุปการชำระเงิน', lines, outcome: { kind: 'settled', title: settlementReasonLabel(settlement.reason), lines: outcome, reference, settledAt: settlement.settledAt,
        note: 'ใบเสร็จการชำระเดิมยังคงเดิม การคืนเงินบันทึกเป็นรายการแยก' } };
    }
    if (settlement?.kind === 'RELEASE') {
      return { title: 'สรุปการชำระเงิน', lines, outcome: { kind: 'settled', title: 'ระบบปล่อยเงินที่พักไว้ให้ผู้ขายแล้ว (จำลอง)', lines: [], reference, settledAt: settlement.settledAt, note: settlementReasonLabel(settlement.reason) } };
    }
    const quote = delivery?.refundQuote;
    if (quote) {
      const itemOnly = !isZero(quote.retainedInspection) || !isZero(quote.retainedShipping);
      const quoteLines: MoneyLine[] = [{ label: 'ประมาณการคืนเงิน', amount: quote.buyerRefund, emphasis: true }];
      if (!isZero(quote.retainedInspection)) quoteLines.push({ label: 'ไม่คืนค่าตรวจสอบ', amount: quote.retainedInspection });
      if (!isZero(quote.retainedShipping)) quoteLines.push({ label: 'ไม่คืนค่าจัดส่ง', amount: quote.retainedShipping });
      return { title: 'สรุปการชำระเงิน', lines, outcome: { kind: 'quote', title: itemOnly ? 'คืนค่าสินค้าหลังผู้ขายรับคืนจริง' : 'คืนเงินเต็มจำนวนหลังผู้ขายรับคืนจริง', lines: quoteLines, reference: null, settledAt: null,
        note: 'ประมาณการตามนโยบายที่บันทึกไว้ ยังไม่ใช่การคืนเงิน' } };
    }
    return { title: 'สรุปการชำระเงิน', lines, outcome: { kind: 'none', title: '', lines: [], reference: null, settledAt: null, note: null } };
  }
  const lines: MoneyLine[] = [{ label: 'ราคาสินค้า', amount: order.amounts.itemPrice }];
  if (settlement) {
    const outcome: MoneyLine[] = settlement.kind === 'RELEASE'
      ? [{ label: 'ค่าธรรมเนียมระบบ', amount: settlement.commission, negative: !isZero(settlement.commission) }, { label: COPY.payout, amount: settlement.sellerPayout, emphasis: true }]
      : [{ label: 'ยอดจ่ายให้ผู้ขาย', amount: settlement.sellerPayout, emphasis: true }];
    return { title: 'รายได้จากคำสั่งซื้อนี้', lines, outcome: { kind: 'settled', title: settlementReasonLabel(settlement.reason), lines: outcome, reference, settledAt: settlement.settledAt,
      note: settlement.kind === 'REFUND' ? 'คำสั่งซื้อนี้คืนเงินให้ผู้ซื้อ จึงไม่มีการจ่ายเงินให้ผู้ขาย' : null } };
  }
  const returning = (delivery?.shipments ?? []).some(item => item.leg === 'TO_SELLER') || delivery?.orderStatus === 'RETURNED_TO_SELLER';
  if (returning || order.status === 'CANCELLED' || order.status === 'WAITING_PAYMENT') {
    return { title: 'รายได้จากคำสั่งซื้อนี้', lines, outcome: { kind: 'none', title: '', lines: [], reference: null, settledAt: null,
      note: returning ? 'อยู่ระหว่างส่งคืน ยอดจริงแสดงเมื่อระบบบันทึกผล' : null } };
  }
  return { title: 'รายได้จากคำสั่งซื้อนี้', lines, outcome: { kind: 'estimate', title: 'ประมาณการหากขายสำเร็จ', lines: [
    { label: 'ค่าธรรมเนียมระบบ (ประมาณการ)', amount: order.amounts.commissionFee, negative: !isZero(order.amounts.commissionFee) },
    { label: 'ยอดที่จะได้รับ (ประมาณการ)', amount: order.amounts.sellerPayout, emphasis: true },
  ], reference: null, settledAt: null, note: 'ยังไม่ใช่เงินที่จ่ายจริง ยอดจริงแสดงเมื่อระบบบันทึก settlement' } };
}
