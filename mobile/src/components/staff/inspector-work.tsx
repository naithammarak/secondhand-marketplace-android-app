/**
 * UI2-01/02 Inspector work: center receipt → start → private evidence → final result →
 * outbound carrier/tracking. All actions come from server status/flags; the Inspector
 * never records carrier delivery or a Buyer/Seller receipt.
 */
import { useCallback, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Image, type ImageSource } from 'expo-image';
import { useTheme } from '@/hooks/use-theme';
import { inspectionError, useFulfillmentApi, useInspectionApi, useInspectionMutation } from '@/inspections/use-inspection-api';
import { orderStatusLabel } from '@/orders/order-format';
import { parseRouteId } from '@/orders/route-params';
import type { EvidenceFile, InspectionResult, WorkDetail } from '@/services/inspection-service';
import { Button } from '../order-ui';
import { CertificateQr } from '../certificate-qr';
import { ThemedText } from '../themed-text';
import { ConfirmationSheet, EmptyState, ImageViewer, TextField } from '../wondee/primitives';
import { Chips, Field, LoadState, Notice, SimLabel, StaffScreen, codePoints, remaining, useStaffResource, when } from './staff-ui';

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

export function InspectorWorkView({ work, actions }: { work: WorkDetail; actions: WorkActions }) {
  const theme = useTheme();
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

  return <View style={{ gap: 14 }}>
    <Notice tone="neutral" title={work.product.name} detail={`คำสั่งซื้อ #${work.order_id} · งาน #${work.id} · ${orderStatusLabel(work.order_status)}`}>
      {legacy ? <ThemedText type="small" themeColor="textSecondary">คำสั่งซื้อรุ่นเดิม (LEGACY_V1) ใช้กติกาผู้ขนส่งเดิม</ThemedText> : null}
      {work.inspection_overdue_escalated_at ? <ThemedText type="small" style={{ color: theme.danger }}>เกินกำหนดตรวจ 3 วันทำการ ส่งเรื่องให้ผู้ดูแลแล้ว</ThemedText> : null}
    </Notice>

    {work.shipment ? <Notice tone="neutral" title="พัสดุขาเข้าจากผู้ขาย">
      <Field label="ผู้ให้บริการขนส่ง" value={work.shipment.carrier} />
      <Field label="เลขพัสดุ" value={work.shipment.tracking_number} mono />
      <Field label="ผู้ขายส่งเมื่อ" value={when(work.shipment.shipped_at)} />
      {legacy ? <Field label="ผู้ขนส่งรุ่นเดิมยืนยันส่งถึง" value={when(work.shipment.courier_delivered_at) ?? 'ยังไม่ยืนยัน'} /> : null}
      <Field label="ศูนย์รับจริงเมื่อ" value={when(work.shipment.received_at)} />
    </Notice> : null}

    {work.order_status === 'SHIPPING_TO_CENTER' ? <Notice tone="info" title="รับสินค้าเข้าศูนย์" testID="receive-step"
      detail={legacy ? 'คำสั่งซื้อรุ่นเดิมต้องมีหลักฐานผู้ขนส่งยืนยันส่งถึงก่อน' : 'ยืนยันเมื่อได้รับพัสดุจริงที่ศูนย์ ไม่ต้องรอสถานะจากผู้ให้บริการขนส่ง'}>
      <TextField label="บันทึกการรับ (ไม่บังคับ)" value={note} onChangeText={setNote} editable={!actions.busy} />
      <Button label="ยืนยันรับสินค้าเข้าศูนย์จริง" variant="primary" busy={actions.busy} disabled={!receivable || !actions.onReceive || codePoints(note) > 1000}
        onPress={() => actions.onReceive?.(note)} />
    </Notice> : null}

    {work.order_status === 'RECEIVED_AT_CENTER' ? <Notice tone="info" title="เริ่มตรวจ" detail="เมื่อเริ่มตรวจ งานนี้จะเป็นของคุณ และรายการจะแสดงเฉพาะผู้ตรวจที่รับผิดชอบ">
      <Button label="เริ่มตรวจสินค้า" variant="primary" busy={actions.busy} disabled={!actions.onStart} onPress={() => actions.onStart?.()} />
    </Notice> : null}

    {work.order_status === 'INSPECTING' && !work.result ? <View style={{ gap: 14 }} testID="inspect-step">
      <Notice tone="neutral" title="หลักฐานการตรวจ (ส่วนตัว)" detail="เลือกภาพที่ใช้ในรายงาน 1–5 ภาพ ภาพเห็นได้เฉพาะผู้มีสิทธิ์">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {work.evidence.map(item => {
            const source = actions.photoSource(item.id);
            const isChosen = chosen.includes(item.id);
            return <Pressable key={item.id} accessibilityRole="checkbox" accessibilityLabel={`หลักฐาน ${item.id}`} accessibilityState={{ checked: isChosen }} disabled={actions.busy}
              onPress={() => setSelected(current => current.includes(item.id) ? current.filter(id => id !== item.id) : current.length < 5 ? [...current, item.id] : current)}
              onLongPress={() => source && setPhoto({ source, label: `หลักฐาน ${item.id}` })}
              style={{ padding: 3, borderWidth: 2, borderRadius: 12, borderColor: isChosen ? theme.primary : theme.border }}>
              {source ? <Image source={source} cachePolicy="none" style={{ width: 88, height: 88, borderRadius: 8 }} contentFit="cover" /> : <View style={{ width: 88, height: 88 }} />}
              <ThemedText type="small" style={{ textAlign: 'center' }}>{isChosen ? 'เลือกแล้ว' : 'เลือก'}</ThemedText>
            </Pressable>;
          })}
        </View>
        {work.evidence.length === 0 ? <ThemedText type="small" themeColor="textSecondary">ยังไม่มีภาพหลักฐาน</ThemedText> : null}
        <Button label={actions.pendingUpload ? 'ลองส่งรูปเดิมอีกครั้ง' : 'เพิ่มรูปหลักฐาน (JPEG/PNG/WebP ≤ 5 MB)'} busy={actions.busy}
          disabled={!actions.onPick || (work.evidence.length >= 5 && !actions.pendingUpload)} onPress={() => actions.onPick?.()} />
      </Notice>
      <Notice tone="neutral" title="ผลการตรวจ">
        <Chips<InspectionResult> options={(Object.keys(RESULT_LABELS) as InspectionResult[]).map(value => ({ value, label: RESULT_LABELS[value] }))} value={result} disabled={actions.busy} onChange={value => setResult(value)} />
        {result ? <ThemedText type="small" themeColor="textSecondary">{isPositive(result)
          ? 'ระบบจะออกใบรับรองพร้อมบันทึกผล และเปิดให้ผู้ซื้อตัดสินภายใน 72 ชั่วโมง'
          : 'ผลนี้ไม่ออกใบรับรอง ไม่เปิดให้ผู้ซื้อยอมรับ และสินค้าจะถูกส่งคืนผู้ขายพร้อมคืนเงินเต็มจำนวนตามนโยบาย'}</ThemedText> : null}
        <ThemedText type="small" themeColor="textSecondary">ตัวช่วยเขียนสรุป (แทรกข้อความลงในสรุปเท่านั้น ไม่ได้บันทึกเป็นคะแนนแยก)</ThemedText>
        {CHECKLIST.map(row => <View key={row.id} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <ThemedText type="small" style={{ minWidth: 72 }}>{row.label}</ThemedText>
          <Button label="✓ ตรง" disabled={actions.busy} onPress={() => setSummary(value => `${value.trim()}${value.trim() ? '\n' : ''}${row.ok}`)} />
          <Button label="✗ ไม่ตรง" disabled={actions.busy} onPress={() => setSummary(value => `${value.trim()}${value.trim() ? '\n' : ''}${row.bad}`)} />
        </View>)}
        <TextField label="สรุปผลการตรวจ" value={summary} onChangeText={setSummary} multiline editable={!actions.busy} style={{ minHeight: 120, textAlignVertical: 'top' }}
          error={summary.length > 0 && !summaryValid ? 'สรุป 10–2000 ตัวอักษร' : undefined} />
        <ThemedText type="small" themeColor="textSecondary">{codePoints(summary)}/2000 · เลือกหลักฐาน {chosen.length}/5</ThemedText>
        <Button label="ตรวจทานและบันทึกผล" variant="primary" busy={actions.busy} disabled={!finalValid || !actions.onFinalize} onPress={() => setReviewing(true)} />
      </Notice>
    </View> : null}

    {work.result ? <View style={{ gap: 14 }} testID="result-recorded">
      <Notice tone={isPositive(work.result) ? 'success' : 'danger'} title={RESULT_LABELS[work.result]} detail={`บันทึกเมื่อ ${when(work.inspected_at) ?? '-'}`}>
        {work.summary ? <ThemedText type="small">{work.summary}</ThemedText> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{work.evidence.map(item => {
          const source = actions.photoSource(item.id);
          return source ? <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`ขยายหลักฐาน ${item.id}`} onPress={() => setPhoto({ source, label: `หลักฐาน ${item.id}` })}>
            <Image source={source} cachePolicy="none" style={{ width: 72, height: 72, borderRadius: 8 }} contentFit="cover" />
          </Pressable> : null;
        })}</View>
      </Notice>
      {isPositive(work.result) ? <Notice tone="neutral" title="ใบรับรองผลตรวจ">
        {work.certificate ? <>
          <Field label="เลขที่" value={work.certificate.certificate_no} mono />
          <Field label="สถานะ" value={work.certificate.status === 'REVOKED' ? 'ถูกเพิกถอน (REVOKED)' : 'ออกแล้ว (ISSUED)'} />
          {work.certificate.status === 'ISSUED' ? <CertificateQr url={work.certificate.public_url} size={140} /> : null}
          <Button label="เปิดหน้าใบรับรองสาธารณะ" onPress={() => { void Linking.openURL(work.certificate!.public_url).catch(() => undefined); }} />
        </> : <ThemedText type="small" style={{ color: theme.danger }}>ไม่พบใบรับรองของผลนี้ กรุณาโหลดข้อมูลล่าสุด</ThemedText>}
      </Notice> : <Notice tone="neutral" title="ไม่ออกใบรับรองสำหรับผลนี้" detail="ไม่มีการตัดสินผลตรวจจากผู้ซื้อ สินค้าส่งคืนผู้ขาย" />}
      {isPositive(work.result) ? <Notice tone="neutral" title="การตัดสินของผู้ซื้อ">
        {work.buyer_decision ? <ThemedText type="small">{work.buyer_decision.decision === 'CONFIRM' ? 'ผู้ซื้อยอมรับผลตรวจ' : 'ผู้ซื้อปฏิเสธผลตรวจ'} · {when(work.buyer_decision.decided_at)}</ThemedText>
          : work.result_timed_out_at ? <ThemedText type="small">หมดเวลาตัดสินใจ ระบบบันทึกให้ส่งคืนผู้ขาย · {when(work.result_timed_out_at)}</ThemedText>
            : <ThemedText type="small">รอผู้ซื้อตัดสินภายใน {when(work.result_decision_deadline_at) ?? '-'}{deadlineLeft ? ` (เหลือ ${deadlineLeft})` : ''}</ThemedText>}
      </Notice> : null}
    </View> : null}

    {work.can_create_fulfillment ? <Notice tone="info" title={work.next_action === 'SHIP_TO_BUYER' ? 'ส่งสินค้าถึงผู้ซื้อ' : 'ส่งสินค้าคืนผู้ขาย'} testID="outbound-step"
      detail={work.next_action === 'SHIP_TO_BUYER' ? 'ปลายทางคือที่อยู่จัดส่งที่ผู้ซื้อบันทึกในคำสั่งซื้อ ระบบเลือกให้' : 'ปลายทางคือที่อยู่รับคืนที่ผู้ขายบันทึกและถูกล็อกไว้ ระบบเลือกให้'}>
      <SimLabel text="ขนส่งจำลองสำหรับต้นแบบ" />
      <TextField label="ผู้ให้บริการขนส่ง" value={carrier} onChangeText={setCarrier} editable={!actions.busy} placeholder="ระบุบริการที่ใช้จริง" />
      <TextField label="เลขพัสดุ" value={tracking} onChangeText={setTracking} editable={!actions.busy} placeholder="ตามใบรับพัสดุ" />
      <ThemedText type="small" themeColor="textSecondary">ไม่ต้องแนบรูปพัสดุ การส่งถึงและการรับจริงยืนยันโดยผู้รับหรือเหตุการณ์ขนส่ง ไม่ใช่ศูนย์ตรวจ</ThemedText>
      <Button label="บันทึกการส่งออก" variant="primary" busy={actions.busy} disabled={!carrierValid || !actions.onShip} onPress={() => setShipping(true)} />
    </Notice> : work.fulfillment ? <Notice tone="success" title={work.fulfillment.leg === 'TO_BUYER' ? 'บันทึกส่งถึงผู้ซื้อแล้ว' : 'บันทึกส่งคืนผู้ขายแล้ว'}
      detail="การส่งถึงจะแสดงจากเหตุการณ์ขนส่ง และการรับจริงยืนยันโดยผู้รับ ศูนย์ไม่ต้องดำเนินการต่อ" />
      : work.result && work.next_action === 'RETURN_TO_SELLER' && work.order_status === 'RESULT_NOTIFIED' ? <Notice tone="warning" title="ยังส่งคืนไม่ได้"
        detail="ไม่มีที่อยู่รับคืนที่ล็อกไว้ ต้องให้ผู้ดูแลตรวจสอบ" /> : null}

    {!!actions.error && <Notice tone="danger" title="ทำรายการไม่สำเร็จ" detail={actions.error}>
      {actions.onRefresh ? <Button label="โหลดสถานะล่าสุด" onPress={actions.onRefresh} /> : null}</Notice>}

    <ConfirmationSheet visible={reviewing} title="ยืนยันผลการตรวจ" onClose={() => setReviewing(false)}>
      <ThemedText type="subtitle">{result ? RESULT_LABELS[result] : ''}</ThemedText>
      <ThemedText>{summary.trim()}</ThemedText>
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
  if (!work) return <LoadState {...resource} />;
  const evidence = new Map(work.evidence.map(item => [item.id, item]));
  return <>
    <InspectorWorkView work={work} actions={{
      busy: action.busy || resource.loading, error: action.error ?? error, pendingUpload: !!pendingFile,
      photoSource: evidenceId => { const item = evidence.get(evidenceId); try { return item ? api.service.privateImageSource(api.token, item) : null; } catch { return null; } },
      onReceive: note => { void run(`receive:${id}:${note.trim()}`, key => api.call(token => api.service.receive(token, id, note.trim() || null, key))); },
      onStart: () => { void run(`start:${id}`, key => api.call(token => api.service.start(token, id, key))); },
      onPick: () => { void upload(); },
      onFinalize: input => { void run(`result:${id}:${JSON.stringify(input)}`, key => api.call(token => api.service.result(token, id, input, key))); },
      onShip: input => { void run(`fulfillment:${work.order_id}:${JSON.stringify(input)}`, key => shipping.call(token => shipping.service.createFulfillment(token, work.order_id, input, key))); },
      onRefresh: () => { void resource.reload(); },
    }} />
    {resource.error ? <LoadState {...resource} /> : null}
    <Button label="โหลดสถานะล่าสุด" disabled={action.busy || resource.loading} onPress={() => { void resource.reload(); }} />
  </>;
}

export function InspectorWorkScreen({ inspectionId }: { inspectionId?: string }) {
  const id = parseRouteId(inspectionId);
  return <StaffScreen title="ตรวจสินค้า" role="INSPECTOR">{id === null ? <EmptyState title="รหัสงานไม่ถูกต้อง" /> : <Work key={id} id={id} />}</StaffScreen>;
}
