/** Presentational boundary for INSPECT #95 / CERT #100. No network or mock data.
 * Integration must supply owner-authorized data and idempotent mutation callbacks.
 */
import { useState, type ReactNode } from 'react';
import { Linking, Platform, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { Image, type ImageSource } from 'expo-image';
import { useTheme } from '@/hooks/use-theme';
import { Button, Card, Loading, Row } from '../order-ui';
import { ThemedText } from '../themed-text';
import { WondeeMascot, type MascotVariant } from '../wondee/brand';
import { BrandIcon } from '../wondee/brand-logo';
import { ProductImage } from '../product-catalog-ui';
import { ConfirmationSheet, EmptyState, ImageViewer, TextField } from '../wondee/primitives';
import { ServerDeadline } from '../wondee/status';
import { CertificateQr } from '../certificate-qr';

export type InspectionOutcome = 'PASS' | 'MINOR_ISSUE' | 'NOT_AS_DESCRIBED' | 'FAKE';
export const outcomes: Record<InspectionOutcome, { label: string; variant: MascotVariant; tone: 'success' | 'warning' | 'info' | 'danger' }> = {
  PASS: { label: 'ผ่านการตรวจตามรายงาน', variant: 'pass', tone: 'success' },
  MINOR_ISSUE: { label: 'ผ่านการตรวจ พบข้อสังเกต', variant: 'minor', tone: 'warning' },
  NOT_AS_DESCRIBED: { label: 'พบข้อมูลไม่ตรงประกาศ', variant: 'discrepancy', tone: 'info' },
  FAKE: { label: 'ผลตรวจระบุว่าไม่ผ่านการตรวจความแท้', variant: 'fake', tone: 'danger' },
};
export type InspectionPhoto = { id: number; source: ImageSource; label: string };
export type CertificateData = { number: string; publicUrl: string; qrSource?: ImageSource; issuedAt: string; status?: 'ISSUED' | 'REVOKED' };
export type BuyerDecisionData = { decision: 'CONFIRM' | 'REJECT'; reason: string | null; decidedAt: string };
export function UnavailableInspection({ title = 'บริการตรวจสินค้ายังไม่พร้อมใช้งาน' }: { title?: string }) {
  return <Card><EmptyState title={title} detail="คุณยังดูสถานะคำสั่งซื้อและใบเสร็จที่มีอยู่ได้ กรุณากลับมาตรวจสอบบริการนี้อีกครั้ง" /></Card>;
}
const COMMON_CARRIERS = ['ไปรษณีย์ไทย', 'Flash Express', 'Kerry Express', 'J&T Express', 'SPX Express'];

function ShipIcon({ name, color, size = 14 }: { name: 'box' | 'tag' | 'ban' | 'lock' | 'info'; color: string; size?: number }) {
  const s = { stroke: color, strokeWidth: 2, fill: 'none' as const, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return <Svg width={size} height={size} viewBox="0 0 24 24">
    {name === 'box' ? <><Path {...s} d="M21 8 12 3 3 8v8l9 5 9-5z" /><Path {...s} d="M3 8l9 5 9-5M12 13v8" /></>
      : name === 'tag' ? <><Path {...s} d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" /><Circle {...s} cx={7.5} cy={7.5} r={1.3} /></>
        : name === 'ban' ? <><Circle {...s} cx={12} cy={12} r={9} /><Path {...s} d="m5.6 5.6 12.8 12.8" /></>
          : name === 'lock' ? <><Rect {...s} x={5} y={11} width={14} height={10} rx={2} /><Path {...s} d="M8 11V7a4 4 0 0 1 8 0v4" /></>
            : <><Circle {...s} cx={12} cy={12} r={9} /><Path {...s} d="M12 11v5M12 8h.01" /></>}
  </Svg>;
}

/** ผู้ขายแจ้งส่งสินค้าเข้าศูนย์ตาม design: ขนส่ง+เลขพัสดุ → ที่อยู่รับคืน (children) → ยืนยัน (ปุ่มติดล่างจอ) */
export function SellerShipView({ orderId, productName, paidAt, busy = false, error, onSubmit, children, product, statusLabel }: {
  orderId: number; productName: string; paidAt?: string | null; busy?: boolean; error?: string | null; children?: ReactNode;
  onSubmit?: (data: { carrier: string; tracking_number: string }) => void;
  product?: { condition?: string | null; size?: string | null; imageUrl?: string | null };
  statusLabel?: string;
}) {
  const theme = useTheme();
  const muted = theme.background === '#0c0e14' ? '#64748b' : '#94a3b8';
  const [carrier, setCarrier] = useState('');
  const [tracking, setTracking] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const len = (value: string) => [...value.trim()].length;
  const carrierOk = len(carrier) >= 1 && len(carrier) <= 100;
  const trackingOk = len(tracking) >= 1 && len(tracking) <= 100;
  const valid = carrierOk && trackingOk;
  const card = [shipStyles.card, { backgroundColor: theme.surface, borderColor: theme.border }];
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={shipStyles.scroll} keyboardShouldPersistTaps="handled">
        {/* สินค้าในคำสั่งซื้อ */}
        <View style={[card, shipStyles.productRow]}>
          <View style={shipStyles.thumb}>
            <ProductImage uri={product?.imageUrl ?? null} width={48} height={48} borderRadius={12} accessibilityLabel={`รูปสินค้า ${productName}`} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <ThemedText numberOfLines={1} style={[shipStyles.productName, { color: theme.text }]}>{productName}</ThemedText>
            <ThemedText style={[shipStyles.muted, { color: muted }]}>คำสั่งซื้อ #{orderId}{product?.size?.trim() ? ` · ขนาด ${product.size}` : ''}</ThemedText>
          </View>
          {statusLabel ? <View style={shipStyles.statusPill}><ThemedText style={shipStyles.statusPillText}>{statusLabel}</ThemedText></View> : null}
        </View>

        {/* กำหนดส่ง (ตามนโยบาย ไม่นับถอยหลังเอง) */}
        <View style={shipStyles.deadline}>
          <ThemedText style={[shipStyles.deadlineTitle, { color: theme.text }]}>ต้องส่งสินค้าภายใน 72 ชั่วโมงหลังผู้ซื้อชำระเงิน</ThemedText>
          <ThemedText style={[shipStyles.deadlineText, { color: theme.textSecondary }]}>
            {paidAt ? `ผู้ซื้อชำระเมื่อ ${new Date(paidAt).toLocaleString('th-TH')} · ` : ''}ถ้าไม่ส่งตามกำหนด ระบบจะคืนเงินผู้ซื้อเต็มจำนวน
          </ThemedText>
        </View>

        <View style={card}>
          <ThemedText style={[shipStyles.title, { color: theme.text }]}>ส่งไปที่</ThemedText>
          <ThemedText style={[shipStyles.body, { color: theme.textSecondary }]}>
            ศูนย์ตรวจสอบ 2NDHAND ตามที่อยู่ที่ผู้ดูแลเดโมแจ้ง (ระบบยังไม่มีข้อมูลที่อยู่ศูนย์ให้แสดงในแอป)
          </ThemedText>
        </View>

        <View style={card}>
          <ThemedText style={[shipStyles.title, { color: theme.text }]}>วิธีแพ็กสินค้า</ThemedText>
          <View style={shipStyles.line}><ShipIcon name="box" color={theme.textSecondary} /><ThemedText style={[shipStyles.body, { color: theme.textSecondary }]}>ใส่กล่องแข็ง กันกระแทกรอบด้าน</ThemedText></View>
          <View style={shipStyles.line}><ShipIcon name="tag" color={theme.textSecondary} /><ThemedText style={[shipStyles.body, { color: theme.textSecondary }]}>เขียนเลขคำสั่งซื้อ <ThemedText style={[shipStyles.body, { color: theme.text, fontWeight: '700' }]}>#{orderId}</ThemedText> ข้างกล่อง</ThemedText></View>
          <View style={shipStyles.line}><ShipIcon name="ban" color={theme.textSecondary} /><ThemedText style={[shipStyles.body, { color: theme.textSecondary }]}>อย่าใส่ของอื่นที่ไม่ได้ลงประกาศ</ThemedText></View>
        </View>

        {/* 1. ขนส่ง + เลขพัสดุ: เลือกบริษัทยอดนิยมหรือพิมพ์เอง รับได้ทุกบริการ 1–100 ตัวอักษร ไม่แปลงรูปแบบ */}
        <View style={card}>
          <ThemedText style={[shipStyles.title, { color: theme.text }]}>1. บริษัทขนส่งที่ใช้ส่ง</ThemedText>
          <ThemedText style={[shipStyles.muted, { color: muted }]}>ส่งที่สาขาขนส่งเอง แล้วกรอกเลขพัสดุจากใบเสร็จ · ค่าส่งเข้าศูนย์ผู้ขายจ่ายเอง</ThemedText>
          <View style={shipStyles.chips}>
            {COMMON_CARRIERS.map(name => {
              const on = carrier.trim() === name;
              return <Pressable key={name} accessibilityRole="button" accessibilityLabel={`เลือก ${name}`} accessibilityState={{ selected: on }}
                disabled={busy} onPress={() => setCarrier(name)}
                style={[shipStyles.chip, { borderColor: on ? '#10b981' : theme.border, backgroundColor: on ? 'rgba(16, 185, 129, 0.12)' : 'transparent' }]}>
                <ThemedText style={[shipStyles.chipText, { color: on ? '#10b981' : theme.text, fontWeight: on ? '700' : '500' }]}>{name}</ThemedText>
              </Pressable>;
            })}
          </View>
          <TextField label="ผู้ให้บริการขนส่ง" value={carrier} onChangeText={setCarrier} editable={!busy}
            placeholder="เลือกด้านบน หรือพิมพ์ชื่อบริการอื่นที่ใช้จริง"
            error={attempted && !carrierOk ? 'ระบุผู้ให้บริการขนส่ง 1–100 ตัวอักษร' : undefined} />
          <TextField label="เลขติดตามพัสดุ" value={tracking} onChangeText={setTracking} editable={!busy}
            placeholder="เลขจากใบรับพัสดุ" autoCapitalize="characters"
            style={{ fontFamily: 'monospace', letterSpacing: 0.5 }}
            error={attempted && !trackingOk ? 'ระบุเลขพัสดุ 1–100 ตัวอักษร' : undefined} />
        </View>

        {/* 2. ที่อยู่รับคืน (ฟอร์มจาก API) */}
        {children}

        <View style={[shipStyles.note, { backgroundColor: theme.backgroundElement }]}>
          <ShipIcon name="info" color={theme.textSecondary} />
          <ThemedText style={[shipStyles.muted, { flex: 1, color: theme.textSecondary }]}>
            ศูนย์จะตรวจความแท้ สภาพ และความตรงกับประกาศ ก่อนส่งต่อให้ผู้ซื้อ · เงินของผู้ซื้อพักไว้ที่ระบบจนกว่าผู้ซื้อจะได้รับสินค้า
          </ThemedText>
        </View>
        {!!error && <ThemedText accessibilityRole="alert" style={{ color: theme.danger, fontSize: 12 }}>{error}</ThemedText>}
      </ScrollView>

      <View style={[shipStyles.dock, { backgroundColor: theme.background === '#0c0e14' ? '#121622' : '#ffffff', borderTopColor: theme.border }]}>
        {!onSubmit ? <ThemedText style={[shipStyles.muted, { color: '#f59e0b', textAlign: 'center' }]}>บันทึกที่อยู่รับคืนก่อน จึงแจ้งส่งสินค้าเข้าศูนย์ได้</ThemedText> : null}
        <Button label="ยืนยันการจัดส่งเข้าศูนย์" variant="primary" disabled={!onSubmit} busy={busy}
          onPress={() => { setAttempted(true); if (valid) setConfirming(true); }} />
      </View>

      <ConfirmationSheet visible={confirming && valid && !!onSubmit} title="ยืนยันว่าส่งสินค้าแล้ว?" onClose={() => setConfirming(false)}>
        <View style={[shipStyles.summary, { backgroundColor: theme.backgroundElement }]}>
          <Row label="บริษัทขนส่ง" value={carrier.trim()} />
          <Row label="เลขพัสดุ" value={tracking.trim()} />
        </View>
        <View style={shipStyles.line}><ShipIcon name="lock" color="#f59e0b" />
          <ThemedText style={[shipStyles.muted, { flex: 1, color: '#f59e0b', fontWeight: '600' }]}>ที่อยู่รับคืนจะถูกล็อก · เลขพัสดุส่งให้ผู้ซื้อและศูนย์ทันที</ThemedText>
        </View>
        <Button label="ยืนยันส่งเข้าศูนย์" variant="primary" busy={busy}
          // Server accepts any carrier/tracking text trimmed to 1–100 characters; no format normalization.
          onPress={() => { setConfirming(false); onSubmit?.({ carrier: carrier.trim(), tracking_number: tracking.trim() }); }} />
      </ConfirmationSheet>
    </View>
  );
}

const shipStyles = StyleSheet.create({
  scroll: { padding: 16, gap: 12, paddingBottom: 24, width: '100%', maxWidth: 800, alignSelf: 'center' },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 8 },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  thumb: { width: 48, height: 48, borderRadius: 12, overflow: 'hidden' },
  productName: { fontSize: 12, lineHeight: 18, fontWeight: '600' },
  statusPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: 'rgba(14, 165, 233, 0.15)' },
  statusPillText: { fontSize: 10, lineHeight: 15, fontWeight: '700', color: '#0ea5e9' },
  deadline: { borderRadius: 16, borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.35)', backgroundColor: 'rgba(245, 158, 11, 0.1)', padding: 16, gap: 4 },
  deadlineTitle: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  deadlineText: { fontSize: 11, lineHeight: 17 },
  title: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  body: { fontSize: 12, lineHeight: 19, flexShrink: 1 },
  muted: { fontSize: 11, lineHeight: 16 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 2 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, minHeight: 36, justifyContent: 'center' },
  chipText: { fontSize: 12, lineHeight: 17 },
  note: { flexDirection: 'row', gap: 8, borderRadius: 16, padding: 12 },
  dock: { borderTopWidth: 1, paddingHorizontal: 16, paddingVertical: 12, gap: 6 },
  summary: { borderRadius: 16, padding: 12, gap: 2 },
});

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
function ResultIcon({ tone, size = 30 }: { tone: 'success' | 'warning' | 'info' | 'danger'; size?: number }) {
  const color = TONE[tone].fg;
  const stroke = { stroke: color, strokeWidth: 2, fill: 'none' as const, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return <Svg width={size} height={size} viewBox="0 0 24 24">
    {tone === 'success' ? <><Circle {...stroke} cx={12} cy={12} r={9} /><Path {...stroke} d="m8.5 12.5 2.5 2.5 4.5-5" /></>
      : tone === 'danger' ? <><Circle {...stroke} cx={12} cy={12} r={9} /><Path {...stroke} d="m9 9 6 6M15 9l-6 6" /></>
        : <><Path {...stroke} d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><Path {...stroke} d="M12 9v4M12 17h.01" /></>}
  </Svg>;
}

function CertificateIcon({ color, size = 22 }: { color: string; size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x={4} y={3} width={16} height={13} rx={2} stroke={color} strokeWidth={2} />
    <Path d="M8 8h8M8 11.5h5M9 16l-1 5 4-2 4 2-1-5" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>;
}

/** สีตามผลตรวจแบบ design: พื้นอ่อน + ขอบเข้ม */
const TONE = {
  success: { fg: '#10b981', bg: 'rgba(16, 185, 129, 0.1)', border: 'rgba(16, 185, 129, 0.5)' },
  warning: { fg: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.5)' },
  info: { fg: '#f97316', bg: 'rgba(249, 115, 22, 0.1)', border: 'rgba(249, 115, 22, 0.5)' },
  danger: { fg: '#f43f5e', bg: 'rgba(244, 63, 94, 0.1)', border: 'rgba(244, 63, 94, 0.5)' },
} as const;

function formatThaiDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('th-TH');
}

export function CertificateSheet({ certificate, outcome, enabled, visible, onClose, inspectedAt = null }: {
  certificate: CertificateData | null; outcome: InspectionOutcome; enabled: boolean; visible: boolean; onClose(): void;
  /** เวลาตรวจจริงจากผลตรวจ (ไม่ใช้วันออกใบรับรองแทน) */
  inspectedAt?: string | null;
}) {
  const theme = useTheme();
  const muted = theme.background === '#0c0e14' ? '#64748b' : '#94a3b8';
  const eligible = outcome === 'PASS' || outcome === 'MINOR_ISSUE';
  const publicReady = enabled && certificate && (() => {
    try {
      const url = new URL(certificate.publicUrl);
      return url.protocol === 'https:' || (__DEV__ && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname));
    } catch { return false; }
  })();
  // บนเว็บที่ไม่มี Web Share ปุ่มแชร์จะกดแล้วไม่เกิดอะไร จึงไม่แสดง
  const canShare = Platform.OS !== 'web' || (typeof navigator !== 'undefined' && typeof navigator.share === 'function');

  const handleShare = () => {
    if (certificate?.publicUrl) void Share.share({ message: certificate.publicUrl, url: certificate.publicUrl }).catch(() => undefined);
  };
  const inspectedDate = formatThaiDate(inspectedAt);
  const issuedDate = formatThaiDate(certificate?.issuedAt);
  const tone = TONE[outcomes[outcome].tone];

  return <ConfirmationSheet visible={visible} title="ใบรับรองผลการตรวจ" onClose={onClose}>
    {certificate?.status === 'REVOKED' ? <View style={{ gap: 12 }}>
      <View style={[certStyles.revoked]}>
        <ResultIcon tone="danger" />
        <ThemedText style={[certStyles.revokedTitle]}>ใบรับรองนี้ถูกเพิกถอน</ThemedText>
        <ThemedText style={[certStyles.number, { color: muted }]}>{certificate.number}</ThemedText>
        <ThemedText style={[certStyles.caption, { color: theme.textSecondary }]}>
          ไม่สามารถใช้ใบรับรองนี้เพื่อยืนยันผลการตรวจได้ ผลตรวจเดิมและการตัดสินใจของผู้ซื้อยังคงเดิม
        </ThemedText>
      </View>
      {publicReady && <Button label="เปิดใบรับรองสาธารณะ" onPress={() => { void Linking.openURL(certificate.publicUrl); }} />}
    </View> : eligible && certificate ? (
      <View style={{ gap: 12 }}>
        <View style={[certStyles.paper, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={certStyles.brandRow}>
            <BrandIcon size={26} />
            <ThemedText style={[certStyles.brandText, { color: theme.text }]}>2NDHAND</ThemedText>
          </View>
          <ThemedText style={certStyles.kicker}>ใบรับรองการตรวจสอบสินค้า</ThemedText>
          <ThemedText selectable style={[certStyles.number, { color: muted }]}>{certificate.number}</ThemedText>

          <View style={[certStyles.seal, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
            <CertificateIcon color="#10b981" size={36} />
          </View>
          <View style={[certStyles.outcomePill, { backgroundColor: tone.bg, borderColor: tone.border }]}>
            <ThemedText style={[certStyles.outcomeText, { color: tone.fg }]}>{outcomes[outcome].label}</ThemedText>
          </View>

          {publicReady ? (
            <View style={{ alignItems: 'center', gap: 6, marginTop: 8 }}>
              <View style={certStyles.qrBox}>
                {certificate.qrSource ? (
                  <Image source={certificate.qrSource} style={{ width: 150, height: 150 }} contentFit="contain" accessibilityLabel="QR เปิดใบรับรองสาธารณะ" />
                ) : <CertificateQr url={certificate.publicUrl} />}
              </View>
              <ThemedText style={[certStyles.caption, { color: muted }]}>
                สแกน QR หรือเปิดลิงก์นี้เพื่อตรวจสอบใบรับรองได้โดยไม่ต้องเข้าสู่ระบบ
              </ThemedText>
            </View>
          ) : (
            <ThemedText style={[certStyles.caption, { color: theme.textSecondary, marginTop: 8 }]}>หน้าใบรับรองสาธารณะยังไม่พร้อมใช้งาน</ThemedText>
          )}

          <View style={certStyles.dateGrid}>
            {inspectedDate ? <View style={[certStyles.dateCell, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText style={[certStyles.dateLabel, { color: muted }]}>ตรวจเมื่อ</ThemedText>
              <ThemedText style={[certStyles.dateValue, { color: theme.text }]}>{inspectedDate}</ThemedText>
            </View> : null}
            {issuedDate ? <View style={[certStyles.dateCell, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText style={[certStyles.dateLabel, { color: muted }]}>ออกใบรับรอง</ThemedText>
              <ThemedText style={[certStyles.dateValue, { color: theme.text }]}>{issuedDate}</ThemedText>
            </View> : null}
          </View>

          <ThemedText style={certStyles.valid}>● ใช้งานได้</ThemedText>
          <ThemedText style={[certStyles.caption, { color: muted }]}>รับรองผลการตรวจ ณ วันที่ออกตามรายงาน</ThemedText>
        </View>

        {publicReady ? <>
          <ThemedText style={[certStyles.caption, { color: muted }]} selectable numberOfLines={2}>{certificate.publicUrl}</ThemedText>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Button label="เปิดใบรับรองสาธารณะ" onPress={() => { void Linking.openURL(certificate.publicUrl); }} /></View>
            {canShare ? <View style={{ flex: 1 }}><Button label="แชร์ลิงก์ใบรับรอง" variant="primary" onPress={handleShare} /></View> : null}
          </View>
        </> : null}
      </View>
    ) : (
      <ThemedText>ไม่มีใบรับรองสำหรับผลการตรวจนี้</ThemedText>
    )}
  </ConfirmationSheet>;
}

const certStyles = StyleSheet.create({
  paper: { borderWidth: 1, borderRadius: 16, padding: 20, alignItems: 'center', gap: 4 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandText: { fontSize: 14, lineHeight: 20, fontWeight: '800', letterSpacing: 0.8 },
  kicker: { marginTop: 6, fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 1.6, color: '#10b981' },
  number: { fontFamily: 'monospace', fontSize: 11, lineHeight: 16, textAlign: 'center' },
  seal: { width: 72, height: 72, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  outcomePill: { marginTop: 8, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  outcomeText: { fontSize: 11, lineHeight: 16, fontWeight: '700' },
  qrBox: { backgroundColor: '#ffffff', borderRadius: 12, padding: 8 },
  caption: { fontSize: 10, lineHeight: 15, textAlign: 'center' },
  dateGrid: { flexDirection: 'row', gap: 8, alignSelf: 'stretch', marginTop: 12 },
  dateCell: { flex: 1, borderRadius: 12, padding: 10 },
  dateLabel: { fontSize: 11, lineHeight: 16 },
  dateValue: { fontSize: 11, lineHeight: 16, fontWeight: '700' },
  valid: { marginTop: 10, fontSize: 12, lineHeight: 18, fontWeight: '700', color: '#10b981' },
  revoked: { alignItems: 'center', gap: 6, padding: 20, borderRadius: 16, borderWidth: 2, borderColor: 'rgba(244, 63, 94, 0.5)', backgroundColor: 'rgba(244, 63, 94, 0.1)' },
  revokedTitle: { fontSize: 16, lineHeight: 24, fontWeight: '800', color: '#f43f5e' },
});

/** แยก "หัวข้อ: ค่า" ต่อบรรทัดจากสรุปของผู้ตรวจเพื่อแสดงเป็นแถว ถ้ารูปแบบไม่ตรงก็แสดงข้อความเดิม */
function summaryRows(summary: string): { label: string; value: string }[] | null {
  const lines = summary.split('\n').map(line => line.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  const rows = lines.map(line => {
    const at = line.indexOf(': ');
    return at > 0 && at < 40 ? { label: line.slice(0, at), value: line.slice(at + 2) } : null;
  });
  return rows.every(Boolean) ? rows as { label: string; value: string }[] : null;
}

export function BuyerResultView({ outcome, summary, inspectedAt, photos = [], certificate = null, nextAction, recordedDecision = null,
  certificatePublicHtml = false, certificateDecision = false, canDecide = false, busy, error, onDecision,
  decisionDeadline = null, serverTime = null, timedOutAt = null, policy = null, onDeadlineReached, errorAction }: {
  outcome: InspectionOutcome; summary: string; inspectedAt: string; photos?: InspectionPhoto[];
  certificate?: CertificateData | null; nextAction: 'WAIT_BUYER_DECISION' | 'RETURN_TO_SELLER' | 'SHIP_TO_BUYER' | null;
  recordedDecision?: BuyerDecisionData | null;
  certificatePublicHtml?: boolean; certificateDecision?: boolean; canDecide?: boolean; busy?: boolean; error?: string;
  onDecision?(decision: 'CONFIRM' | 'REJECT', reason?: string | null): void;
  /** Server result window (EXTERNAL_V2). Informative countdown only; the server decides eligibility. */
  decisionDeadline?: string | null; serverTime?: string | null; timedOutAt?: string | null;
  policy?: 'EXTERNAL_V2' | 'LEGACY_V1' | null; onDeadlineReached?(): void; errorAction?: ReactNode;
}) {
  const theme = useTheme();
  const info = outcomes[outcome];
  const [showCertificate, setCertificate] = useState(false);
  const [photo, setPhoto] = useState<InspectionPhoto | null>(null);
  const [decision, setDecision] = useState<'CONFIRM' | 'REJECT' | null>(null);
  const [reason, setReason] = useState('');
  const validReason = [...reason.trim()].length <= 500;
  const positive = outcome === 'PASS' || outcome === 'MINOR_ISSUE';
  const rows = summaryRows(summary);
  const allowed = positive && !!certificate && certificate.status !== 'REVOKED' && certificateDecision && canDecide && nextAction === 'WAIT_BUYER_DECISION' && !!onDecision;
  const nextActionLabel = timedOutAt
    ? 'หมดเวลาตัดสินใจ ระบบจะดำเนินการส่งคืนผู้ขาย ไม่มีการยอมรับผลตรวจแทนคุณ'
    : nextAction === 'RETURN_TO_SELLER'
    ? (positive ? 'ขั้นตอนถัดไปคือส่งสินค้าคืนผู้ขาย ติดตามความคืบหน้าจากคำสั่งซื้อ' : 'ผลตรวจไม่ผ่าน สินค้าจะถูกส่งคืนผู้ขาย และคืนเงินเต็มจำนวนตามนโยบายหลังผู้ขายรับคืนจริง')
    : nextAction === 'SHIP_TO_BUYER'
      ? 'ขั้นตอนถัดไปคือจัดส่งสินค้าไปยังผู้ซื้อ การยอมรับผลตรวจยังไม่ใช่การยืนยันว่าได้รับสินค้าแล้ว'
      : nextAction === 'WAIT_BUYER_DECISION'
        ? (decisionDeadline
          ? 'โปรดยอมรับหรือปฏิเสธผลตรวจภายในเวลาที่แสดง หากไม่ตอบ ระบบจะเปลี่ยนเป็นขั้นตอนส่งคืนผู้ขาย'
          : 'โปรดอ่านรายงานและหลักฐานก่อนตัดสินใจเกี่ยวกับผลตรวจ')
        : 'ยังไม่มีข้อมูลขั้นตอนถัดไปจากระบบ';
  return <View style={{ gap: 16 }}>
    {/* ผลตรวจหลักแบบ design: กล่องขอบสีตามผล ไม่ใช้ mascot */}
    <View style={[resultStyles.hero, { backgroundColor: TONE[info.tone].bg, borderColor: TONE[info.tone].border }]}>
      <ResultIcon tone={info.tone} />
      <ThemedText style={[resultStyles.heroTitle, { color: TONE[info.tone].fg }]}>{info.label}</ThemedText>
      <ThemedText style={[resultStyles.heroMeta, { color: TONE[info.tone].fg }]}>
        ตรวจเมื่อ {new Date(inspectedAt).toLocaleString('th-TH')} · ศูนย์ตรวจสอบ 2NDHAND
      </ThemedText>
    </View>

    <View style={[resultStyles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <ThemedText style={[resultStyles.cardTitle, { color: theme.text }]}>รายงานการตรวจ</ThemedText>
      {rows ? rows.map((row, index) => (
        <View key={`${row.label}-${index}`} style={[resultStyles.checkRow, index > 0 && { borderTopWidth: 1, borderTopColor: 'rgba(100, 116, 139, 0.15)' }]}>
          <ThemedText style={[resultStyles.checkLabel, { color: theme.textSecondary }]}>{row.label}</ThemedText>
          <ThemedText style={[resultStyles.checkValue, { color: theme.text }]}>{row.value}</ThemedText>
        </View>
      )) : <ThemedText style={[resultStyles.body, { color: theme.textSecondary }]}>{summary}</ThemedText>}
      {photos.length > 0 ? <View style={resultStyles.photos}>
        {photos.map(item => (
          <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`ขยาย${item.label}`} onPress={() => setPhoto(item)}>
            <Image cachePolicy="none" source={item.source} style={resultStyles.photo} accessibilityLabel={item.label} />
          </Pressable>
        ))}
      </View> : null}
    </View>

    {positive && certificate && (
      <Pressable accessibilityRole="button" accessibilityLabel="ดูใบรับรองผลการตรวจ" onPress={() => setCertificate(true)}
        style={({ pressed }) => [resultStyles.card, resultStyles.certRow, { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.85 : 1 }]}>
        <CertificateIcon color={certificate.status === 'REVOKED' ? '#f43f5e' : '#10b981'} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <ThemedText numberOfLines={1} style={[resultStyles.certTitle, { color: theme.text }]}>ใบรับรอง {certificate.number}</ThemedText>
          {certificate.status === 'REVOKED'
            ? <ThemedText accessibilityRole="alert" style={[resultStyles.certSub, { color: '#f43f5e' }]}>ใบรับรองนี้ถูกเพิกถอน</ThemedText>
            : <ThemedText style={[resultStyles.certSub, { color: theme.textSecondary }]}>{`ระบุผล "${info.label}" · แตะเพื่อดูและสแกน QR`}</ThemedText>}
        </View>
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none"><Path d="M9 5l7 7-7 7" stroke={theme.textSecondary} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
      </Pressable>
    )}

    {nextAction === 'WAIT_BUYER_DECISION' && positive && !timedOutAt && (
      <View style={[resultStyles.card, { backgroundColor: TONE.warning.bg, borderColor: 'rgba(245, 158, 11, 0.3)' }]}>
        <ThemedText style={[resultStyles.body, { color: theme.text, fontWeight: '700' }]}>กรุณาเลือกยอมรับหรือปฏิเสธผลตรวจ การยอมรับผลตรวจยังไม่ใช่การยืนยันรับสินค้า</ThemedText>
        {decisionDeadline ? <ServerDeadline label="เวลาตัดสินผลตรวจ" deadline={decisionDeadline} serverTime={serverTime}
          passedText="หมดเวลาตัดสินใจ ระบบจะดำเนินการส่งคืนผู้ขาย" onReached={onDeadlineReached} /> : null}
      </View>
    )}
    {!positive && (
      <View testID="negative-result-return" style={[resultStyles.card, { backgroundColor: theme.backgroundElement, borderColor: 'rgba(100, 116, 139, 0.25)' }]}>
        <ThemedText style={[resultStyles.cardTitle, { color: theme.text }]}>ขั้นตอนถัดไป</ThemedText>
        <ThemedText style={[resultStyles.body, { color: theme.textSecondary }]}>ผลตรวจนี้ไม่มีใบรับรองและไม่เปิดให้ยอมรับผลตรวจ สินค้าจะถูกส่งคืนผู้ขาย และคืนเงินเต็มจำนวนตามนโยบายหลังผู้ขายรับคืนจริง</ThemedText>
      </View>
    )}

    {/* Status feedback card when rejected or accepted */}
    {recordedDecision && (
      <View style={{
        padding: 16,
        borderRadius: 16,
        backgroundColor: recordedDecision.decision === 'REJECT' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 185, 129, 0.08)',
        borderWidth: 1,
        borderColor: recordedDecision.decision === 'REJECT' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)',
        gap: 6,
      }}>
        <ThemedText type="smallBold" style={{ fontSize: 14, color: recordedDecision.decision === 'REJECT' ? '#DC2626' : '#059669' }}>
          {recordedDecision.decision === 'CONFIRM' ? 'บันทึกคำตัดสิน: ยอมรับผลการตรวจ' : 'บันทึกคำตัดสิน: ปฏิเสธผลการตรวจและส่งคืน'}
        </ThemedText>
        {recordedDecision.decision === 'REJECT' ? (
          <ThemedText type="small" themeColor="textSecondary">
            ศูนย์จะส่งสินค้าคืนผู้ขาย การคืนเงินเริ่มหลังผู้ขายยืนยันรับคืนจริง ยอดคืนดูได้ในคำสั่งซื้อ
          </ThemedText>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">ศูนย์จะจัดส่งสินค้าถึงคุณ การยอมรับผลตรวจยังไม่ใช่การยืนยันว่าได้รับสินค้า</ThemedText>
        )}
        {recordedDecision.decision === 'REJECT' && recordedDecision.reason && (
          <ThemedText type="small" themeColor="textSecondary">
            เหตุผล: {recordedDecision.reason}
          </ThemedText>
        )}
        <ThemedText style={{ fontSize: 10.5, lineHeight: 15, color: '#64748B' }}>
          บันทึกเมื่อ {new Date(recordedDecision.decidedAt).toLocaleString('th-TH')}
        </ThemedText>
      </View>
    )}

    {positive || !!error || !!errorAction ? <View style={[resultStyles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {positive ? <>
        <ThemedText style={[resultStyles.cardTitle, { color: theme.text }]}>ขั้นตอนถัดไป</ThemedText>
        <ThemedText style={[resultStyles.body, { color: theme.textSecondary }]}>{nextActionLabel}</ThemedText>
      </> : null}
      {allowed ? (
        <View style={{ gap: 8, marginTop: 4 }}>
          <Button label="ยอมรับผลการตรวจ" variant="primary" busy={busy} onPress={() => setDecision('CONFIRM')} />
          <Pressable accessibilityRole="button" accessibilityLabel="ปฏิเสธผลการตรวจและส่งคืน" disabled={busy}
            onPress={() => { setReason(''); setDecision('REJECT'); }}
            style={({ pressed }) => [resultStyles.rejectButton, { opacity: busy ? 0.5 : pressed ? 0.8 : 1 }]}>
            <ThemedText style={resultStyles.rejectText}>ปฏิเสธผลการตรวจและส่งคืน</ThemedText>
          </Pressable>
        </View>
      ) : positive && !recordedDecision && !timedOutAt && (
        <ThemedText style={[resultStyles.body, { color: theme.textSecondary }]}>ระบบไม่เปิดให้ตัดสินผลตรวจสำหรับรายการนี้แล้ว โหลดสถานะล่าสุดเพื่อดูขั้นตอนถัดไป</ThemedText>
      )}
      {!!error && <ThemedText accessibilityRole="alert" style={{ color: theme.danger, fontSize: 12 }}>{error}</ThemedText>}
      {errorAction}
    </View> : null}

    <CertificateSheet certificate={positive ? certificate : null} outcome={outcome} enabled={certificatePublicHtml} visible={showCertificate && positive}
      inspectedAt={inspectedAt} onClose={() => setCertificate(false)} />
    <ImageViewer source={photo?.source} label={photo?.label ?? 'หลักฐานการตรวจ'} onClose={() => setPhoto(null)} />

    {/* Confirmation Sheet for PASS / MINOR_ISSUE */}
    <ConfirmationSheet visible={!!decision && allowed} title="ยืนยันการตัดสินผลตรวจ" onClose={() => setDecision(null)}>
      <ThemedText>การตัดสินใจนี้เกี่ยวกับผลตรวจเท่านั้น ไม่ใช่การยืนยันรับสินค้า</ThemedText>
      {decision === 'CONFIRM' && (
        <ThemedText type="small" themeColor="textSecondary">
          ศูนย์จะจัดส่งสินค้าถึงคุณหลังบันทึกการยอมรับ · ยอมรับแล้วเปลี่ยนใจไม่ได้
        </ThemedText>
      )}
      {decision === 'REJECT' && (
        <View style={{ gap: 8 }}>
          <ThemedText type="small" style={{ color: theme.danger }}>
            {policy === 'EXTERNAL_V2'
              ? 'สินค้าจะถูกส่งคืนผู้ขาย หลังผู้ขายรับคืนจริงจะคืนเฉพาะค่าสินค้า ไม่คืนค่าตรวจและค่าจัดส่ง · ปฏิเสธแล้วเปลี่ยนใจไม่ได้'
              : 'สินค้าจะถูกส่งคืนผู้ขาย การคืนเงินเป็นไปตามนโยบายเดิมของคำสั่งซื้อนี้ · ปฏิเสธแล้วเปลี่ยนใจไม่ได้'}
          </ThemedText>
          <TextField
            label="เหตุผลที่ปฏิเสธ (ไม่บังคับ)"
            value={reason}
            onChangeText={setReason}
            multiline
            editable={!busy}
            error={!validReason ? 'เหตุผลต้องไม่เกิน 500 ตัวอักษร' : undefined}
          />
        </View>
      )}
      <Button
        label={decision === 'CONFIRM' ? 'ยืนยันยอมรับผลการตรวจ' : 'ยืนยันปฏิเสธผลการตรวจและส่งคืน'}
        variant="primary"
        disabled={decision === 'REJECT' && !validReason}
        busy={busy}
        onPress={() => {
          if (decision && allowed && (decision !== 'REJECT' || validReason)) {
            if (decision === 'REJECT') onDecision?.(decision, reason.trim() || null);
            else onDecision?.(decision);
            setDecision(null);
          }
        }}
      />
    </ConfirmationSheet>

  </View>;
}
const resultStyles = StyleSheet.create({
  hero: { borderWidth: 2, borderRadius: 16, padding: 16, alignItems: 'center', gap: 4 },
  heroTitle: { fontSize: 18, lineHeight: 26, fontWeight: '800', textAlign: 'center', marginTop: 4 },
  heroMeta: { fontSize: 11, lineHeight: 16, opacity: 0.8, textAlign: 'center' },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 8 },
  cardTitle: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  body: { fontSize: 12, lineHeight: 19 },
  checkRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 8 },
  checkLabel: { fontSize: 12, lineHeight: 17 },
  checkValue: { flexShrink: 1, fontSize: 12, lineHeight: 17, fontWeight: '700', textAlign: 'right' },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  photo: { width: 64, height: 64, borderRadius: 12 },
  certRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  certTitle: { fontSize: 12, lineHeight: 18, fontWeight: '700' },
  certSub: { fontSize: 10.5, lineHeight: 15 },
  rejectButton: { minHeight: 48, borderRadius: 12, borderWidth: 2, borderColor: 'rgba(244, 63, 94, 0.6)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  rejectText: { fontSize: 14, fontWeight: '700', color: '#f43f5e', textAlign: 'center' },
});

export function OrderTimeline({ events }: { events: { label: string; at: string; detail?: ReactNode }[] }) {
  const theme = useTheme();
  return <Card><ThemedText type="subtitle">ความคืบหน้าคำสั่งซื้อ</ThemedText>{events.map((event, index) => <View key={`${event.label}-${index}`} style={{ flexDirection: 'row', gap: 12 }}>
    <View style={{ width: 14, alignItems: 'center' }}><View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: theme.accent, marginTop: 5 }} />{index < events.length - 1 && <View style={{ width: 2, flex: 1, backgroundColor: theme.border }} />}</View>
    <View style={{ flex: 1, paddingBottom: 16, gap: 4 }}><ThemedText type="smallBold">{event.label}</ThemedText><ThemedText type="small" themeColor="textSecondary">{new Date(event.at).toLocaleString('th-TH')}</ThemedText>{event.detail}</View>
  </View>)}</Card>;
}
