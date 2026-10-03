/**
 * QA FIXTURE scenes for UI1-05 states that the design reference does not illustrate.
 * Renders the real section components used by OrderDetailScreen with server-shaped
 * fixtures (same shape the UI1 API smoke validated). Actions are inert.
 */
import { View } from 'react-native';
import { FulfillmentPortProvider } from '../../src/orders/fulfillment-binding';
import { deriveJourney, deriveMoney, parseDelivery, parseHistory, parseResultWindow, parseReturnAddress, type FulfillmentPort } from '../../src/orders/order-journey';
import { useJourneyCommand } from '../../src/orders/use-order-journey';
import type { ActionFailure } from '../../src/orders/action-errors';
import { describeActionError } from '../../src/orders/action-errors';
import type { OrderDetail } from '../../src/services/order-service';
import {
  BuyerReceiptPanel, HistoryCard, JourneyBanner, JourneyUnavailable, MoneyCard, SellerReturnPanel, ShipmentCard, TimelineCard, journeyTimeline,
} from '../../src/components/order-journey-sections';
import { ReturnAddressForm } from '../../src/components/return-address-form';
import { BuyerResultView } from '../../src/components/inspection/views';
import { ActionNotice, SectionCard } from '../../src/components/wondee/status';
import { Button } from '../../src/components/order-ui';
import { ThemedText } from '../../src/components/themed-text';

const NOW = Date.now();
const iso = (hours: number) => new Date(NOW + hours * 3600_000).toISOString();

const inert: FulfillmentPort = {
  getDelivery: async () => ({}), getHistory: async () => ({}), getReturnAddress: async () => ({}),
  saveReturnAddress: async () => { throw { status: 503, code: 'qa_fixture' }; },
  confirmReceipt: async () => { throw { status: 503, code: 'qa_fixture' }; },
  reportNotReceived: async () => { throw { status: 503, code: 'qa_fixture' }; },
  confirmReturn: async () => { throw { status: 503, code: 'qa_fixture' }; },
};

const order = (extra: Partial<OrderDetail> = {}): OrderDetail => ({
  id: 42, status: 'RESULT_NOTIFIED', paymentStatus: 'PAID', viewerRole: 'buyer',
  product: { id: 7, name: 'แจ็กเก็ตยีนส์ ตัวอย่าง QA', condition: 'GOOD', size: 'M' },
  amounts: { currency: 'THB', itemPrice: '1200.00', shippingFee: '50.00', inspectionFee: '100.00', totalAmount: '1350.00', commissionFee: '60.00', sellerPayout: '1140.00' },
  shippingAddress: null, lastPaymentAttempt: null, paidAt: iso(-90), receiptNo: 'QA-RC-0042', canPay: false, canCancel: false,
  expiresAt: null, cancelledAt: null, cancelReason: null, createdAt: iso(-91), ...extra,
});
const ship = (leg: string, extra: Record<string, unknown> = {}) => ({
  id: leg === 'TO_CENTER' ? 1 : leg === 'TO_BUYER' ? 2 : 3, leg, status: 'SHIPPED', carrier: leg === 'TO_CENTER' ? 'ขนส่งท้องถิ่น อื่น ๆ' : 'Demo carrier',
  tracking_number: leg === 'TO_CENTER' ? 'local-trk 001' : `OUT-42-${leg}`, shipped_at: leg === 'TO_CENTER' ? iso(-88) : iso(-20),
  transport_delivered_at: null, transport_source: null, simulated_transport: false, recipient_received_at: null, recipient_source: null, ...extra,
});
const inbound = ship('TO_CENTER', { recipient_received_at: iso(-80), recipient_source: 'INSPECTOR' });
const delivery = (extra: Record<string, unknown> = {}) => ({
  order_id: 42, order_status: 'RESULT_NOTIFIED', server_time: iso(0), fulfillment_policy: 'EXTERNAL_V2',
  result_available_at: iso(-30), result_decision_deadline_at: iso(42), result_timed_out_at: null, can_confirm_return: false,
  charged_amount: '1350.00', refund_quote: null, shipments: [inbound], receipt_deadline_at: null, receipt_confirmed_at: null,
  receipt_confirmation_source: null, missing_reported_at: null, missing_report: null, settlement_status: 'HELD', settlement: null,
  pending_processing: false, inspection_overdue_escalated_at: null, can_confirm_receipt: false, can_report_missing: false, ...extra,
});
const result = (extra: Record<string, unknown> = {}) => ({
  order_id: 42, result: 'PASS', certificate: { status: 'ISSUED' }, decision: null, fulfillment_policy: 'EXTERNAL_V2',
  result_available_at: iso(-30), result_decision_deadline_at: iso(42), result_timed_out_at: null, server_time: iso(0), can_decide: true,
  next_action: 'WAIT_BUYER_DECISION', ...extra,
});
const quote = { buyer_refund: '1200.00', retained_inspection: '100.00', retained_shipping: '50.00', requires_actual_return: true };
const refund = (reason: string, amounts: [string, string, string]) => ({ id: 55, kind: 'REFUND', source: 'RETURN_DELIVERY', reason, currency: 'THB',
  settled_at: iso(-1), simulated: true, fulfillment_policy: 'EXTERNAL_V2', held_amount: '1350.00', buyer_refund: amounts[0],
  retained_inspection_amount: amounts[1], retained_shipping_amount: amounts[2] });
const history = { items: [
  { id: 1, from_status: 'RESULT_NOTIFIED', to_status: 'RESULT_NOTIFIED', event: 'FULFILLMENT_CREATED', source: 'INSPECTOR', occurred_at: iso(-20) },
  { id: 2, from_status: 'RESULT_NOTIFIED', to_status: 'RESULT_NOTIFIED', event: 'SHIPPING_DELIVERED_SIMULATED', source: 'ADMIN_DEMO', occurred_at: iso(-3) },
], limit: 100, offset: 0, has_more: false };

type Fixture = { order: OrderDetail; delivery?: Record<string, unknown> | null; result?: Record<string, unknown> | null; failure?: ActionFailure | null; note?: string };

const FIXTURES: Record<string, Fixture> = {
  'journey-decision': { order: order(), delivery: delivery(), result: result() },
  'journey-timeout': { order: order(), delivery: delivery({ result_timed_out_at: iso(-1), result_available_at: iso(-73), result_decision_deadline_at: iso(-1) }),
    result: result({ can_decide: false, result_timed_out_at: iso(-1), result_available_at: iso(-73), result_decision_deadline_at: iso(-1), next_action: 'RETURN_TO_SELLER' }) },
  'journey-shipping': { order: order({ status: 'SHIPPING_TO_BUYER' }), delivery: delivery({ order_status: 'SHIPPING_TO_BUYER', shipments: [inbound, ship('TO_BUYER')], can_confirm_receipt: true, can_report_missing: true }),
    result: result({ can_decide: false, decision: { decision: 'CONFIRM', decided_at: iso(-25) }, next_action: 'SHIP_TO_BUYER' }) },
  'journey-delivered': { order: order({ status: 'DELIVERED_PENDING_BUYER' }), delivery: delivery({ order_status: 'DELIVERED_PENDING_BUYER', receipt_deadline_at: iso(69),
    shipments: [inbound, ship('TO_BUYER', { transport_delivered_at: iso(-3), transport_source: 'ADMIN_DEMO', simulated_transport: true })], can_confirm_receipt: true, can_report_missing: true }) },
  'journey-disputed': { order: order({ status: 'DELIVERY_DISPUTED' }), delivery: delivery({ order_status: 'DELIVERY_DISPUTED', missing_reported_at: iso(-2),
    missing_report: { id: '9', reason: 'ยังไม่ได้รับพัสดุตามเลขติดตามที่แจ้ง' }, shipments: [inbound, ship('TO_BUYER')] }) },
  'journey-seller-return': { order: order({ viewerRole: 'seller' }), delivery: delivery({ charged_amount: null, can_confirm_return: true,
    shipments: [inbound, ship('TO_SELLER', { transport_delivered_at: iso(-2), transport_source: 'ADMIN_DEMO', simulated_transport: true })] }) },
  'journey-buyer-returning': { order: order(), delivery: delivery({ refund_quote: quote, shipments: [inbound, ship('TO_SELLER')] }),
    result: result({ can_decide: false, decision: { decision: 'REJECT', decided_at: iso(-26) }, next_action: 'RETURN_TO_SELLER' }) },
  'journey-return-pending': { order: order({ viewerRole: 'seller', status: 'RETURNED_TO_SELLER' }), delivery: delivery({ order_status: 'RETURNED_TO_SELLER', pending_processing: true, charged_amount: null,
    shipments: [inbound, ship('TO_SELLER', { transport_delivered_at: iso(-4), transport_source: 'ADMIN_DEMO', simulated_transport: true, recipient_received_at: iso(-1), recipient_source: 'SELLER' })] }) },
  'journey-return-pending-buyer': { order: order({ status: 'RETURNED_TO_SELLER' }), delivery: delivery({ order_status: 'RETURNED_TO_SELLER', pending_processing: true, refund_quote: quote,
    shipments: [inbound, ship('TO_SELLER', { recipient_received_at: iso(-1), recipient_source: 'SELLER' })] }) },
  'journey-refund-item': { order: order({ status: 'REFUNDED', paymentStatus: 'REFUNDED' }), delivery: delivery({ order_status: 'REFUNDED', settlement_status: 'REFUNDED',
    settlement: refund('BUYER_REJECTED_INSPECTION', ['1200.00', '100.00', '50.00']), refund_quote: quote,
    shipments: [inbound, ship('TO_SELLER', { recipient_received_at: iso(-2), recipient_source: 'SELLER' })] }) },
  'journey-refund-full': { order: order({ status: 'REFUNDED', paymentStatus: 'REFUNDED' }), delivery: delivery({ order_status: 'REFUNDED', settlement_status: 'REFUNDED', result_available_at: null, result_decision_deadline_at: null,
    settlement: refund('INSPECTION_FAKE', ['1350.00', '0.00', '0.00']), refund_quote: { ...quote, buyer_refund: '1350.00', retained_inspection: '0.00', retained_shipping: '0.00' },
    shipments: [inbound, ship('TO_SELLER', { recipient_received_at: iso(-2), recipient_source: 'SELLER' })] }) },
  'journey-seller-payout': { order: order({ viewerRole: 'seller', status: 'COMPLETED' }), delivery: delivery({ order_status: 'COMPLETED', charged_amount: null, receipt_confirmed_at: iso(-1), receipt_confirmation_source: 'BUYER_RECEIPT',
    settlement: { id: 57, kind: 'RELEASE', source: 'BUYER_RECEIPT', reason: 'RECEIPT_CONFIRMED', currency: 'THB', settled_at: iso(-1), simulated: true, fulfillment_policy: 'EXTERNAL_V2', seller_payout: '1140.00', commission_amount: '60.00' },
    shipments: [inbound, ship('TO_BUYER', { transport_delivered_at: iso(-5), transport_source: 'ADMIN_DEMO', simulated_transport: true, recipient_received_at: iso(-1), recipient_source: 'BUYER' })] }) },
  'journey-unavailable': { order: order({ status: 'WAITING_SELLER_SHIP', viewerRole: 'seller' }), delivery: null },
};

function Preview({ fixture }: { fixture: Fixture }) {
  const parsedDelivery = fixture.delivery ? parseDelivery(fixture.delivery) : null;
  const parsedResult = fixture.result ? parseResultWindow(fixture.result) : null;
  const journey = deriveJourney({ order: fixture.order, delivery: parsedDelivery, result: parsedResult });
  const money = deriveMoney(fixture.order, parsedDelivery);
  const command = useJourneyCommand(async () => {});
  const steps = journeyTimeline({ createdAt: fixture.order.createdAt, paidAt: fixture.order.paidAt, journey, delivery: parsedDelivery, result: parsedResult });
  const buyer = fixture.order.viewerRole === 'buyer';
  return <View style={{ gap: 14 }}>
    <JourneyBanner journey={journey} />
    {!parsedDelivery ? <JourneyUnavailable /> : null}
    {buyer && journey.actions.includes('open-result') ? <SectionCard title="ผลการตรวจสินค้า">
      <Button label={journey.stage === 'RESULT_DECISION_OPEN' ? 'ดูผลตรวจและยอมรับผลการตรวจหรือปฏิเสธ' : 'ดูผลตรวจและใบรับรอง'} variant={journey.stage === 'RESULT_DECISION_OPEN' ? 'primary' : 'secondary'} onPress={() => {}} />
    </SectionCard> : null}
    {buyer && parsedDelivery ? <BuyerReceiptPanel journey={journey} delivery={parsedDelivery} command={command} orderId={42} /> : null}
    {!buyer && parsedDelivery ? <SellerReturnPanel journey={journey} delivery={parsedDelivery} command={command} orderId={42} /> : null}
    {journey.outbound ? <ShipmentCard shipment={journey.outbound} /> : null}
    {journey.returnLeg ? <ShipmentCard shipment={journey.returnLeg} /> : null}
    <TimelineCard steps={steps} current={journey.title} />
    <MoneyCard summary={money} />
    {parsedDelivery && (journey.returnLeg?.transportDeliveredAt || journey.outbound?.transportDeliveredAt) ? <HistoryCard history={parseHistory(history)} /> : null}
  </View>;
}

function ErrorsPreview() {
  const cases: [string, unknown][] = [
    ['เครือข่ายไม่แน่นอน (ใช้คีย์เดิม)', { status: 0, code: 'network_error' }],
    ['401 เซสชันหมดอายุ', { status: 401, code: null }],
    ['403 การจำลองปิดอยู่', { status: 403, code: 'fulfillment_simulation_disabled' }],
    ['404 ไม่พบ/ไม่มีสิทธิ์', { status: 404, code: 'order_not_found' }],
    ['409 เลยเวลาตัดสินผลตรวจ', { status: 409, code: 'result_decision_deadline_passed' }],
    ['409 เลยเวลายืนยันรับ', { status: 409, code: 'receipt_deadline_passed' }],
    ['422 ข้อมูลไม่ถูกต้อง', { status: 422, code: 'validation_error', fields: { reason: 'อย่างน้อย 10 ตัวอักษร' } }],
  ];
  return <View style={{ gap: 12 }}>{cases.map(([label, error]) => <View key={label} style={{ gap: 6 }}>
    <ThemedText type="smallBold">{label}</ThemedText>
    <ActionNotice failure={describeActionError(error)} onRetry={() => {}} onRefetch={() => {}} onLogin={() => {}} />
  </View>)}</View>;
}

export function JourneyScene({ scene }: { scene: string }) {
  if (scene === 'journey-errors') return <ErrorsPreview />;
  if (scene === 'return-address-form') return <ReturnAddressForm view={parseReturnAddress({ order_id: 42, return_address: null, saved_at: null, frozen: false })} busy={false}
    failure={null} onSave={async () => false} />;
  if (scene === 'return-address-frozen') return <ReturnAddressForm view={parseReturnAddress({ order_id: 42, frozen: true, saved_at: iso(-89), return_address: {
    recipient_name: 'ผู้ขาย ตัวอย่าง', phone: '0899999999', address_line: '1 ถนนคืนสินค้า', subdistrict: 'แขวงคืน', district: 'เขตคืน', province: 'กรุงเทพมหานคร', postal_code: '10200' } })}
    busy={false} failure={null} onSave={async () => false} />;
  if (scene === 'result-window') return <BuyerResultView outcome="PASS" summary="ตรวจพบสภาพตามรายละเอียดที่บันทึกไว้ มีรอยใช้งานเล็กน้อยบริเวณปลายแขน" inspectedAt={iso(-30)}
    certificate={{ number: 'QA-CERT-0042', publicUrl: '', issuedAt: iso(-30), status: 'ISSUED' }} nextAction="WAIT_BUYER_DECISION" certificateDecision canDecide
    decisionDeadline={iso(42)} serverTime={iso(0)} policy="EXTERNAL_V2" onDecision={() => {}} />;
  if (scene === 'result-timeout') return <BuyerResultView outcome="MINOR_ISSUE" summary="ผ่านการตรวจ พบรอยขีดข่วนเล็กน้อยตามภาพหลักฐาน" inspectedAt={iso(-73)}
    certificate={{ number: 'QA-CERT-0043', publicUrl: '', issuedAt: iso(-73), status: 'ISSUED' }} nextAction="RETURN_TO_SELLER" certificateDecision canDecide={false}
    timedOutAt={iso(-1)} policy="EXTERNAL_V2" />;
  const fixture = FIXTURES[scene];
  if (!fixture) return <ThemedText>ไม่พบ scene</ThemedText>;
  return <FulfillmentPortProvider port={fixture.delivery ? inert : null}><Preview fixture={fixture} /></FulfillmentPortProvider>;
}

export const JOURNEY_SCENES = [...Object.keys(FIXTURES), 'journey-errors', 'return-address-form', 'return-address-frozen', 'result-window', 'result-timeout'];
