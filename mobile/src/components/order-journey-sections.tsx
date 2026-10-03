/**
 * UI1-05 order journey sections. Every action button is rendered only from a server
 * `can_*` flag carried in `journey.actions`; nothing here computes money or outcomes.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { formatDateTime, textLength } from '@/orders/order-format';
import type { JourneyCommand } from '@/orders/use-order-journey';
import {
  COPY, historyEventLabel, historySourceLabel, recipientSourceLabel,
  type DeliveryView, type HistoryPage, type Journey, type MoneySummary, type ResultWindow, type ShipmentView,
} from '@/orders/order-journey';
import { Button } from './order-ui';
import { ThemedText } from './themed-text';
import { ConfirmationSheet } from './wondee/primitives';
import { ActionNotice, MoneyRow, ReasonField, SectionCard, ServerDeadline, SimulationLabel, StatusBanner } from './wondee/status';

export function JourneyBanner({ journey, onDeadlineReached }: { journey: Journey; onDeadlineReached?(): void }) {
  return <StatusBanner tone={journey.tone} title={journey.title} detail={journey.detail} testID={`journey-${journey.stage}`}>
    {journey.legacy ? <ThemedText type="small" themeColor="textSecondary">คำสั่งซื้อรุ่นเดิม (LEGACY_V1) ใช้กติกาเดิมที่บันทึกไว้</ThemedText> : null}
    {journey.deadline ? <ServerDeadline key={journey.deadline.at} label={journey.deadline.label} deadline={journey.deadline.at}
      serverTime={journey.deadline.serverTime} passedText={journey.deadline.passedText} onReached={onDeadlineReached} /> : null}
  </StatusBanner>;
}

function Line({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  if (!value) return null;
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, paddingVertical: 3 }}>
    <ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>
    <ThemedText type="small" style={mono ? { fontFamily: 'monospace' } : undefined} selectable>{value}</ThemedText>
  </View>;
}

const LEG_TITLES = { TO_CENTER: 'ผู้ขายส่งเข้าศูนย์ตรวจ', TO_BUYER: 'ศูนย์ส่งถึงผู้ซื้อ', TO_SELLER: 'ศูนย์ส่งคืนผู้ขาย' } as const;

/** Transport fact (carrier/demo event) and recipient receipt are shown as separate facts. */
export function ShipmentCard({ shipment }: { shipment: ShipmentView }) {
  const theme = useTheme();
  return <SectionCard title={LEG_TITLES[shipment.leg]} testID={`shipment-${shipment.leg}`}>
    <Line label="ผู้ให้บริการขนส่ง" value={shipment.carrier} />
    <Line label="เลขพัสดุ" value={shipment.trackingNumber} mono />
    <Line label="ส่งเมื่อ" value={formatDateTime(shipment.shippedAt)} />
    <View style={{ gap: 4, borderTopWidth: 1, borderColor: theme.border, paddingTop: 8 }}>
      <ThemedText type="smallBold">สถานะขนส่ง</ThemedText>
      {shipment.transportDeliveredAt ? <View style={{ gap: 4 }}>
        <ThemedText type="small">แจ้งว่าส่งถึงแล้ว · {formatDateTime(shipment.transportDeliveredAt)}</ThemedText>
        {shipment.simulatedTransport ? <SimulationLabel text="สถานะขนส่งจำลอง" /> : shipment.transportSource === 'LEGACY_COURIER' ? <ThemedText type="small" themeColor="textSecondary">ยืนยันโดยผู้ขนส่งรุ่นเดิม</ThemedText> : null}
      </View> : <ThemedText type="small" themeColor="textSecondary">ยังไม่มีสถานะส่งถึงจากขนส่ง</ThemedText>}
      <ThemedText type="smallBold" style={{ marginTop: 4 }}>ผู้รับยืนยัน</ThemedText>
      {shipment.recipientReceivedAt
        ? <ThemedText type="small">ยืนยันรับจริงโดย{recipientSourceLabel(shipment.recipientSource)} · {formatDateTime(shipment.recipientReceivedAt)}</ThemedText>
        : <ThemedText type="small" themeColor="textSecondary">ยังไม่มีการยืนยันรับจากผู้รับ</ThemedText>}
    </View>
  </SectionCard>;
}

/** Buyer: actual receipt and non-receipt report, both gated by server flags. */
export function BuyerReceiptPanel({ journey, delivery, command, orderId }: {
  journey: Journey; delivery: DeliveryView; command: JourneyCommand; orderId: number;
}) {
  const [confirming, setConfirming] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const canConfirm = journey.actions.includes('confirm-receipt');
  const canReport = journey.actions.includes('report-not-received');
  const length = textLength(reason);
  const validReason = length >= 10 && length <= 1000;
  if (delivery.missingReportedAt) {
    return <SectionCard title={COPY.reportNotReceived} testID="buyer-report-recorded">
      <ThemedText type="small">แจ้งเมื่อ {formatDateTime(delivery.missingReportedAt)} · ผู้ดูแลกำลังตรวจสอบ เงินยังพักไว้</ThemedText>
      {delivery.missingReport?.reason ? <ThemedText type="small" themeColor="textSecondary">เหตุผลที่แจ้ง: {delivery.missingReport.reason}</ThemedText> : null}
      <ThemedText type="small" themeColor="textSecondary">ระบบจะไม่ยืนยันรับอัตโนมัติหลังมีการแจ้ง</ThemedText>
    </SectionCard>;
  }
  if (delivery.receiptConfirmedAt) {
    return <SectionCard title="ยืนยันรับสินค้าแล้ว" testID="buyer-receipt-recorded">
      <ThemedText type="small">{delivery.receiptConfirmationSource === 'AUTO_RECEIPT' ? 'ระบบยืนยันรับอัตโนมัติ' : 'คุณยืนยันรับ'} · {formatDateTime(delivery.receiptConfirmedAt)}</ThemedText>
    </SectionCard>;
  }
  if (!canConfirm && !canReport) return null;
  return <SectionCard title="การรับสินค้า" testID="buyer-receipt-actions">
    <ThemedText type="small" themeColor="textSecondary">
      {journey.outbound?.transportDeliveredAt ? COPY.receiptWindow
        : 'ยังไม่มีสถานะส่งถึงจากขนส่ง คุณยืนยันรับได้เมื่อได้รับสินค้าจริง หรือแจ้งว่ายังไม่ได้รับ เวลานับยืนยันอัตโนมัติจะเริ่มเมื่อระบบได้รับสถานะส่งถึงเท่านั้น'}
    </ThemedText>
    <ActionNotice failure={command.failure} retrying={command.busy}
      onRetry={() => { void (reporting ? submitReport() : submitReceipt()); }} />
    {canConfirm ? <Button label={COPY.confirmReceipt} variant="primary" busy={command.busy && confirming} disabled={command.busy} onPress={() => { command.clear(); setConfirming(true); }} /> : null}
    {canReport ? <Button label={COPY.reportNotReceived} busy={command.busy && reporting} disabled={command.busy} onPress={() => { command.clear(); setReporting(true); }} /> : null}
    <ConfirmationSheet visible={confirming} title={COPY.confirmReceipt} onClose={() => setConfirming(false)}>
      <ThemedText>ยืนยันเมื่อได้รับสินค้าจริงแล้วเท่านั้น ระบบจะปล่อยเงินที่พักไว้ให้ผู้ขายและเปลี่ยนใจไม่ได้</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">การยืนยันนี้แยกจากการยอมรับผลตรวจ</ThemedText>
      <Button label={COPY.confirmReceipt} variant="primary" busy={command.busy} onPress={() => { void submitReceipt(); }} />
    </ConfirmationSheet>
    <ConfirmationSheet visible={reporting} title={COPY.reportNotReceived} onClose={() => setReporting(false)}>
      <ThemedText type="small" themeColor="textSecondary">ใช้สำหรับกรณียังไม่ได้รับพัสดุเท่านั้น ไม่ใช่การร้องเรียนสภาพสินค้า ผู้ดูแลจะตรวจสอบและตัดสินตามหลักฐาน</ThemedText>
      <ReasonField label="อธิบายสิ่งที่เกิดขึ้น" value={reason} onChange={setReason} min={10} max={1000} editable={!command.busy}
        error={command.failure?.fields.reason} />
      <Button label="ส่งการแจ้ง" variant="primary" busy={command.busy} disabled={!validReason} onPress={() => { void submitReport(); }} />
    </ConfirmationSheet>
  </SectionCard>;

  async function submitReceipt() {
    if (await command.run(`confirm-receipt:${orderId}`, (port, key) => port.confirmReceipt(orderId, key))) setConfirming(false);
  }
  async function submitReport() {
    const trimmed = reason.trim();
    if (!validReason) return;
    if (await command.run(`report-not-received:${orderId}:${trimmed}`, (port, key) => port.reportNotReceived(orderId, trimmed, key))) {
      setReporting(false); setReason('');
    }
  }
}

/** Seller: actual return receipt. Commits the physical fact; money follows separately. */
export function SellerReturnPanel({ journey, delivery, command, orderId }: {
  journey: Journey; delivery: DeliveryView; command: JourneyCommand; orderId: number;
}) {
  const [confirming, setConfirming] = useState(false);
  const received = journey.returnLeg?.recipientReceivedAt;
  if (received) {
    return <SectionCard title="รับสินค้าคืนแล้ว" testID="seller-return-received">
      <ThemedText type="small">ยืนยันรับคืนโดย{recipientSourceLabel(journey.returnLeg?.recipientSource ?? null)} · {formatDateTime(received)}</ThemedText>
      {delivery.pendingProcessing ? <StatusBanner tone="info" title={COPY.returnPending} detail="ระบบจะบันทึกการคืนเงินให้ผู้ซื้อเมื่อดำเนินการสำเร็จ ไม่ต้องกดซ้ำ" testID="return-pending-processing" /> : null}
      <ThemedText type="small" themeColor="textSecondary">สินค้าจะไม่ถูกลงขายใหม่อัตโนมัติ</ThemedText>
    </SectionCard>;
  }
  if (!journey.actions.includes('confirm-return')) return null;
  return <SectionCard title="การรับสินค้าคืน" testID="seller-return-actions">
    <ThemedText type="small" themeColor="textSecondary">กดยืนยันเมื่อได้รับพัสดุคืนจริงแล้วเท่านั้น สถานะขนส่งไม่ใช่การยืนยันรับคืน</ThemedText>
    <ActionNotice failure={command.failure} retrying={command.busy} onRetry={() => { void submit(); }} />
    <Button label={COPY.confirmReturn} variant="primary" busy={command.busy} onPress={() => { command.clear(); setConfirming(true); }} />
    <ConfirmationSheet visible={confirming} title={COPY.confirmReturn} onClose={() => setConfirming(false)}>
      <ThemedText>ยืนยันว่าได้รับสินค้าคืนที่ที่อยู่รับคืนแล้ว การยืนยันนี้แก้ไขไม่ได้</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">หลังยืนยัน ระบบจะคืนเงินให้ผู้ซื้อตามนโยบาย อาจใช้เวลาประมวลผล</ThemedText>
      <Button label={COPY.confirmReturn} variant="primary" busy={command.busy} onPress={() => { void submit(); }} />
    </ConfirmationSheet>
  </SectionCard>;

  async function submit() {
    if (await command.run(`confirm-return:${orderId}`, (port, key) => port.confirmReturn(orderId, key))) setConfirming(false);
  }
}

export function MoneyCard({ summary }: { summary: MoneySummary }) {
  const theme = useTheme();
  const { outcome } = summary;
  return <SectionCard title={summary.title} testID="money-card">
    {summary.lines.map(line => <MoneyRow key={line.label} {...line} />)}
    {outcome.kind !== 'none' || outcome.note ? <View style={{ gap: 4, borderTopWidth: 1, borderColor: theme.border, paddingTop: 8 }} testID={`money-${outcome.kind}`}>
      {outcome.title ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <ThemedText type="smallBold" style={{ flexShrink: 1 }}>{outcome.title}</ThemedText>
        {outcome.kind === 'settled' ? <SimulationLabel text="บันทึกในระบบจำลอง" /> : outcome.kind === 'quote' ? <SimulationLabel text="ประมาณการ" /> : outcome.kind === 'estimate' ? <SimulationLabel text="ประมาณการ" /> : null}
      </View> : null}
      {outcome.lines.map(line => <MoneyRow key={line.label} {...line} />)}
      {outcome.reference ? <Line label="เลขอ้างอิง" value={outcome.reference} mono /> : null}
      {outcome.settledAt ? <Line label="บันทึกเมื่อ" value={formatDateTime(outcome.settledAt)} /> : null}
      {outcome.note ? <ThemedText type="small" themeColor="textSecondary">{outcome.note}</ThemedText> : null}
    </View> : null}
  </SectionCard>;
}

export function HistoryCard({ history }: { history: HistoryPage | null }) {
  if (!history || history.items.length === 0) return null;
  return <SectionCard title="ประวัติการจัดส่งและการเงิน" testID="order-history">
    {history.items.map(item => <View key={item.id} style={{ gap: 2, paddingVertical: 4 }}>
      <ThemedText type="small">{historyEventLabel(item.event)}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{historySourceLabel(item.source)} · {formatDateTime(item.occurredAt) ?? '-'}</ThemedText>
    </View>)}
    {history.hasMore ? <ThemedText type="small" themeColor="textSecondary">แสดง {history.items.length} รายการล่าสุด</ThemedText> : null}
  </SectionCard>;
}

/** Timeline from persisted timestamps only; future steps have no fabricated time. */
export function journeyTimeline(input: { createdAt: string | null; paidAt: string | null; journey: Journey; delivery: DeliveryView | null; result: ResultWindow | null }) {
  const { journey, delivery, result } = input;
  const steps: { label: string; at: string | null }[] = [
    { label: 'สั่งซื้อ', at: input.createdAt },
    { label: 'ชำระเงิน (จำลอง)', at: input.paidAt },
    { label: 'ผู้ขายส่งเข้าศูนย์ตรวจ', at: journey.inbound?.shippedAt ?? null },
    { label: 'ศูนย์ยืนยันรับสินค้า', at: journey.inbound?.recipientReceivedAt ?? null },
    { label: 'แจ้งผลตรวจ', at: delivery?.resultAvailableAt ?? null },
  ];
  if (result?.decision) steps.push({ label: result.decision === 'CONFIRM' ? 'ผู้ซื้อยอมรับผลตรวจ' : 'ผู้ซื้อปฏิเสธผลตรวจ', at: result.decidedAt });
  if (delivery?.resultTimedOutAt) steps.push({ label: 'หมดเวลาตัดสินผลตรวจ', at: delivery.resultTimedOutAt });
  const final = journey.returnLeg ?? journey.outbound;
  if (final) {
    steps.push({ label: final.leg === 'TO_SELLER' ? 'ศูนย์ส่งคืนผู้ขาย' : 'ศูนย์ส่งถึงผู้ซื้อ', at: final.shippedAt });
    if (final.transportDeliveredAt) steps.push({ label: final.simulatedTransport ? 'สถานะขนส่งจำลอง: ส่งถึง' : 'สถานะขนส่ง: ส่งถึง', at: final.transportDeliveredAt });
    if (final.recipientReceivedAt) steps.push({ label: final.leg === 'TO_SELLER' ? 'ผู้ขายยืนยันรับคืน' : 'ผู้ซื้อยืนยันรับสินค้า', at: final.recipientReceivedAt });
  }
  if (delivery?.missingReportedAt) steps.push({ label: 'ผู้ซื้อแจ้งว่ายังไม่ได้รับสินค้า', at: delivery.missingReportedAt });
  if (delivery?.settlement) steps.push({ label: delivery.settlement.kind === 'RELEASE' ? 'ปล่อยเงินให้ผู้ขาย (จำลอง)' : 'คืนเงินให้ผู้ซื้อ (จำลอง)', at: delivery.settlement.settledAt });
  return steps.filter(step => !!step.at);
}

export function TimelineCard({ steps, current }: { steps: { label: string; at: string | null }[]; current: string }) {
  const theme = useTheme();
  return <SectionCard title="ความคืบหน้า" testID="order-timeline">
    {steps.map((step, index) => <View key={`${step.label}-${index}`} style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ alignItems: 'center', width: 14 }}>
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: theme.primary, marginTop: 4 }} />
        <View style={{ width: 2, flex: 1, backgroundColor: theme.border }} />
      </View>
      <View style={{ flex: 1, paddingBottom: 10 }}>
        <ThemedText type="small">{step.label}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{formatDateTime(step.at)}</ThemedText>
      </View>
    </View>)}
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ width: 14, alignItems: 'center' }}><View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: theme.warning, marginTop: 4 }} /></View>
      <ThemedText type="smallBold" style={{ flex: 1 }}>ตอนนี้: {current}</ThemedText>
    </View>
  </SectionCard>;
}

/** Shown when the order is paid but this build has no shipping client bound (before E_BASE). */
export function JourneyUnavailable() {
  return <StatusBanner tone="neutral" title="ข้อมูลการจัดส่งยังไม่พร้อมในรุ่นนี้" testID="journey-unavailable"
    detail="สถานะคำสั่งซื้อ ใบเสร็จ และผลตรวจยังดูได้ การยืนยันรับ/แจ้งไม่ได้รับ/รับคืนจะเปิดเมื่อเชื่อมต่อบริการจัดส่งแล้ว" />;
}
