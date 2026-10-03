/**
 * UI2-03 Admin delivery work. Every reference comes from a server review result, every
 * decision needs a reason, and results are refetched. A demo transport event is a
 * simulated carrier fact, never a recipient receipt, and never closes a return/refund.
 */
import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useFulfillmentApi, useInspectionMutation } from '@/inspections/use-inspection-api';
import { orderStatusLabel } from '@/orders/order-format';
import type {
  AdminOrderShipments, DeliveryResolution, DeliveryReviewResult, ReturnReceiptResult, ReturnReviewResult, ShipmentLeg, ShippingEventResult,
} from '@/fulfillment/contract';
import { Button } from '../order-ui';
import { ThemedText } from '../themed-text';
import { ConfirmationSheet, EmptyState, TextField } from '../wondee/primitives';
import { Chips, Field, LoadState, Notice, ReasonInput, SimLabel, StaffScreen, codePoints, useStaffResource, when } from './staff-ui';

type Section = 'cases' | 'returns' | 'events';
const LEG_LABEL: Record<ShipmentLeg, string> = { TO_CENTER: 'ผู้ขาย → ศูนย์', TO_BUYER: 'ศูนย์ → ผู้ซื้อ', TO_SELLER: 'ศูนย์ → ผู้ขาย (คืน)' };
const validReason = (value: string) => codePoints(value) >= 10 && codePoints(value) <= 1000;

// ------------------------------------------------------------ non-receipt cases

export function DeliveryCaseReview({ review, busy, onResolve }: {
  review: DeliveryReviewResult; busy: boolean; onResolve(input: { resolution: DeliveryResolution; reason: string; evidence_refs: string[] }): void;
}) {
  const issued = useMemo(() => [review.report.reference, review.audit_reference, ...review.proofs.map(proof => proof.reference)], [review]);
  const [refs, setRefs] = useState<string[]>([review.report.reference, review.audit_reference]);
  const [resolution, setResolution] = useState<DeliveryResolution | null>(null);
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const valid = !!resolution && validReason(reason) && refs.length >= 1;
  return <View style={{ gap: 12 }} testID="delivery-case-review">
    <Notice tone="neutral" title={`เคสคำสั่งซื้อ #${review.order_id}`} detail={`สถานะ: ${orderStatusLabel(review.order_status)} · เปิดตรวจ ${review.audit_reference}`}>
      <ThemedText type="smallBold">เหตุผลที่ผู้ซื้อแจ้ง (เห็นเฉพาะการตรวจที่บันทึก audit)</ThemedText>
      <ThemedText type="small">{review.report.reason}</ThemedText>
      <Field label="อ้างอิงรายงาน" value={review.report.reference} mono />
      {review.proofs.length ? <Field label="หลักฐานส่งถึง (รุ่นเดิม)" value={review.proofs.map(proof => proof.reference).join(', ')} mono /> : <ThemedText type="small" themeColor="textSecondary">ไม่มีรูปหลักฐานส่งถึง (คำสั่งซื้อใหม่ไม่บังคับรูป)</ThemedText>}
    </Notice>
    <ThemedText type="smallBold">อ้างอิงที่ใช้ตัดสิน (ออกโดยระบบในการตรวจนี้เท่านั้น)</ThemedText>
    <Chips multi options={issued.map(ref => ({ value: ref, label: ref }))} value={refs} disabled={busy}
      onChange={ref => setRefs(current => current.includes(ref) ? current.filter(item => item !== ref) : [...current, ref])} />
    <ThemedText type="smallBold">ผลการตัดสิน (เลือกได้อย่างเดียว)</ThemedText>
    <Chips<DeliveryResolution> options={[{ value: 'REFUND', label: 'คืนเงินผู้ซื้อ (REFUND)' }, { value: 'RELEASE', label: 'ปล่อยเงินให้ผู้ขาย (RELEASE)' }]} value={resolution} disabled={busy} onChange={value => setResolution(value)} />
    {resolution ? <Notice tone="info" title={resolution === 'REFUND' ? 'คืนเงินเต็มจำนวนตามนโยบาย' : 'ปล่อยเงินให้ผู้ขายตามการขายปกติ'}
      detail={resolution === 'REFUND' ? 'ผู้ซื้อได้รับเงินคืนตามยอดที่บันทึก ไม่มีการจ่ายผู้ขายและไม่มีค่าธรรมเนียม' : 'ผู้ขายได้รับยอดหลังหักค่าธรรมเนียมตามที่บันทึก ไม่มีการคืนเงินผู้ซื้อ'} /> : null}
    <ReasonInput label="เหตุผลของผู้ดูแล" value={reason} onChange={setReason} editable={!busy} />
    <Button label="ตรวจทานและตัดสิน" variant="primary" busy={busy} disabled={!valid} onPress={() => setConfirming(true)} />
    <ConfirmationSheet visible={confirming} title="ยืนยันการตัดสินเคส" onClose={() => setConfirming(false)}>
      <ThemedText type="subtitle">{resolution === 'REFUND' ? 'คืนเงินผู้ซื้อ (REFUND)' : 'ปล่อยเงินให้ผู้ขาย (RELEASE)'}</ThemedText>
      <ThemedText type="small">{reason.trim()}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">อ้างอิง: {[...refs].sort().join(', ')}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">ระบบบันทึกผลได้ครั้งเดียวต่อคำสั่งซื้อ (เงินจำลอง) แก้ไขภายหลังไม่ได้</ThemedText>
      <Button label="ยืนยันการตัดสิน" variant="primary" busy={busy} onPress={() => { if (resolution) onResolve({ resolution, reason: reason.trim(), evidence_refs: refs }); setConfirming(false); }} />
    </ConfirmationSheet>
  </View>;
}

function Cases() {
  const api = useFulfillmentApi();
  const action = useInspectionMutation();
  const [offset, setOffset] = useState(0);
  const cases = useStaffResource(useCallback(() => api.call(token => api.service.listDeliveryCases(token, { offset })), [api, offset]));
  const [selected, setSelected] = useState<number | null>(null);
  const [reviewReason, setReviewReason] = useState('');
  const [review, setReview] = useState<DeliveryReviewResult | null>(null);
  const [resolved, setResolved] = useState<string | null>(null);
  const open = (orderId: number) => { setSelected(orderId); setReview(null); setReviewReason(''); setResolved(null); };
  return <>
    <ThemedText themeColor="textSecondary">เคสที่ผู้ซื้อแจ้งว่ายังไม่ได้รับสินค้า ต้องเปิดตรวจพร้อมเหตุผลก่อนเห็นรายละเอียดและตัดสิน</ThemedText>
    <LoadState {...cases} />
    {cases.data?.items.length === 0 ? <EmptyState title="ไม่มีเคสแจ้งไม่ได้รับสินค้าที่เปิดอยู่" /> : null}
    {cases.data?.items.map(item => <Button key={item.order_id} label={`คำสั่งซื้อ #${item.order_id} · แจ้งเมื่อ ${when(item.reported_at)}`}
      variant={selected === item.order_id ? 'primary' : 'secondary'} onPress={() => open(item.order_id)} />)}
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {offset > 0 ? <Button label="หน้าก่อน" onPress={() => setOffset(value => Math.max(0, value - 20))} /> : null}
      {cases.data?.has_more ? <Button label="หน้าถัดไป" onPress={() => setOffset(value => value + 20)} /> : null}
    </View>
    {selected !== null && !review && !resolved ? <Notice tone="neutral" title={`เปิดตรวจเคส #${selected}`} detail="การเปิดตรวจจะบันทึก audit พร้อมเหตุผล และระบบจะออกเลขอ้างอิงให้">
      <ReasonInput label="เหตุผลที่เปิดตรวจ" value={reviewReason} onChange={setReviewReason} editable={!action.busy} />
      <Button label="เปิดตรวจเคส" variant="primary" busy={action.busy} disabled={!validReason(reviewReason)} onPress={() => {
        const reason = reviewReason.trim();
        void action.mutate(`delivery-review:${selected}:${reason}`, async key => {
          const out = await api.call(token => api.service.reviewDelivery(token, selected, reason, key));
          setReview(out.result);
        });
      }} />
    </Notice> : null}
    {review && !resolved ? <DeliveryCaseReview review={review} busy={action.busy} onResolve={input => {
      void action.mutate(`delivery-resolve:${review.order_id}:${JSON.stringify({ ...input, evidence_refs: [...input.evidence_refs].sort() })}`, async key => {
        const out = await api.call(token => api.service.resolveDelivery(token, review.order_id, input, key));
        setResolved(`${input.resolution === 'REFUND' ? 'คืนเงินผู้ซื้อ' : 'ปล่อยเงินให้ผู้ขาย'}แล้ว · สถานะ ${orderStatusLabel(out.result.order_status)}${out.replayed ? ' (ผลเดิมจากคำขอซ้ำ)' : ''}`);
      }).then(() => cases.reload());
    }} /> : null}
    {resolved ? <Notice tone="success" title="บันทึกผลการตัดสินแล้ว" detail={resolved} testID="delivery-resolved" /> : null}
    {action.error ? <Notice tone="danger" title="ทำรายการไม่สำเร็จ" detail={action.error}><Button label="โหลดรายการล่าสุด" onPress={() => { void cases.reload(); }} /></Notice> : null}
  </>;
}

// ------------------------------------------------------------ order lookup (returns / events)

function OrderPicker({ statuses, onPick, selected }: { statuses: { value: string; label: string }[]; selected: number | null; onPick(orderId: number): void }) {
  const api = useFulfillmentApi();
  const [status, setStatus] = useState(statuses[0].value);
  const orders = useStaffResource(useCallback(() => api.call(token => api.service.listAdminOrders(token, status)), [api, status]));
  return <>
    <Chips options={statuses} value={status} disabled={orders.loading} onChange={setStatus} />
    <LoadState {...orders} />
    {orders.data?.items.length === 0 ? <EmptyState title="ไม่มีคำสั่งซื้อในสถานะนี้" /> : null}
    {orders.data?.items.map(item => <Button key={item.id} label={`#${item.id} · ${item.product.name}`} variant={selected === item.id ? 'primary' : 'secondary'} onPress={() => onPick(item.id)} />)}
  </>;
}

function useAdminOrder(orderId: number | null) {
  const api = useFulfillmentApi();
  return useStaffResource(useCallback(async () => orderId === null ? null : api.call(token => api.service.getAdminOrder(token, orderId)), [api, orderId]));
}

function ShipmentList({ order }: { order: AdminOrderShipments }) {
  if (!order.shipments.length) return <ThemedText type="small" themeColor="textSecondary">ยังไม่มีพัสดุในคำสั่งซื้อนี้</ThemedText>;
  return <>{order.shipments.map(item => <Field key={item.id} label={`พัสดุ #${item.id} · ${LEG_LABEL[item.leg] ?? item.leg}`} value={item.status} />)}</>;
}

// ------------------------------------------------------------ return exceptions

export function ReturnExceptionReview({ review, busy, onConfirm }: {
  review: ReturnReviewResult; busy: boolean; onConfirm(input: { reason: string; evidence_refs: string[] }): void;
}) {
  const [refs, setRefs] = useState<string[]>(review.evidence_refs);
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const address = review.return_recipient;
  const valid = validReason(reason) && refs.length >= 2;
  return <View style={{ gap: 12 }} testID="return-exception-review">
    <Notice tone="neutral" title={`การส่งคืนของคำสั่งซื้อ #${review.order_id}`} detail={`พัสดุคืน #${review.shipment_id}`}>
      <SimLabel text="ขนส่งจำลอง" />
      <ThemedText type="smallBold">ปลายทางรับคืนที่ล็อกไว้</ThemedText>
      {address ? <ThemedText type="small">{address.recipient_name} · {address.phone}{'\n'}{address.address_line} {address.subdistrict} {address.district} {address.province} {address.postal_code}</ThemedText>
        : <ThemedText type="small" themeColor="textSecondary">ไม่มีที่อยู่รับคืนที่บันทึกไว้</ThemedText>}
    </Notice>
    <ThemedText type="smallBold">อ้างอิงที่ระบบออกให้ (ต้องมีทั้งพัสดุคืนและการตรวจ)</ThemedText>
    <Chips multi options={review.evidence_refs.map(ref => ({ value: ref, label: ref }))} value={refs} disabled={busy}
      onChange={ref => setRefs(current => current.includes(ref) ? current.filter(item => item !== ref) : [...current, ref])} />
    <ReasonInput label="เหตุผลยืนยันว่าผู้ขายได้รับคืนจริง" value={reason} onChange={setReason} editable={!busy} />
    <Notice tone="info" title="สิ่งที่จะเกิดขึ้น" detail="บันทึกการรับคืนจริงแทนผู้ขาย (ข้อยกเว้นของผู้ดูแล) การคืนเงินดำเนินการแยกและอาจแสดงว่ากำลังดำเนินการ ไม่มีการเลือกยอดเงิน" />
    <Button label="ตรวจทานการยืนยันรับคืน" variant="primary" busy={busy} disabled={!valid} onPress={() => setConfirming(true)} />
    <ConfirmationSheet visible={confirming} title="ยืนยันรับคืนแทนผู้ขาย" onClose={() => setConfirming(false)}>
      <ThemedText type="small">{reason.trim()}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">อ้างอิง: {[...refs].sort().join(', ')}</ThemedText>
      <Button label="ยืนยัน" variant="primary" busy={busy} onPress={() => { onConfirm({ reason: reason.trim(), evidence_refs: refs }); setConfirming(false); }} />
    </ConfirmationSheet>
  </View>;
}

function Returns() {
  const api = useFulfillmentApi();
  const action = useInspectionMutation();
  const [orderId, setOrderId] = useState<number | null>(null);
  const order = useAdminOrder(orderId);
  const [reviewReason, setReviewReason] = useState('');
  const [review, setReview] = useState<ReturnReviewResult | null>(null);
  const [done, setDone] = useState<ReturnReceiptResult | null>(null);
  const pick = (id: number) => { setOrderId(id); setReview(null); setDone(null); setReviewReason(''); };
  const hasReturn = order.data?.shipments.some(item => item.leg === 'TO_SELLER');
  return <>
    <ThemedText themeColor="textSecondary">ใช้เมื่อผู้ขายรับสินค้าคืนจริงแต่ยืนยันในแอปไม่ได้ ต้องมีเหตุผลและอ้างอิงที่ระบบออกให้</ThemedText>
    <OrderPicker statuses={[{ value: 'RESULT_NOTIFIED', label: 'แจ้งผลแล้ว (มีการส่งคืน)' }]} selected={orderId} onPick={pick} />
    {orderId !== null && order.data ? <Notice tone="neutral" title={`คำสั่งซื้อ #${order.data.id} · ${orderStatusLabel(order.data.status)}`}><ShipmentList order={order.data} /></Notice> : null}
    {orderId !== null && order.data && !hasReturn ? <Notice tone="neutral" title="ยังไม่มีการส่งคืนผู้ขาย" detail="ศูนย์ต้องบันทึกการส่งคืนก่อน" /> : null}
    {orderId !== null && hasReturn && !review && !done ? <Notice tone="neutral" title="เปิดตรวจการส่งคืน" detail="ระบบบันทึก audit และออกเลขอ้างอิงพัสดุคืน/การตรวจ">
      <ReasonInput label="เหตุผลที่เปิดตรวจ" value={reviewReason} onChange={setReviewReason} editable={!action.busy} />
      <Button label="เปิดตรวจการส่งคืน" variant="primary" busy={action.busy} disabled={!validReason(reviewReason)} onPress={() => {
        const reason = reviewReason.trim();
        void action.mutate(`return-review:${orderId}:${reason}`, async key => {
          setReview((await api.call(token => api.service.reviewReturn(token, orderId, reason, key))).result);
        });
      }} />
    </Notice> : null}
    {review && !done ? <ReturnExceptionReview review={review} busy={action.busy} onConfirm={input => {
      void action.mutate(`admin-return:${review.order_id}:${JSON.stringify({ ...input, evidence_refs: [...input.evidence_refs].sort() })}`, async key => {
        setDone((await api.call(token => api.service.confirmAdminReturn(token, review.order_id, input, key))).result);
      }).then(() => order.reload());
    }} /> : null}
    {done ? <Notice tone="success" title="บันทึกรับคืนแล้ว กำลังดำเนินการคืนเงิน" testID="admin-return-done"
      detail={`ยืนยันโดยผู้ดูแลเมื่อ ${when(done.return_received_at)} · การคืนเงินบันทึกแยกและอาจรอประมวลผล ดูผลล่าสุดจากคำสั่งซื้อ`} /> : null}
    {action.error ? <Notice tone="danger" title="ทำรายการไม่สำเร็จ" detail={action.error}><Button label="โหลดข้อมูลล่าสุด" onPress={() => { void order.reload(); }} /></Notice> : null}
  </>;
}

// ------------------------------------------------------------ demo transport events

export function newEventId(orderId: number, shipmentId: number) {
  return `demo-${orderId}-${shipmentId}-${Math.random().toString(36).slice(2, 8)}`;
}

function Events() {
  const api = useFulfillmentApi();
  const action = useInspectionMutation();
  const [orderId, setOrderId] = useState<number | null>(null);
  const order = useAdminOrder(orderId);
  const [shipmentId, setShipmentId] = useState<number | null>(null);
  const [eventId, setEventId] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<ShippingEventResult | null>(null);
  const shipment = order.data?.shipments.find(item => item.id === shipmentId) ?? null;
  return <>
    <Notice tone="warning" title="เหตุการณ์ขนส่งจำลอง (เดโม)" testID="demo-event-panel"
      detail="บันทึกว่าขนส่งแจ้งส่งถึงแล้วสำหรับการสาธิต ไม่ใช่การยืนยันรับของผู้รับ ไม่ปิดการคืนสินค้าหรือการคืนเงิน และใช้ได้เมื่อระบบเปิด EXTERNAL_SHIPPING_DEMO_ENABLED">
      <SimLabel text="จำลองผู้ให้บริการขนส่ง" />
    </Notice>
    <OrderPicker statuses={[{ value: 'SHIPPING_TO_CENTER', label: 'กำลังส่งเข้าศูนย์' }, { value: 'SHIPPING_TO_BUYER', label: 'กำลังส่งถึงผู้ซื้อ' }, { value: 'RESULT_NOTIFIED', label: 'แจ้งผลแล้ว (ส่งคืน)' }]}
      selected={orderId} onPick={id => { setOrderId(id); setShipmentId(null); setResult(null); }} />
    {order.data ? <Notice tone="neutral" title={`พัสดุของคำสั่งซื้อ #${order.data.id}`}>
      <Chips options={order.data.shipments.map(item => ({ value: String(item.id), label: `#${item.id} ${LEG_LABEL[item.leg] ?? item.leg} · ${item.status}` }))}
        value={shipmentId === null ? null : String(shipmentId)} onChange={value => { const id = Number(value); setShipmentId(id); setEventId(newEventId(order.data!.id, id)); setResult(null); }} />
    </Notice> : null}
    {shipment && !result ? <View style={{ gap: 8 }}>
      <Field label="ขาการขนส่ง" value={LEG_LABEL[shipment.leg]} />
      <TextField label="รหัสเหตุการณ์ (ไม่ซ้ำ)" value={eventId} onChangeText={setEventId} editable={!action.busy} autoCapitalize="none" />
      <Button label="บันทึกว่า 'ส่งถึงแล้ว' (จำลอง)" variant="primary" busy={action.busy} disabled={!/^[A-Za-z0-9_-]{8,100}$/.test(eventId)} onPress={() => setConfirming(true)} />
    </View> : null}
    {result ? <Notice tone="success" title="บันทึกเหตุการณ์ขนส่งจำลองแล้ว" testID="demo-event-recorded">
      <Field label="แหล่งที่มา" value={result.source} /><Field label="เวลาเซิร์ฟเวอร์" value={when(result.confirmed_at)} />
      <Field label="รหัสเหตุการณ์" value={result.event_id} mono />
      <ThemedText type="small">ผู้รับยังไม่ได้ยืนยันรับ (recipient_confirmed = false)</ThemedText>
    </Notice> : null}
    {action.error ? <Notice tone="danger" title="บันทึกไม่สำเร็จ" detail={action.error} /> : null}
    <ConfirmationSheet visible={confirming} title="ยืนยันเหตุการณ์ขนส่งจำลอง" onClose={() => setConfirming(false)}>
      <ThemedText type="small">พัสดุ #{shipmentId} · {shipment ? LEG_LABEL[shipment.leg] : ''} · {eventId}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">ไม่ใช่การยืนยันรับของผู้รับ ระบบใช้เวลาของเซิร์ฟเวอร์และบันทึก audit</ThemedText>
      <Button label="บันทึกเหตุการณ์" variant="primary" busy={action.busy} onPress={() => {
        setConfirming(false);
        if (!shipment || shipmentId === null) return;
        const body = { leg: shipment.leg, event: 'DELIVERED' as const, event_id: eventId.trim() };
        void action.mutate(`event:${shipmentId}:${JSON.stringify(body)}`, async key => {
          setResult((await api.call(token => api.service.recordShippingEvent(token, shipmentId, body, key))).result);
        }).then(() => order.reload());
      }} />
    </ConfirmationSheet>
  </>;
}

function AdminDelivery() {
  const [section, setSection] = useState<Section>('cases');
  return <>
    <Chips<Section> options={[{ value: 'cases', label: 'แจ้งไม่ได้รับสินค้า' }, { value: 'returns', label: 'ยืนยันรับคืน (ข้อยกเว้น)' }, { value: 'events', label: 'เหตุการณ์ขนส่งจำลอง' }]}
      value={section} onChange={value => setSection(value)} />
    {section === 'cases' ? <Cases /> : section === 'returns' ? <Returns /> : <Events />}
    <Button label="มอบหมายผู้ขนส่ง (คำสั่งซื้อรุ่นเดิม)" onPress={() => router.push('/admin-legacy-couriers')} />
  </>;
}

export function AdminDeliveryScreen() {
  return <StaffScreen title="จัดการการจัดส่ง" role="ADMIN"><AdminDelivery /></StaffScreen>;
}
