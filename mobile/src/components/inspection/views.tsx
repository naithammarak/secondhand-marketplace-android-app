/** Presentational boundary for INSPECT #95 / CERT #100. No network or mock data.
 * Integration must supply owner-authorized data and idempotent mutation callbacks.
 */
import { useState, type ReactNode } from 'react';
import { Linking, Pressable, Share, View } from 'react-native';
import { Image, type ImageSource } from 'expo-image';
import { useTheme } from '@/hooks/use-theme';
import { Button, Card, Loading, Row } from '../order-ui';
import { ThemedText } from '../themed-text';
import { WondeeMascot, type MascotVariant } from '../wondee/brand';
import { ConfirmationSheet, EmptyState, ImageViewer, TextField } from '../wondee/primitives';
import { ServerDeadline } from '../wondee/status';

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
export function SellerShipView({ orderId, productName, paidAt, busy = false, error, onSubmit, children }: {
  orderId: number; productName: string; paidAt?: string | null; busy?: boolean; error?: string | null; children?: ReactNode;
  onSubmit?: (data: { carrier: string; tracking_number: string }) => void;
}) {
  const theme = useTheme();
  const [carrier, setCarrier] = useState('');
  const [tracking, setTracking] = useState('');
  const [attempted, setAttempted] = useState(false);
  const valid = [...carrier.trim()].length >= 1 && [...carrier.trim()].length <= 100 && [...tracking.trim()].length >= 1 && [...tracking.trim()].length <= 100;
  return (
    <View style={{ gap: 16 }}>
      <Card>
        <View style={{ alignItems: 'center', gap: 12 }}>
          <WondeeMascot size={96} variant="courier" />
          <ThemedText type="title">ส่งสินค้าเข้าศูนย์ตรวจ</ThemedText>
        </View>
        <ThemedText>คำสั่งซื้อ #{orderId} · {productName}</ThemedText>
        <ThemedText themeColor="textSecondary">
          แพ็กสินค้าให้เหมาะสมและเก็บหลักฐานการจัดส่ง ระบุผู้ขนส่งและเลขติดตามจากพัสดุจริง
        </ThemedText>
      </Card>

      {/* 3-day countdown banner */}
      <View style={{
        padding: 16,
        borderRadius: 16,
        backgroundColor: theme.warningSoft ?? '#fef3c7',
        borderWidth: 1,
        borderColor: theme.warning,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <View style={{ flex: 1 }}>
          <ThemedText type="smallBold">ต้องส่งสินค้าภายใน</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">72 ชั่วโมงหลังผู้ซื้อชำระเงิน{paidAt ? ` (ชำระเมื่อ ${new Date(paidAt).toLocaleString('th-TH')})` : ''} ถ้าไม่ส่งตามกำหนด ระบบจะคืนเงินผู้ซื้อเต็มจำนวน</ThemedText>
        </View>
      </View>

      {/* Inspection center address */}
      <Card>
        <ThemedText type="subtitle">ส่งไปที่</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={{ lineHeight: 20 }}>
          ศูนย์ตรวจสอบ 2NDHAND ตามที่อยู่ที่ผู้ดูแลเดโมแจ้ง (ระบบยังไม่มีข้อมูลที่อยู่ศูนย์ให้แสดงในแอป)
        </ThemedText>
      </Card>

      {/* Packaging instructions */}
      <Card>
        <ThemedText type="subtitle">วิธีแพ็กสินค้า</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">📦 ใส่กล่องแข็ง กันกระแทกรอบด้าน</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">🏷️ เขียนเลขคำสั่งซื้อ <ThemedText type="smallBold">#{orderId}</ThemedText> ข้างกล่อง</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">🚫 อย่าใส่ของอื่นที่ไม่ได้ลงประกาศ</ThemedText>
      </Card>

      {children}

      {/* Carrier and tracking form */}
      <Card>
        <ThemedText type="subtitle">ระบุข้อมูลการจัดส่ง</ThemedText>
        <TextField
          label="ผู้ให้บริการขนส่ง"
          value={carrier}
          onChangeText={setCarrier}
          placeholder="ชื่อบริการขนส่งที่ใช้จริง (ระบุได้ทุกบริการ)"
          editable={!busy}
          error={attempted && !valid ? 'ทั้งสองช่องต้องมี 1–100 ตัวอักษร' : undefined}
        />
        <TextField
          label="เลขติดตามพัสดุ"
          value={tracking}
          onChangeText={setTracking}
          placeholder="เลขจากใบรับพัสดุ"
          editable={!busy}
          error={attempted && !valid ? 'กรุณาตรวจสอบข้อมูล ทั้งสองช่องต้องมี 1–100 ตัวอักษร' : undefined}
        />
        {!!error && <ThemedText accessibilityRole="alert" style={{ color: theme.danger }}>{error}</ThemedText>}
        <Button
          label="ยืนยันการจัดส่งเข้าศูนย์"
          variant="primary"
          disabled={!onSubmit}
          busy={busy}
          onPress={() => {
            setAttempted(true);
            // Server accepts any carrier/tracking text trimmed to 1–100 characters; no format normalization.
            if (valid) onSubmit?.({ carrier: carrier.trim(), tracking_number: tracking.trim() });
          }}
        />
        {!onSubmit && <ThemedText type="small" themeColor="textSecondary">บันทึกที่อยู่รับคืนก่อน จึงแจ้งส่งสินค้าเข้าศูนย์ได้</ThemedText>}
      </Card>

      {/* Escrow protection note */}
      <View style={{
        padding: 12,
        borderRadius: 14,
        backgroundColor: theme.backgroundElement,
        borderWidth: 1,
        borderColor: theme.border,
      }}>
        <ThemedText type="small" themeColor="textSecondary" style={{ lineHeight: 18 }}>
          ℹ️ ศูนย์จะตรวจความแท้ สภาพ และความตรงกับประกาศ ก่อนส่งต่อให้ผู้ซื้อ · เงินของผู้ซื้อพักไว้ที่ระบบจนกว่าผู้ซื้อจะได้รับสินค้า
        </ThemedText>
      </View>
    </View>
  );
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
  const theme = useTheme();
  const eligible = outcome === 'PASS' || outcome === 'MINOR_ISSUE';
  const publicReady = enabled && certificate && (() => {
    try {
      const url = new URL(certificate.publicUrl);
      return url.protocol === 'https:' || (__DEV__ && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname));
    } catch { return false; }
  })();

  const handleShare = () => {
    if (certificate?.publicUrl) void Share.share({ message: certificate.publicUrl, url: certificate.publicUrl }).catch(() => undefined);
  };

  return <ConfirmationSheet visible={visible} title="ใบรับรองผลการตรวจ" onClose={onClose}>
    {certificate?.status === 'REVOKED' ? <View style={{ gap: 12 }}>
      <ThemedText type="subtitle" style={{ color: theme.danger }}>ใบรับรองนี้ถูกเพิกถอน</ThemedText>
      <ThemedText>{certificate.number}</ThemedText>
      <ThemedText>ไม่สามารถใช้ใบรับรองนี้เพื่อยืนยันผลการตรวจได้ ผลตรวจเดิมและการตัดสินใจของผู้ซื้อยังคงเดิม</ThemedText>
      {publicReady && <Button label="เปิดใบรับรองสาธารณะ" onPress={() => { void Linking.openURL(certificate.publicUrl); }} />}
    </View> : eligible && certificate ? (
      <View style={{ gap: 14 }}>
        {/* Receipt paper card style container */}
        <View style={{
          padding: 16,
          borderRadius: 16,
          backgroundColor: theme.backgroundElement,
          borderWidth: 1,
          borderColor: theme.border,
          alignItems: 'center',
          gap: 8,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: '#059669', alignItems: 'center', justifyContent: 'center' }}>
              <ThemedText style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>2N</ThemedText>
            </View>
            <ThemedText style={{ fontWeight: '800', letterSpacing: 1 }}>2NDHAND</ThemedText>
          </View>

          <ThemedText style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.5, color: '#059669', textTransform: 'uppercase' }}>
            ใบรับรองการตรวจสอบสินค้า
          </ThemedText>
          <ThemedText type="title" style={{ fontFamily: 'monospace' }}>{certificate.number}</ThemedText>

          <View style={{ alignItems: 'center', marginVertical: 4 }}>
            <WondeeMascot size={80} variant="seal" />
          </View>

          <View style={{
            paddingHorizontal: 12,
            paddingVertical: 4,
            borderRadius: 12,
            backgroundColor: 'rgba(16, 185, 129, 0.12)',
            borderWidth: 1,
            borderColor: '#10B981',
          }}>
            <ThemedText type="smallBold" style={{ color: '#059669' }}>
              {outcomes[outcome].label}
            </ThemedText>
          </View>

          <View style={{ flexDirection: 'row', width: '100%', gap: 8, marginTop: 6 }}>
            <View style={{ flex: 1, padding: 8, borderRadius: 10, backgroundColor: theme.surface }}>
              <ThemedText type="small" themeColor="textSecondary">ตรวจเมื่อ</ThemedText>
              <ThemedText type="smallBold">{new Date(certificate.issuedAt).toLocaleDateString('th-TH')}</ThemedText>
            </View>
            <View style={{ flex: 1, padding: 8, borderRadius: 10, backgroundColor: theme.surface }}>
              <ThemedText type="small" themeColor="textSecondary">ออกใบรับรอง</ThemedText>
              <ThemedText type="smallBold">{new Date(certificate.issuedAt).toLocaleDateString('th-TH')}</ThemedText>
            </View>
          </View>

          <ThemedText type="smallBold" style={{ color: '#059669', marginTop: 4 }}>
            ● ใช้งานได้
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
            รับรองผลการตรวจ ณ วันที่ออกตามรายงาน
          </ThemedText>
        </View>

        {publicReady ? (
          <View style={{ alignItems: 'center', gap: 8 }}>
            {certificate.qrSource ? (
              <Image source={certificate.qrSource} style={{ width: 160, height: 160, alignSelf: 'center' }} contentFit="contain" accessibilityLabel="QR เปิดใบรับรองสาธารณะ" />
            ) : null}
            <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }} selectable>{certificate.publicUrl}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
              เปิดลิงก์นี้เพื่อตรวจสอบใบรับรองได้โดยไม่ต้องเข้าสู่ระบบ
            </ThemedText>
            <Button label="เปิดใบรับรองสาธารณะ" onPress={() => { void Linking.openURL(certificate.publicUrl); }} />
            <Button label="แชร์ลิงก์ใบรับรอง" onPress={handleShare} />
          </View>
        ) : (
          <ThemedText style={{ textAlign: 'center' }}>หน้าใบรับรองสาธารณะยังไม่พร้อมใช้งาน</ThemedText>
        )}
      </View>
    ) : (
      <ThemedText>ไม่มีใบรับรองสำหรับผลการตรวจนี้</ThemedText>
    )}
  </ConfirmationSheet>;
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
    <Card>
      <View style={{ alignItems: 'center', gap: 12 }}>
        <WondeeMascot size={96} variant={info.variant} />
        <ThemedText type="title" style={{ color: theme[info.tone], textAlign: 'center' }}>
          {info.label}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          ตรวจเมื่อ {new Date(inspectedAt).toLocaleString('th-TH')} · ศูนย์ตรวจสอบ 2NDHAND
        </ThemedText>
      </View>
    </Card>

    <Card>
      <ThemedText type="subtitle">รายงานการตรวจ</ThemedText>
      <ThemedText>{summary}</ThemedText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 }}>
        {photos.map(item => (
          <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`ขยาย${item.label}`} onPress={() => setPhoto(item)}>
            <Image cachePolicy="none" source={item.source} style={{ width: 96, height: 96, borderRadius: 12 }} accessibilityLabel={item.label} />
          </Pressable>
        ))}
      </View>
    </Card>

    {positive && certificate && (
      <Card>
        {certificate.status === 'REVOKED' && <ThemedText accessibilityRole="alert" style={{ color: theme.danger }}>ใบรับรองนี้ถูกเพิกถอน</ThemedText>}
        <Button label="ดูใบรับรองผลการตรวจ" onPress={() => setCertificate(true)} />
      </Card>
    )}

    {nextAction === 'WAIT_BUYER_DECISION' && positive && !timedOutAt && (
      <Card>
        <ThemedText>กรุณาเลือกยอมรับหรือปฏิเสธผลตรวจ การยอมรับผลตรวจยังไม่ใช่การยืนยันรับสินค้า</ThemedText>
        {decisionDeadline ? <ServerDeadline label="เวลาตัดสินผลตรวจ" deadline={decisionDeadline} serverTime={serverTime}
          passedText="หมดเวลาตัดสินใจ ระบบจะดำเนินการส่งคืนผู้ขาย" onReached={onDeadlineReached} /> : null}
      </Card>
    )}
    {!positive && (
      <Card testID="negative-result-return"><ThemedText>ผลตรวจนี้ไม่มีใบรับรองและไม่เปิดให้ยอมรับผลตรวจ สินค้าจะถูกส่งคืนผู้ขาย และคืนเงินเต็มจำนวนตามนโยบายหลังผู้ขายรับคืนจริง</ThemedText></Card>
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
        <ThemedText style={{ fontSize: 10.5, color: '#64748B' }}>
          บันทึกเมื่อ {new Date(recordedDecision.decidedAt).toLocaleString('th-TH')}
        </ThemedText>
      </View>
    )}

    <Card>
      <ThemedText type="subtitle">ขั้นตอนถัดไป</ThemedText>
      <ThemedText>{nextActionLabel}</ThemedText>
      {allowed ? (
        <View style={{ gap: 8, marginTop: 4 }}>
          <Button label="ยอมรับผลการตรวจ" variant="primary" busy={busy} onPress={() => setDecision('CONFIRM')} />
          <Button label="ปฏิเสธผลการตรวจและส่งคืน" busy={busy} onPress={() => { setReason(''); setDecision('REJECT'); }} />
        </View>
      ) : positive && !recordedDecision && !timedOutAt && (
        <ThemedText type="small">ระบบไม่เปิดให้ตัดสินผลตรวจสำหรับรายการนี้แล้ว โหลดสถานะล่าสุดเพื่อดูขั้นตอนถัดไป</ThemedText>
      )}
      {!!error && <ThemedText accessibilityRole="alert" style={{ color: theme.danger }}>{error}</ThemedText>}
      {errorAction}
    </Card>

    <CertificateSheet certificate={positive ? certificate : null} outcome={outcome} enabled={certificatePublicHtml} visible={showCertificate && positive} onClose={() => setCertificate(false)} />
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
export function OrderTimeline({ events }: { events: { label: string; at: string; detail?: ReactNode }[] }) {
  const theme = useTheme();
  return <Card><ThemedText type="subtitle">ความคืบหน้าคำสั่งซื้อ</ThemedText>{events.map((event, index) => <View key={`${event.label}-${index}`} style={{ flexDirection: 'row', gap: 12 }}>
    <View style={{ width: 14, alignItems: 'center' }}><View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: theme.accent, marginTop: 5 }} />{index < events.length - 1 && <View style={{ width: 2, flex: 1, backgroundColor: theme.border }} />}</View>
    <View style={{ flex: 1, paddingBottom: 16, gap: 4 }}><ThemedText type="smallBold">{event.label}</ThemedText><ThemedText type="small" themeColor="textSecondary">{new Date(event.at).toLocaleString('th-TH')}</ThemedText>{event.detail}</View>
  </View>)}</Card>;
}
