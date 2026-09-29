/** Presentational boundary for INSPECT #95 / CERT #100. No network or mock data.
 * Integration must supply owner-authorized data and idempotent mutation callbacks.
 */
import { useState, type ReactNode } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Image, type ImageSource } from 'expo-image';
import { useTheme } from '@/hooks/use-theme';
import { Button, Card, Loading, Row } from '../order-ui';
import { ThemedText } from '../themed-text';
import { WondeeMascot, type MascotVariant } from '../wondee/brand';
import { ConfirmationSheet, EmptyState, ImageViewer, TextField } from '../wondee/primitives';

export type InspectionOutcome = 'PASS' | 'MINOR_ISSUE' | 'NOT_AS_DESCRIBED' | 'FAKE';
export const outcomes: Record<InspectionOutcome, { label: string; variant: MascotVariant; tone: 'success' | 'warning' | 'info' | 'danger' }> = {
  PASS: { label: 'ผ่านการตรวจตามรายงาน', variant: 'pass', tone: 'success' },
  MINOR_ISSUE: { label: 'ผ่านการตรวจ พบข้อสังเกต', variant: 'minor', tone: 'warning' },
  NOT_AS_DESCRIBED: { label: 'พบข้อมูลไม่ตรงประกาศ', variant: 'discrepancy', tone: 'info' },
  FAKE: { label: 'ผลตรวจระบุว่าไม่ผ่านการตรวจความแท้', variant: 'fake', tone: 'danger' },
};
export type InspectionPhoto = { id: number; source: ImageSource; label: string };
export type CertificateData = { number: string; publicUrl: string; qrSource?: ImageSource; issuedAt: string };
export function UnavailableInspection({ title = 'บริการตรวจสินค้ายังไม่พร้อมใช้งาน' }: { title?: string }) {
  return <Card><EmptyState title={title} detail="คุณยังดูสถานะคำสั่งซื้อและใบเสร็จที่มีอยู่ได้ กรุณากลับมาตรวจสอบบริการนี้อีกครั้ง" /></Card>;
}
export function SellerShipView({ orderId, productName, deadline, busy = false, error, onSubmit }: {
  orderId: number; productName: string; deadline?: string | null; busy?: boolean; error?: string | null;
  onSubmit?: (data: { carrier: string; tracking_number: string }) => void;
}) {
  const [carrier, setCarrier] = useState('');
  const [tracking, setTracking] = useState('');
  const [attempted, setAttempted] = useState(false);
  const valid = [...carrier.trim()].length >= 1 && [...carrier.trim()].length <= 100 && [...tracking.trim()].length >= 1 && [...tracking.trim()].length <= 100;
  return <View style={{ gap: 16 }}><Card>
    <View style={{ alignItems: 'center', gap: 12 }}><WondeeMascot size={96} variant="courier" /><ThemedText type="title">ส่งของรักเข้าศูนย์ตรวจ</ThemedText></View>
    <ThemedText>คำสั่งซื้อ #{orderId} · {productName}</ThemedText><ThemedText themeColor="textSecondary">แพ็กสินค้าให้เหมาะสมและเก็บหลักฐานการจัดส่ง ระบุผู้ขนส่งและเลขติดตามจากพัสดุจริง</ThemedText>
    {deadline ? <Row label="กำหนดส่งจากระบบ" value={new Date(deadline).toLocaleString('th-TH')} /> : <ThemedText type="small">ยังไม่มีข้อมูลกำหนดส่งจากระบบ</ThemedText>}
  </Card><Card>
    <TextField label="ผู้ให้บริการขนส่ง" value={carrier} onChangeText={setCarrier} placeholder="เช่น ไปรษณีย์ไทย" editable={!busy} error={attempted && !valid ? 'ทั้งสองช่องต้องมี 1–100 ตัวอักษร' : undefined} />
    <TextField label="เลขติดตามพัสดุ" value={tracking} onChangeText={setTracking} placeholder="เลขจากใบรับพัสดุ" editable={!busy} error={attempted && !valid ? 'กรุณาตรวจสอบข้อมูล ทั้งสองช่องต้องมี 1–100 ตัวอักษร' : undefined} />
    {!!error && <ThemedText accessibilityRole="alert">{error}</ThemedText>}
    <Button label="ยืนยันการจัดส่งเข้าศูนย์" variant="primary" disabled={!onSubmit} busy={busy} onPress={() => { setAttempted(true); if (valid) onSubmit?.({ carrier: carrier.trim(), tracking_number: tracking.trim() }); }} />
    {!onSubmit && <ThemedText type="small" themeColor="textSecondary">บริการแจ้งส่งยังไม่พร้อมใช้งาน</ThemedText>}
  </Card></View>;
}
export function InspectorQueueView({ items, total, loading, error, filter, onFilter, onOpen, onMore, onRetry }: {
  items: { id: number; orderId: number; productName: string; statusLabel: string }[];
  total: number | null; loading?: boolean; error?: string; filter: string;
  onFilter?(value: string): void; onOpen?(id: number): void; onMore?(): void; onRetry?(): void;
}) {
  return <View style={{ gap: 16 }}><Card><View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}><WondeeMascot size={80} variant="inspector" /><View style={{ flex: 1 }}><ThemedText type="title">งานตรวจสินค้า</ThemedText><ThemedText themeColor="textSecondary">ตรวจอย่างละเอียด บันทึกตามที่พบ</ThemedText></View></View>{total !== null && <Row label="รายการในคิวตามตัวกรอง" value={String(total)} />}</Card>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{[['all', 'ทั้งหมด'], ['waiting', 'รอรับ'], ['inspecting', 'กำลังตรวจ']].map(([value, label]) => <Button key={value} label={label} variant={filter === value ? 'primary' : 'secondary'} disabled={!onFilter} onPress={() => onFilter?.(value)} />)}</View>
    {loading && <Loading label="กำลังโหลดงานตรวจ" />}
    {!!error && <Card><ThemedText accessibilityRole="alert">{error}</ThemedText>{onRetry && <Button label="ลองใหม่" onPress={onRetry} />}</Card>}
    {!loading && !error && items.length === 0 && <EmptyState title="ยังไม่มีงานตรวจในคิวนี้" />}
    {items.map(item => <Card key={item.id}><ThemedText type="small">คำสั่งซื้อ #{item.orderId}</ThemedText><ThemedText type="subtitle">{item.productName}</ThemedText><ThemedText themeColor="accent">{item.statusLabel}</ThemedText><Button label="เปิดงานตรวจ" disabled={!onOpen} onPress={() => onOpen?.(item.id)} /></Card>)}
    {onMore && <Button label="หน้าถัดไป" onPress={onMore} />}
  </View>;
}
export function InspectorWorkView({ productName, step, photos = [], busy, error, onReceive, onStart, onPick, onFinalize }: {
  productName: string; step: 1 | 2 | 3; photos?: InspectionPhoto[]; busy?: boolean; error?: string;
  onReceive?(): void; onStart?(): void; onPick?(): void;
  onFinalize?(data: { result: InspectionOutcome; summary: string; evidence_ids: number[] }): void;
}) {
  const theme = useTheme();
  const [result, setResult] = useState<InspectionOutcome | null>(null);
  const [summary, setSummary] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const [confirm, setConfirm] = useState(false);
  const chosen = selected.filter(id => photos.some(photo => photo.id === id));
  const valid = !!result && [...summary.trim()].length >= 10 && [...summary.trim()].length <= 2000 && chosen.length >= 1 && chosen.length <= 5;
  return <View style={{ gap: 16 }}><Card><WondeeMascot size={80} variant="inspector" /><ThemedText type="title">ตรวจสินค้าอย่างละเอียด</ThemedText><ThemedText>{productName}</ThemedText>
    {['รับสินค้าเข้าศูนย์', 'ตรวจและเก็บหลักฐาน', 'ยืนยันผลการตรวจ'].map((label, index) => <View key={label} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><View style={{ borderRadius: 24, backgroundColor: step >= index + 1 ? theme.primary : theme.backgroundElement, padding: 10 }}><ThemedText style={{ color: step >= index + 1 ? theme.onPrimary : theme.textSecondary }}>{index + 1}</ThemedText></View><ThemedText style={{ flex: 1 }}>{label}{step === index + 1 ? ' · ขั้นตอนปัจจุบัน' : ''}</ThemedText></View>)}</Card>
    {step === 1 && <Card><ThemedText>รับสินค้าได้เมื่อมีหลักฐานส่งถึงศูนย์ที่ระบบยืนยันแล้ว</ThemedText><Button label="รับสินค้าเข้าศูนย์" disabled={!onReceive} busy={busy} onPress={() => onReceive?.()} /><Button label="เริ่มตรวจสินค้า" disabled={!onStart} busy={busy} onPress={() => onStart?.()} /></Card>}
    {step >= 2 && <Card><ThemedText type="subtitle">หลักฐานการตรวจ</ThemedText><ThemedText themeColor="textSecondary">เลือกภาพที่ใช้ในรายงาน 1–5 ภาพจากสินค้านี้</ThemedText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{photos.map(photo => <Pressable key={photo.id} accessibilityRole="checkbox" accessibilityLabel={photo.label} accessibilityState={{ checked: chosen.includes(photo.id), disabled: !!busy }} disabled={busy}
        onPress={() => setSelected(current => current.includes(photo.id) ? current.filter(id => id !== photo.id) : current.length < 5 ? [...current, photo.id] : current)} style={{ padding: 4, borderWidth: 2, borderRadius: 12, borderColor: chosen.includes(photo.id) ? theme.primary : theme.border }}><Image cachePolicy="none" source={photo.source} style={{ width: 96, height: 96 }} contentFit="cover" /><ThemedText type="small">{chosen.includes(photo.id) ? 'เลือกแล้ว' : 'เลือกภาพ'}</ThemedText></Pressable>)}</View>
      <Button label="เพิ่มรูปหลักฐาน" disabled={!onPick} busy={busy} onPress={() => onPick?.()} />
      <ThemedText type="subtitle">ผลการตรวจ</ThemedText>{(Object.keys(outcomes) as InspectionOutcome[]).map(value => <Button key={value} label={outcomes[value].label} variant={result === value ? 'primary' : 'secondary'} disabled={busy} onPress={() => setResult(value)} />)}
      <TextField label="สรุปผลการตรวจ" multiline value={summary} onChangeText={setSummary} editable={!busy} placeholder="อธิบายสิ่งที่พบ 10–2000 ตัวอักษร" style={{ minHeight: 130 }} />
      <ThemedText type="small" themeColor="textSecondary">{[...summary.trim()].length}/2000 ตัวอักษร · เลือก {chosen.length}/5 ภาพ</ThemedText>
      {!!error && <ThemedText accessibilityRole="alert">{error}</ThemedText>}
      <Button label="ตรวจทานและยืนยันผล" variant="primary" disabled={!valid || !onFinalize} busy={busy} onPress={() => setConfirm(true)} />
    </Card>}
    <ConfirmationSheet visible={confirm} title="ยืนยันผลการตรวจ" onClose={() => setConfirm(false)}><ThemedText>{result ? outcomes[result].label : ''}</ThemedText><ThemedText>{summary}</ThemedText><ThemedText>หลักฐานที่เลือก {chosen.length} ภาพ</ThemedText><ThemedText>เมื่อบันทึกแล้วจะเปลี่ยนผลผ่านหน้านี้ไม่ได้ กรุณาตรวจหลักฐานให้ครบ</ThemedText><Button label={result === 'PASS' || result === 'MINOR_ISSUE' ? 'บันทึกผลและออกใบรับรอง' : 'บันทึกผลตรวจ'} variant="primary" disabled={!valid || !onFinalize} busy={busy} onPress={() => { if (valid && result) { onFinalize?.({ result, summary: summary.trim(), evidence_ids: chosen }); setConfirm(false); } }} /></ConfirmationSheet>
  </View>;
}
export function CertificateSheet({ certificate, outcome, enabled, visible, onClose }: {
  certificate: CertificateData | null; outcome: InspectionOutcome; enabled: boolean; visible: boolean; onClose(): void;
}) {
  const eligible = outcome === 'PASS' || outcome === 'MINOR_ISSUE';
  const publicReady = enabled && certificate && (() => {
    try {
      const url = new URL(certificate.publicUrl);
      return url.protocol === 'https:' || (__DEV__ && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname));
    } catch { return false; }
  })();
  return <ConfirmationSheet visible={visible} title="ใบรับรองผลการตรวจ" onClose={onClose}>
    {eligible && certificate ? <><View style={{ alignItems: 'center' }}><WondeeMascot size={96} variant="seal" /></View><ThemedText type="title">{certificate.number}</ThemedText><ThemedText>{outcomes[outcome].label}</ThemedText><ThemedText type="small">ออกเมื่อ {new Date(certificate.issuedAt).toLocaleString('th-TH')}</ThemedText><ThemedText>รับรองผลการตรวจ ณ วันที่ออกตามรายงาน</ThemedText>
      {publicReady ? <>{certificate.qrSource && <Image source={certificate.qrSource} style={{ width: 180, height: 180, alignSelf: 'center' }} contentFit="contain" accessibilityLabel="QR เปิดใบรับรองสาธารณะ" />}<Button label="เปิดใบรับรองสาธารณะ" onPress={() => { void Linking.openURL(certificate.publicUrl); }} /></> : <ThemedText>หน้าใบรับรองสาธารณะและ QR ยังไม่พร้อมใช้งาน</ThemedText>}
    </> : <ThemedText>ไม่มีใบรับรองสำหรับผลการตรวจนี้</ThemedText>}
  </ConfirmationSheet>;
}
export function BuyerResultView({ outcome, summary, inspectedAt, photos = [], certificate = null, nextAction,
  certificatePublicHtml = false, certificateDecision = false, canDecide = false, busy, error, onDecision }: {
  outcome: InspectionOutcome; summary: string; inspectedAt: string; photos?: InspectionPhoto[];
  certificate?: CertificateData | null; nextAction: 'WAIT_BUYER_DECISION' | 'RETURN_TO_SELLER' | 'SHIP_TO_BUYER' | null;
  certificatePublicHtml?: boolean; certificateDecision?: boolean; canDecide?: boolean; busy?: boolean; error?: string;
  onDecision?(decision: 'CONFIRM' | 'REJECT', reason?: string | null): void;
}) {
  const theme = useTheme();
  const info = outcomes[outcome];
  const [showCertificate, setCertificate] = useState(false);
  const [photo, setPhoto] = useState<InspectionPhoto | null>(null);
  const [decision, setDecision] = useState<'CONFIRM' | 'REJECT' | null>(null);
  const [reason, setReason] = useState('');
  const validReason = [...reason.trim()].length <= 500;
  const positive = outcome === 'PASS' || outcome === 'MINOR_ISSUE';
  const allowed = positive && !!certificate && certificateDecision && canDecide && nextAction === 'WAIT_BUYER_DECISION' && !!onDecision;
  return <View style={{ gap: 16 }}><Card><View style={{ alignItems: 'center', gap: 16 }}><WondeeMascot size={96} variant={info.variant} /><ThemedText type="title" style={{ color: theme[info.tone], textAlign: 'center' }}>{info.label}</ThemedText><ThemedText type="small" themeColor="textSecondary">ตรวจเมื่อ {new Date(inspectedAt).toLocaleString('th-TH')}</ThemedText></View></Card>
    <Card><ThemedText type="subtitle">รายงานการตรวจ</ThemedText><ThemedText>{summary}</ThemedText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{photos.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`ขยาย${item.label}`} onPress={() => setPhoto(item)}><Image cachePolicy="none" source={item.source} style={{ width: 96, height: 96, borderRadius: 12 }} accessibilityLabel={item.label} /></Pressable>)}</View></Card>
    {positive && certificate && <Card><Button label="ดูใบรับรองผลการตรวจ" onPress={() => setCertificate(true)} /></Card>}
    <Card><ThemedText type="subtitle">ขั้นตอนถัดไป</ThemedText><ThemedText>{nextAction === 'RETURN_TO_SELLER' ? 'ระบบอยู่ระหว่างขั้นตอนส่งคืนผู้ขาย ติดตามสถานะการคืนเงินจากคำสั่งซื้อ' : nextAction === 'WAIT_BUYER_DECISION' ? 'โปรดอ่านรายงานและหลักฐานก่อนตัดสินใจเกี่ยวกับผลตรวจ' : 'ยังไม่มีข้อมูลขั้นตอนถัดไปจากระบบ'}</ThemedText>
      {allowed ? <><Button label="ยอมรับผลตรวจ" variant="primary" busy={busy} onPress={() => setDecision('CONFIRM')} /><Button label="ไม่ยอมรับผลตรวจ" busy={busy} onPress={() => { setReason(''); setDecision('REJECT'); }} /></> : positive && <ThemedText type="small">การตัดสินผลตรวจยังไม่พร้อมใช้งานสำหรับรายการนี้</ThemedText>}
      {!!error && <ThemedText accessibilityRole="alert">{error}</ThemedText>}
    </Card>
    <CertificateSheet certificate={positive ? certificate : null} outcome={outcome} enabled={certificatePublicHtml} visible={showCertificate && positive} onClose={() => setCertificate(false)} />
    <ImageViewer source={photo?.source} label={photo?.label ?? 'หลักฐานการตรวจ'} onClose={() => setPhoto(null)} />
    <ConfirmationSheet visible={!!decision && allowed} title="ยืนยันการตัดสินผลตรวจ" onClose={() => setDecision(null)}>
      <ThemedText>การตัดสินใจนี้เกี่ยวกับผลตรวจเท่านั้น ไม่ใช่การยืนยันรับสินค้า</ThemedText>
      {decision === 'REJECT' && <TextField label="เหตุผลที่ไม่ยอมรับ (ไม่บังคับ)" value={reason} onChangeText={setReason} multiline editable={!busy} error={!validReason ? 'เหตุผลต้องไม่เกิน 500 ตัวอักษร' : undefined} />}
      <Button label={decision === 'CONFIRM' ? 'ยืนยันยอมรับผลตรวจ' : 'ยืนยันไม่ยอมรับผลตรวจ'} variant="primary" disabled={decision === 'REJECT' && !validReason} busy={busy} onPress={() => {
        if (decision && allowed && (decision !== 'REJECT' || validReason)) {
          if (decision === 'REJECT') onDecision?.(decision, reason.trim() || null);
          else onDecision?.(decision);
          setDecision(null);
        }
      }} />
    </ConfirmationSheet>
  </View>;
}
export function OrderTimeline({ events }: { events: { label: string; at: string; detail?: ReactNode }[] }) {
  const theme = useTheme();
  return <Card><ThemedText type="subtitle">ความคืบหน้าคำสั่งซื้อ</ThemedText>{events.map((event, index) => <View key={`${event.label}-${index}`} style={{ flexDirection: 'row', gap: 12 }}>
    <View style={{ width: 14, alignItems: 'center' }}><View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: theme.accent, marginTop: 5 }} />{index < events.length - 1 && <View style={{ width: 2, flex: 1, backgroundColor: theme.border }} />}</View>
    <View style={{ flex: 1, paddingBottom: 16, gap: 4 }}><ThemedText type="smallBold">{event.label}</ThemedText><ThemedText type="small" themeColor="textSecondary">{new Date(event.at).toLocaleString('th-TH')}</ThemedText>{event.detail}</View>
  </View>)}</Card>;
}
