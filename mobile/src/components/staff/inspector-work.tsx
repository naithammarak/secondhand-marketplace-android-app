/**
 * UI2-01/02 Inspector work: center receipt → start → private evidence → final result →
 * outbound carrier/tracking. All actions come from server status/flags; the Inspector
 * never records carrier delivery or a Buyer/Seller receipt.
 */
import { useCallback, useState, type ReactNode } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import { Image, type ImageSource } from 'expo-image';
import { useTheme } from '@/hooks/use-theme';
import { inspectionError, useFulfillmentApi, useInspectionApi, useInspectionMutation } from '@/inspections/use-inspection-api';
import { parseRouteId } from '@/orders/route-params';
import type { EvidenceFile, InspectionResult, WorkDetail } from '@/services/inspection-service';
import { Button } from '../order-ui';
import { CertificateQr } from '../certificate-qr';
import { OrderStatusPill } from '../order-status-pill';
import { cardConditionLabels, conditionBadgeTheme } from '../product-catalog-ui';
import { CONDITION_LABELS } from '@/services/product-service';
import type { ProductCondition } from '@/services/product-catalog-service';
import { ThemedText } from '../themed-text';
import { ConfirmationSheet, EmptyState, ImageViewer, TextField } from '../wondee/primitives';
import { Field, LoadState, Notice, SimLabel, StaffScreen, codePoints, remaining, useStaffResource, when } from './staff-ui';

export const RESULT_LABELS: Record<InspectionResult, string> = {
  PASS: 'ผ่านการตรวจตามรายงาน', MINOR_ISSUE: 'ผ่านการตรวจ พบข้อสังเกต', NOT_AS_DESCRIBED: 'ไม่ตรงตามประกาศ', FAKE: 'ไม่ผ่านการตรวจความแท้',
};
export const isPositive = (result: InspectionResult | null | undefined) => result === 'PASS' || result === 'MINOR_ISSUE';

/** Writing aid only: inserts a line into the summary. Not persisted as separate scores. */
const CHECKLIST = [
  { id: 'auth', label: 'ความแท้', ok: 'ความแท้: ตรวจแล้วตรงตามหลักฐาน', bad: 'ความแท้: พบข้อสงสัย' },
  { id: 'cond', label: 'สภาพ', ok: 'สภาพ: ตรงกับที่ประกาศ', bad: 'สภาพ: ต่างจากที่ประกาศ' },
  { id: 'match', label: 'ตรงประกาศ', ok: 'รายละเอียด: ตรงกับประกาศ', bad: 'รายละเอียด: ไม่ตรงกับประกาศ' },
] as const;

export type WorkActions = {
  busy: boolean; error?: string;
  photoSource(evidenceId: number): ImageSource | null;
  onReceive?(note: string): void; onStart?(): void; onPick?(): void; pendingUpload?: boolean;
  onFinalize?(input: { result: InspectionResult; summary: string; evidence_ids: number[] }): void;
  onShip?(input: { carrier: string; tracking_number: string }): void;
  onRefresh?(): void;
};

const RESULT_TONES: Record<InspectionResult, { fg: string; bg: string; border: string; icon: 'check' | 'minor' | 'warn' | 'x' }> = {
  PASS: { fg: '#10b981', bg: 'rgba(16, 185, 129, 0.12)', border: '#10b981', icon: 'check' },
  MINOR_ISSUE: { fg: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)', border: '#f59e0b', icon: 'minor' },
  NOT_AS_DESCRIBED: { fg: '#f97316', bg: 'rgba(249, 115, 22, 0.12)', border: '#f97316', icon: 'warn' },
  FAKE: { fg: '#f43f5e', bg: 'rgba(244, 63, 94, 0.12)', border: '#f43f5e', icon: 'x' },
};

function ResultGlyph({ kind, color }: { kind: 'check' | 'minor' | 'warn' | 'x'; color: string }) {
  const s = { stroke: color, strokeWidth: 2, fill: 'none' as const, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return <Svg width={18} height={18} viewBox="0 0 24 24">
    {kind === 'check' ? <><Circle {...s} cx={12} cy={12} r={9} /><Path {...s} d="m8.5 12.5 2.5 2.5 4.5-5" /></>
      : kind === 'minor' ? <><Circle {...s} cx={12} cy={12} r={9} /><Path {...s} d="M12 8v4M12 16h.01" /></>
        : kind === 'warn' ? <><Path {...s} d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><Path {...s} d="M12 9v4M12 17h.01" /></>
          : <><Circle {...s} cx={12} cy={12} r={9} /><Path {...s} d="m9 9 6 6M15 9l-6 6" /></>}
  </Svg>;
}

type StepKey = 'receive' | 'inspect' | 'decide' | 'ship';
/** ขั้นตอนของศูนย์จากสถานะเซิร์ฟเวอร์ (แสดงผลเท่านั้น ไม่ตัดสินอะไรเอง) */
function workSteps(work: WorkDetail): { key: StepKey; label: string; state: 'done' | 'now' | 'todo' }[] {
  const received = work.order_status !== 'SHIPPING_TO_CENTER';
  const inspected = !!work.result;
  const shipped = !!work.fulfillment;
  const decided = inspected && (!isPositive(work.result) || !!work.buyer_decision || !!work.result_timed_out_at || !!work.can_create_fulfillment || shipped);
  const done = [received, inspected, decided, shipped];
  const current = done.indexOf(false);
  return (['receive', 'inspect', 'decide', 'ship'] as StepKey[]).map((key, index) => ({
    key,
    label: ['รับเข้าศูนย์', 'ตรวจและบันทึกผล', 'ผลตัดสิน', 'ส่งออก'][index],
    state: done[index] ? 'done' : index === current ? 'now' : 'todo',
  }));
}

function Stepper({ work }: { work: WorkDetail }) {
  const theme = useTheme();
  const steps = workSteps(work);
  return <View style={local.stepper}>
    {steps.flatMap((step, index) => [
      <View key={step.key} style={local.stepItem}>
        <View style={[local.stepDot, step.state === 'done' ? { backgroundColor: '#10b981' }
          : step.state === 'now' ? { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderWidth: 2, borderColor: '#10b981' }
            : { backgroundColor: theme.backgroundElement, borderWidth: 1, borderColor: theme.border }]}>
          {step.state === 'done' ? <Svg width={11} height={11} viewBox="0 0 24 24" fill="none"><Path d="M5 13l4 4L19 7" stroke="#ffffff" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" /></Svg>
            : <ThemedText style={{ fontSize: 11, lineHeight: 14, fontWeight: '700', color: step.state === 'now' ? '#10b981' : theme.textSecondary }}>{index + 1}</ThemedText>}
        </View>
        <ThemedText style={[local.stepLabel, { color: step.state === 'todo' ? theme.textSecondary : theme.text, fontWeight: step.state === 'now' ? '700' : '500' }]}>{step.label}</ThemedText>
      </View>,
      index < steps.length - 1 ? <View key={`l${index}`} style={[local.stepLine, { backgroundColor: step.state === 'done' ? '#10b981' : 'rgba(100, 116, 139, 0.3)' }]} /> : null,
    ])}
  </View>;
}

/** ใส่/แทนบรรทัดของหัวข้อนี้ในสรุป (กดซ้ำเปลี่ยนคำตอบได้ ไม่ต่อท้ายซ้ำ) */
function setChecklistLine(summary: string, row: (typeof CHECKLIST)[number], ok: boolean): string {
  const line = ok ? row.ok : row.bad;
  const lines = summary.split('\n').filter(text => text.trim() && text.trim() !== row.ok && text.trim() !== row.bad);
  return [...lines.map(text => text.trim()), line].join('\n');
}

export function InspectorWorkView({ work, actions, children }: { work: WorkDetail; actions: WorkActions; children?: ReactNode }) {
  const theme = useTheme();
  const muted = theme.background === '#0c0e14' ? '#64748b' : '#94a3b8';
  const { width } = useWindowDimensions();
  const legacy = work.fulfillment_policy === 'LEGACY_V1';
  const [note, setNote] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const [result, setResult] = useState<InspectionResult | null>(null);
  const [summary, setSummary] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [photo, setPhoto] = useState<{ source: ImageSource; label: string } | null>(null);
  const [carrier, setCarrier] = useState('');
  const [tracking, setTracking] = useState('');
  const [shipping, setShipping] = useState(false);
  const chosen = selected.filter(id => work.evidence.some(item => item.id === id));
  const summaryValid = codePoints(summary) >= 10 && codePoints(summary) <= 2000;
  const finalValid = !!result && summaryValid && chosen.length >= 1 && chosen.length <= 5;
  const carrierValid = [carrier, tracking].every(value => codePoints(value) >= 1 && codePoints(value) <= 100);
  const receivable = work.order_status === 'SHIPPING_TO_CENTER' && (!legacy || !!work.shipment?.courier_delivered_at);
  const deadlineLeft = remaining(work.result_decision_deadline_at);
  const inspecting = work.order_status === 'INSPECTING' && !work.result;
  const tile = Math.floor((Math.min(width, 800) - 32 - 28 - 16) / 3);
  const key = work.product.condition as ProductCondition;
  const badge = CONDITION_LABELS[work.product.condition] ? conditionBadgeTheme[key] : null;
  const missing = [
    !result ? 'เลือกผลตรวจ' : null,
    chosen.length === 0 ? 'เลือกรูปหลักฐานอย่างน้อย 1 รูป' : null,
    !summaryValid ? 'เขียนสรุป 10 ตัวอักษรขึ้นไป' : null,
  ].filter(Boolean) as string[];

  // ปุ่มหลักของขั้นปัจจุบันติดล่างจอ กดได้ด้วยมือเดียว
  const dock = work.order_status === 'SHIPPING_TO_CENTER'
    ? <Button label="ยืนยันรับสินค้าเข้าศูนย์จริง" variant="primary" busy={actions.busy} disabled={!receivable || !actions.onReceive || codePoints(note) > 1000}
      onPress={() => actions.onReceive?.(note)} />
    : work.order_status === 'RECEIVED_AT_CENTER'
      ? <Button label="เริ่มตรวจสินค้า" variant="primary" busy={actions.busy} disabled={!actions.onStart} onPress={() => actions.onStart?.()} />
      : inspecting
        ? <Button label="ตรวจทานและบันทึกผล" variant="primary" busy={actions.busy} disabled={!finalValid || !actions.onFinalize} onPress={() => setReviewing(true)} />
        : work.can_create_fulfillment
          ? <Button label="บันทึกการส่งออก" variant="primary" busy={actions.busy} disabled={!carrierValid || !actions.onShip} onPress={() => setShipping(true)} />
          : null;

  return <View style={{ flex: 1 }}>
    <ScrollView contentContainerStyle={local.scroll} keyboardShouldPersistTaps="handled">
      {/* งาน + สินค้า */}
      <View style={[local.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <ThemedText style={[local.name, { color: theme.text }]}>{work.product.name}</ThemedText>
            <ThemedText style={[local.mono, { color: muted }]}>คำสั่งซื้อ #{work.order_id} · งาน #{work.id}</ThemedText>
          </View>
          <OrderStatusPill status={work.order_status} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {badge ? <View style={[local.cond, { backgroundColor: badge.bg }]}><ThemedText style={local.condText}>ประกาศว่า{cardConditionLabels[key]}</ThemedText></View> : null}
          {work.product.size?.trim() ? <ThemedText style={{ fontSize: 11, color: muted }}>ขนาด {work.product.size}</ThemedText> : null}
        </View>
        {legacy ? <ThemedText style={{ fontSize: 11, color: theme.textSecondary }}>คำสั่งซื้อรุ่นเดิม (LEGACY_V1) ใช้กติกาผู้ขนส่งเดิม</ThemedText> : null}
        {work.inspection_overdue_escalated_at ? <View style={local.overdue}><ThemedText style={local.overdueText}>เกินกำหนดตรวจ 3 วันทำการ ส่งเรื่องให้ผู้ดูแลแล้ว</ThemedText></View> : null}
      </View>

      <Stepper work={work} />

      {work.shipment ? <Notice tone="neutral" title="พัสดุขาเข้าจากผู้ขาย">
        <Field label="ผู้ให้บริการขนส่ง" value={work.shipment.carrier} />
        <Field label="เลขพัสดุ" value={work.shipment.tracking_number} mono />
        <Field label="ผู้ขายส่งเมื่อ" value={when(work.shipment.shipped_at)} />
        {legacy ? <Field label="ผู้ขนส่งรุ่นเดิมยืนยันส่งถึง" value={when(work.shipment.courier_delivered_at) ?? 'ยังไม่ยืนยัน'} /> : null}
        <Field label="ศูนย์รับจริงเมื่อ" value={when(work.shipment.received_at)} />
      </Notice> : null}

      {work.order_status === 'SHIPPING_TO_CENTER' ? <Notice tone="info" title="รับสินค้าเข้าศูนย์" testID="receive-step"
        detail={legacy ? 'คำสั่งซื้อรุ่นเดิมต้องมีหลักฐานผู้ขนส่งยืนยันส่งถึงก่อน' : 'ยืนยันเมื่อได้รับพัสดุจริงที่ศูนย์ ไม่ต้องรอสถานะจากผู้ให้บริการขนส่ง'}>
        <TextField label="บันทึกการรับ (ไม่บังคับ)" value={note} onChangeText={setNote} editable={!actions.busy} placeholder="เช่น กล่องสมบูรณ์ / บุบเล็กน้อย" />
      </Notice> : null}

      {work.order_status === 'RECEIVED_AT_CENTER' ? <Notice tone="info" title="พร้อมเริ่มตรวจ" detail="เมื่อเริ่มตรวจ งานนี้จะเป็นของคุณ และรายการจะแสดงเฉพาะผู้ตรวจที่รับผิดชอบ" /> : null}

      {inspecting ? <View style={{ gap: 12 }} testID="inspect-step">
        {/* 1) หลักฐาน */}
        <View style={[local.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={local.sectionHead}>
            <ThemedText style={[local.sectionTitle, { color: theme.text }]}>1. รูปหลักฐาน</ThemedText>
            <ThemedText style={[local.counter, { color: chosen.length ? '#10b981' : muted }]}>เลือก {chosen.length}/5</ThemedText>
          </View>
          <ThemedText style={[local.help, { color: theme.textSecondary }]}>แตะเพื่อเลือกภาพที่ใช้ในรายงาน · กดค้างเพื่อดูภาพเต็ม · เห็นได้เฉพาะผู้มีสิทธิ์</ThemedText>
          <View style={local.grid}>
            {work.evidence.map(item => {
              const source = actions.photoSource(item.id);
              const order = chosen.indexOf(item.id);
              const isChosen = order >= 0;
              return <Pressable key={item.id} accessibilityRole="checkbox" accessibilityLabel={`หลักฐาน ${item.id}`} accessibilityState={{ checked: isChosen }} disabled={actions.busy}
                onPress={() => setSelected(current => current.includes(item.id) ? current.filter(id => id !== item.id) : current.length < 5 ? [...current, item.id] : current)}
                onLongPress={() => source && setPhoto({ source, label: `หลักฐาน ${item.id}` })}
                style={[local.tile, { width: tile, height: tile, borderColor: isChosen ? '#10b981' : 'transparent', backgroundColor: theme.backgroundElement }]}>
                {source ? <Image source={source} cachePolicy="none" style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
                <View style={[local.tick, isChosen ? { backgroundColor: '#10b981', borderColor: '#10b981' } : { backgroundColor: 'rgba(15, 23, 42, 0.45)', borderColor: '#ffffff' }]}>
                  {isChosen ? <ThemedText style={local.tickText}>{order + 1}</ThemedText> : null}
                </View>
              </Pressable>;
            })}
            {(work.evidence.length < 5 || actions.pendingUpload) ? <Pressable accessibilityRole="button"
              accessibilityLabel={actions.pendingUpload ? 'ลองส่งรูปเดิมอีกครั้ง' : 'เพิ่มรูปหลักฐาน'}
              disabled={actions.busy || !actions.onPick} onPress={() => actions.onPick?.()}
              style={({ pressed }) => [local.tile, local.addTile, { width: tile, height: tile, opacity: actions.busy ? 0.5 : pressed ? 0.7 : 1 }]}>
              <Svg width={24} height={24} viewBox="0 0 24 24" fill="none"><Path d="M4 8h3l2-3h6l2 3h3v11H4z" stroke="#10b981" strokeWidth={2} strokeLinejoin="round" /><Circle cx={12} cy={13} r={3.5} stroke="#10b981" strokeWidth={2} /></Svg>
              <ThemedText style={local.addText}>{actions.pendingUpload ? 'ส่งรูปเดิมอีกครั้ง' : 'เพิ่มรูป'}</ThemedText>
            </Pressable> : null}
          </View>
          <ThemedText style={[local.help, { color: muted }]}>JPEG/PNG/WebP ไม่เกิน 5 MB · สูงสุด 5 ภาพ</ThemedText>
        </View>

        {/* 2) ผลตรวจ */}
        <View style={[local.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <ThemedText style={[local.sectionTitle, { color: theme.text }]}>2. ผลการตรวจ</ThemedText>
          <View style={local.resultGrid}>
            {(Object.keys(RESULT_LABELS) as InspectionResult[]).map(value => {
              const on = result === value;
              const tone = RESULT_TONES[value];
              return <Pressable key={value} accessibilityRole="button" accessibilityLabel={RESULT_LABELS[value]} accessibilityState={{ selected: on }}
                disabled={actions.busy} onPress={() => setResult(value)}
                style={({ pressed }) => [local.resultCard, { borderColor: on ? tone.border : theme.border, backgroundColor: on ? tone.bg : theme.backgroundElement, opacity: pressed ? 0.85 : 1 }]}>
                <ResultGlyph kind={tone.icon} color={on ? tone.fg : theme.textSecondary} />
                <ThemedText style={[local.resultText, { color: on ? tone.fg : theme.text }]}>{RESULT_LABELS[value]}</ThemedText>
              </Pressable>;
            })}
          </View>
          {result ? <ThemedText style={[local.help, { color: theme.textSecondary }]}>{isPositive(result)
            ? 'ระบบจะออกใบรับรองพร้อมบันทึกผล และเปิดให้ผู้ซื้อตัดสินภายใน 72 ชั่วโมง'
            : 'ผลนี้ไม่ออกใบรับรอง ไม่เปิดให้ผู้ซื้อยอมรับ และสินค้าจะถูกส่งคืนผู้ขายพร้อมคืนเงินเต็มจำนวนตามนโยบาย'}</ThemedText> : null}
        </View>

        {/* 3) สรุป */}
        <View style={[local.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={local.sectionHead}>
            <ThemedText style={[local.sectionTitle, { color: theme.text }]}>3. สรุปผลการตรวจ</ThemedText>
            <ThemedText style={[local.counter, { color: summaryValid ? '#10b981' : muted }]}>{codePoints(summary)}/2000</ThemedText>
          </View>
          <ThemedText style={[local.help, { color: theme.textSecondary }]}>ตัวช่วยเขียน: แตะเพื่อใส่บรรทัดลงในสรุป (ไม่ได้บันทึกเป็นคะแนนแยก)</ThemedText>
          {CHECKLIST.map(row => {
            const okOn = summary.split('\n').some(text => text.trim() === row.ok);
            const badOn = summary.split('\n').some(text => text.trim() === row.bad);
            return <View key={row.id} style={local.checkRow} accessibilityLabel={row.label}>
              <ThemedText style={[local.checkLabel, { color: theme.text }]}>{row.label}</ThemedText>
              <Pressable accessibilityRole="button" accessibilityLabel="✓ ตรง" accessibilityState={{ selected: okOn }} disabled={actions.busy}
                onPress={() => setSummary(value => setChecklistLine(value, row, true))}
                style={[local.toggle, { backgroundColor: okOn ? 'rgba(16, 185, 129, 0.15)' : theme.backgroundElement, borderColor: okOn ? '#10b981' : 'transparent' }]}>
                <ThemedText style={[local.toggleText, { color: okOn ? '#10b981' : theme.textSecondary }]}>✓ ตรง</ThemedText>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="✗ ไม่ตรง" accessibilityState={{ selected: badOn }} disabled={actions.busy}
                onPress={() => setSummary(value => setChecklistLine(value, row, false))}
                style={[local.toggle, { backgroundColor: badOn ? 'rgba(244, 63, 94, 0.12)' : theme.backgroundElement, borderColor: badOn ? '#f43f5e' : 'transparent' }]}>
                <ThemedText style={[local.toggleText, { color: badOn ? '#f43f5e' : theme.textSecondary }]}>✗ ไม่ตรง</ThemedText>
              </Pressable>
            </View>;
          })}
          <TextField label="สรุปผลการตรวจ" value={summary} onChangeText={setSummary} multiline editable={!actions.busy}
            placeholder="อธิบายสิ่งที่พบ เช่น ตำหนิ ตำแหน่ง และเหตุผลของผลตรวจ"
            style={{ minHeight: 120, textAlignVertical: 'top' }}
            error={summary.length > 0 && !summaryValid ? 'สรุป 10–2000 ตัวอักษร' : undefined} />
        </View>
      </View> : null}

      {work.result ? <View style={{ gap: 12 }} testID="result-recorded">
        <Notice tone={isPositive(work.result) ? 'success' : 'danger'} title={RESULT_LABELS[work.result]} detail={`บันทึกเมื่อ ${when(work.inspected_at) ?? '-'}`}>
          {work.summary ? <ThemedText style={{ fontSize: 12, lineHeight: 19, color: theme.text }}>{work.summary}</ThemedText> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{work.evidence.map(item => {
            const source = actions.photoSource(item.id);
            return source ? <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`ขยายหลักฐาน ${item.id}`} onPress={() => setPhoto({ source, label: `หลักฐาน ${item.id}` })}>
              <Image source={source} cachePolicy="none" style={{ width: 64, height: 64, borderRadius: 10 }} contentFit="cover" />
            </Pressable> : null;
          })}</View>
        </Notice>
        {isPositive(work.result) ? <Notice tone="neutral" title="ใบรับรองผลตรวจ">
          {work.certificate ? <>
            <Field label="เลขที่" value={work.certificate.certificate_no} mono />
            <Field label="สถานะ" value={work.certificate.status === 'REVOKED' ? 'ถูกเพิกถอน (REVOKED)' : 'ออกแล้ว (ISSUED)'} />
            {work.certificate.status === 'ISSUED' ? <View style={{ alignItems: 'center' }}><CertificateQr url={work.certificate.public_url} size={140} /></View> : null}
            <Button label="เปิดหน้าใบรับรองสาธารณะ" onPress={() => { void Linking.openURL(work.certificate!.public_url).catch(() => undefined); }} />
          </> : <ThemedText style={{ fontSize: 12, color: theme.danger }}>ไม่พบใบรับรองของผลนี้ กรุณาโหลดข้อมูลล่าสุด</ThemedText>}
        </Notice> : <Notice tone="neutral" title="ไม่ออกใบรับรองสำหรับผลนี้" detail="ไม่มีการตัดสินผลตรวจจากผู้ซื้อ สินค้าส่งคืนผู้ขาย" />}
        {isPositive(work.result) ? <Notice tone={work.buyer_decision || work.result_timed_out_at ? 'neutral' : 'warning'} title="การตัดสินของผู้ซื้อ">
          {work.buyer_decision ? <ThemedText style={{ fontSize: 12, color: theme.text }}>{work.buyer_decision.decision === 'CONFIRM' ? 'ผู้ซื้อยอมรับผลตรวจ' : 'ผู้ซื้อปฏิเสธผลตรวจ'} · {when(work.buyer_decision.decided_at)}</ThemedText>
            : work.result_timed_out_at ? <ThemedText style={{ fontSize: 12, color: theme.text }}>หมดเวลาตัดสินใจ ระบบบันทึกให้ส่งคืนผู้ขาย · {when(work.result_timed_out_at)}</ThemedText>
              : <ThemedText style={{ fontSize: 12, color: theme.text }}>รอผู้ซื้อตัดสินภายใน {when(work.result_decision_deadline_at) ?? '-'}{deadlineLeft ? ` (เหลือ ${deadlineLeft})` : ''}</ThemedText>}
        </Notice> : null}
      </View> : null}

      {work.can_create_fulfillment ? <Notice tone="info" title={work.next_action === 'SHIP_TO_BUYER' ? 'ส่งสินค้าถึงผู้ซื้อ' : 'ส่งสินค้าคืนผู้ขาย'} testID="outbound-step"
        detail={work.next_action === 'SHIP_TO_BUYER' ? 'ปลายทางคือที่อยู่จัดส่งที่ผู้ซื้อบันทึกในคำสั่งซื้อ ระบบเลือกให้' : 'ปลายทางคือที่อยู่รับคืนที่ผู้ขายบันทึกและถูกล็อกไว้ ระบบเลือกให้'}>
        <SimLabel text="ขนส่งจำลองสำหรับต้นแบบ" />
        <TextField label="ผู้ให้บริการขนส่ง" value={carrier} onChangeText={setCarrier} editable={!actions.busy} placeholder="ระบุบริการที่ใช้จริง" />
        <TextField label="เลขพัสดุ" value={tracking} onChangeText={setTracking} editable={!actions.busy} placeholder="ตามใบรับพัสดุ" />
        <ThemedText style={{ fontSize: 11, lineHeight: 17, color: theme.textSecondary }}>ไม่ต้องแนบรูปพัสดุ การส่งถึงและการรับจริงยืนยันโดยผู้รับหรือเหตุการณ์ขนส่ง ไม่ใช่ศูนย์ตรวจ</ThemedText>
      </Notice> : work.fulfillment ? <Notice tone="success" title={work.fulfillment.leg === 'TO_BUYER' ? 'บันทึกส่งถึงผู้ซื้อแล้ว' : 'บันทึกส่งคืนผู้ขายแล้ว'}
        detail="การส่งถึงจะแสดงจากเหตุการณ์ขนส่ง และการรับจริงยืนยันโดยผู้รับ ศูนย์ไม่ต้องดำเนินการต่อ" />
        : work.result && work.next_action === 'RETURN_TO_SELLER' && work.order_status === 'RESULT_NOTIFIED' ? <Notice tone="warning" title="ยังส่งคืนไม่ได้"
          detail="ไม่มีที่อยู่รับคืนที่ล็อกไว้ ต้องให้ผู้ดูแลตรวจสอบ" /> : null}

      {!!actions.error && <Notice tone="danger" title="ทำรายการไม่สำเร็จ" detail={actions.error}>
        {actions.onRefresh ? <Button label="โหลดสถานะล่าสุด" onPress={actions.onRefresh} /> : null}</Notice>}
      {children}
    </ScrollView>

    {dock ? <View style={[local.dock, { backgroundColor: theme.background === '#0c0e14' ? '#121622' : '#ffffff', borderTopColor: theme.border }]}>
      {inspecting && missing.length > 0 ? <ThemedText style={[local.help, { color: muted, textAlign: 'center' }]}>ยังขาด: {missing.join(' · ')}</ThemedText> : null}
      {dock}
    </View> : null}

    <ConfirmationSheet visible={reviewing} title="ยืนยันผลการตรวจ" onClose={() => setReviewing(false)}>
      {result ? <View style={[local.resultCard, { borderColor: RESULT_TONES[result].border, backgroundColor: RESULT_TONES[result].bg, alignSelf: 'stretch', flexBasis: 'auto' }]}>
        <ResultGlyph kind={RESULT_TONES[result].icon} color={RESULT_TONES[result].fg} />
        <ThemedText style={[local.resultText, { color: RESULT_TONES[result].fg }]}>{RESULT_LABELS[result]}</ThemedText>
      </View> : null}
      <ThemedText style={{ fontSize: 13, lineHeight: 20 }}>{summary.trim()}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">หลักฐาน {chosen.length} ภาพ · บันทึกแล้วแก้ผลไม่ได้</ThemedText>
      <Button label={isPositive(result) ? 'บันทึกผลและออกใบรับรอง' : 'บันทึกผล (ไม่ออกใบรับรอง)'} variant="primary" busy={actions.busy}
        disabled={!finalValid} onPress={() => { if (result) { actions.onFinalize?.({ result, summary: summary.trim(), evidence_ids: [...chosen].sort((a, b) => a - b) }); setReviewing(false); } }} />
    </ConfirmationSheet>
    <ConfirmationSheet visible={shipping} title="ยืนยันการส่งออก" onClose={() => setShipping(false)}>
      <Field label="ปลายทาง" value={work.next_action === 'SHIP_TO_BUYER' ? 'ผู้ซื้อ' : 'ผู้ขาย (ส่งคืน)'} />
      <Field label="ผู้ให้บริการ" value={carrier.trim()} />
      <Field label="เลขพัสดุ" value={tracking.trim()} mono />
      <ThemedText type="small" themeColor="textSecondary">เลือกปลายทางได้ครั้งเดียว บันทึกแล้วแก้ไม่ได้</ThemedText>
      <Button label="ยืนยันบันทึกการส่งออก" variant="primary" busy={actions.busy}
        onPress={() => { actions.onShip?.({ carrier: carrier.trim(), tracking_number: tracking.trim() }); setShipping(false); }} />
    </ConfirmationSheet>
    <ImageViewer source={photo?.source} label={photo?.label ?? 'หลักฐาน'} onClose={() => setPhoto(null)} />
  </View>;
}

const local = StyleSheet.create({
  scroll: { padding: 16, gap: 12, paddingBottom: 24, width: '100%', maxWidth: 800, alignSelf: 'center' },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
  name: { fontSize: 15, lineHeight: 22, fontWeight: '700' },
  mono: { fontFamily: 'monospace', fontSize: 11, lineHeight: 16 },
  cond: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  condText: { fontSize: 10, lineHeight: 14, fontWeight: '800', color: '#ffffff' },
  overdue: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: 'rgba(244, 63, 94, 0.12)' },
  overdueText: { fontSize: 10, lineHeight: 15, fontWeight: '700', color: '#f43f5e' },
  stepper: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 4 },
  stepItem: { alignItems: 'center', gap: 4, width: 72 },
  stepDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stepLabel: { fontSize: 10, lineHeight: 14, textAlign: 'center' },
  stepLine: { flex: 1, height: 2, marginTop: 11, marginHorizontal: -18 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sectionTitle: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  counter: { fontSize: 11, lineHeight: 16, fontWeight: '700' },
  help: { fontSize: 11, lineHeight: 17 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { borderRadius: 12, borderWidth: 3, overflow: 'hidden' },
  addTile: { borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(16, 185, 129, 0.5)', alignItems: 'center', justifyContent: 'center', gap: 4 },
  addText: { fontSize: 11, lineHeight: 15, fontWeight: '700', color: '#10b981' },
  tick: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  tickText: { fontSize: 11, lineHeight: 14, fontWeight: '800', color: '#ffffff' },
  resultGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  resultCard: { flexBasis: '47%', flexGrow: 1, minHeight: 52, borderRadius: 12, borderWidth: 2, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  resultText: { flexShrink: 1, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkLabel: { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: '600' },
  toggle: { minHeight: 36, borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 12, justifyContent: 'center' },
  toggleText: { fontSize: 12, lineHeight: 17, fontWeight: '700' },
  dock: { borderTopWidth: 1, paddingHorizontal: 16, paddingVertical: 12, gap: 6 },
});

async function pickEvidence(): Promise<EvidenceFile | null> {
  const selected = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  if (selected.canceled) return null;
  const asset = selected.assets[0];
  return { uri: asset.uri, name: asset.fileName ?? 'evidence.jpg', type: asset.mimeType ?? 'image/jpeg', size: asset.fileSize, file: asset.file };
}

function Work({ id }: { id: number }) {
  const api = useInspectionApi();
  const shipping = useFulfillmentApi();
  const resource = useStaffResource(useCallback(() => api.call(token => api.service.detail(token, id)), [api, id]));
  const action = useInspectionMutation();
  const [pendingFile, setPendingFile] = useState<EvidenceFile | null>(null);
  const [error, setError] = useState<string>();
  const work = resource.data;
  const run = async (identity: string, operation: (key: string) => Promise<unknown>) => {
    setError(undefined);
    await action.mutate(identity, operation);
    await resource.reload(); // committed or not, show persisted state
  };
  const upload = async () => {
    // Keep the chosen file on an uncertain response so retry reuses its key.
    const file = pendingFile ?? await pickEvidence().catch(failure => { setError(inspectionError(failure)); return null; });
    if (!file) return;
    setPendingFile(file);
    if (await action.mutate(`evidence:${id}:${file.uri}`, key => api.call(token => api.service.upload(token, id, file, key)), () => setPendingFile(null))) setPendingFile(null);
    await resource.reload();
  };
  if (!work) return <View style={{ padding: 16, gap: 14 }}><LoadState {...resource} /></View>;
  const evidence = new Map(work.evidence.map(item => [item.id, item]));
  return <InspectorWorkView work={work} actions={{
      busy: action.busy || resource.loading, error: action.error ?? error, pendingUpload: !!pendingFile,
      photoSource: evidenceId => { const item = evidence.get(evidenceId); try { return item ? api.service.privateImageSource(api.token, item) : null; } catch { return null; } },
      onReceive: note => { void run(`receive:${id}:${note.trim()}`, key => api.call(token => api.service.receive(token, id, note.trim() || null, key))); },
      onStart: () => { void run(`start:${id}`, key => api.call(token => api.service.start(token, id, key))); },
      onPick: () => { void upload(); },
      onFinalize: input => { void run(`result:${id}:${JSON.stringify(input)}`, key => api.call(token => api.service.result(token, id, input, key))); },
      onShip: input => { void run(`fulfillment:${work.order_id}:${JSON.stringify(input)}`, key => shipping.call(token => shipping.service.createFulfillment(token, work.order_id, input, key))); },
      onRefresh: () => { void resource.reload(); },
    }}>
    {resource.error ? <LoadState {...resource} /> : null}
    <Button label="โหลดสถานะล่าสุด" disabled={action.busy || resource.loading} onPress={() => { void resource.reload(); }} />
  </InspectorWorkView>;
}

export function InspectorWorkScreen({ inspectionId }: { inspectionId?: string }) {
  const id = parseRouteId(inspectionId);
  return <StaffScreen title={id === null ? 'ตรวจสินค้า' : `ตรวจสินค้า · งาน #${id}`} role="INSPECTOR" fill={id !== null}>
    {id === null ? <EmptyState title="รหัสงานไม่ถูกต้อง" /> : <Work key={id} id={id} />}
  </StaffScreen>;
}
