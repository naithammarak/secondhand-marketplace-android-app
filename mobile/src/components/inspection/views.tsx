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
export type BuyerDecisionData = { decision: 'CONFIRM' | 'REJECT'; reason: string | null; decidedAt: string };
export function UnavailableInspection({ title = 'บริการตรวจสินค้ายังไม่พร้อมใช้งาน' }: { title?: string }) {
  return <Card><EmptyState title={title} detail="คุณยังดูสถานะคำสั่งซื้อและใบเสร็จที่มีอยู่ได้ กรุณากลับมาตรวจสอบบริการนี้อีกครั้ง" /></Card>;
}
export function SellerShipView({ orderId, productName, deadline, busy = false, error, onSubmit }: {
  orderId: number; productName: string; deadline?: string | null; busy?: boolean; error?: string | null;
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
          <ThemedText type="small" themeColor="textSecondary">ภายใน 3 วันหลังผู้ซื้อชำระเงิน</ThemedText>
        </View>
        <ThemedText style={{ fontSize: 16, fontWeight: '800', color: theme.warning }}>
          {deadline ? new Date(deadline).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : '3 วัน'}
        </ThemedText>
      </View>

      {/* Inspection center address */}
      <Card>
        <ThemedText type="subtitle">ส่งไปที่</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={{ lineHeight: 20 }}>
          ศูนย์ตรวจสอบ 2NDHAND · 99/9 อาคารตรวจสอบ ชั้น 2 ถ.รัชดาภิเษก แขวงดินแดง เขตดินแดง กรุงเทพมหานคร 10400 · โทร 02-000-0000
        </ThemedText>
      </Card>

      {/* Packaging instructions */}
      <Card>
        <ThemedText type="subtitle">วิธีแพ็กสินค้า</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">📦 ใส่กล่องแข็ง กันกระแทกรอบด้าน</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">🏷️ เขียนเลขคำสั่งซื้อ <ThemedText type="smallBold">#{orderId}</ThemedText> ข้างกล่อง</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">🚫 อย่าใส่ของอื่นที่ไม่ได้ลงประกาศ</ThemedText>
      </Card>

      {/* Carrier and tracking form */}
      <Card>
        <ThemedText type="subtitle">ระบุข้อมูลการจัดส่ง</ThemedText>
        <TextField
          label="ผู้ให้บริการขนส่ง"
          value={carrier}
          onChangeText={setCarrier}
          placeholder="เช่น ไปรษณีย์ไทย, Flash Express, Kerry"
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
            if (valid) onSubmit?.({ carrier: carrier.trim(), tracking_number: tracking.trim() });
          }}
        />
        {!onSubmit && <ThemedText type="small" themeColor="textSecondary">บริการแจ้งส่งยังไม่พร้อมใช้งาน</ThemedText>}
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
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const eligible = outcome === 'PASS' || outcome === 'MINOR_ISSUE';
  const publicReady = enabled && certificate && (() => {
    try {
      const url = new URL(certificate.publicUrl);
      return url.protocol === 'https:' || (__DEV__ && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname));
    } catch { return false; }
  })();

  const handleSavePhoto = () => {
    setToastMessage('บันทึกรูปใบรับรองลงเครื่องแล้ว');
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleShare = () => {
    if (certificate?.publicUrl) {
      void Linking.openURL(certificate.publicUrl).catch(() => undefined);
    }
    setToastMessage(`คัดลอกลิงก์ 2ndhand.app/c/${certificate?.number ?? ''} แล้ว`);
    setTimeout(() => setToastMessage(null), 2500);
  };

  return <ConfirmationSheet visible={visible} title="ใบรับรองผลการตรวจ" onClose={onClose}>
    {eligible && certificate ? (
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

        {/* QR Section */}
        {publicReady ? (
          <View style={{ alignItems: 'center', gap: 8 }}>
            {certificate.qrSource ? (
              <Image source={certificate.qrSource} style={{ width: 160, height: 160, alignSelf: 'center' }} contentFit="contain" accessibilityLabel="QR เปิดใบรับรองสาธารณะ" />
            ) : (
              <View accessibilityLabel="QR เปิดใบรับรองสาธารณะ" style={{ width: 140, height: 140, backgroundColor: '#FFFFFF', padding: 8, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
                <ThemedText style={{ fontSize: 48 }}>📱</ThemedText>
              </View>
            )}
            <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
              สแกนเพื่อตรวจสอบใบรับรองนี้ได้ทุกที่ ไม่ต้องเข้าสู่ระบบ
            </ThemedText>
            <Button label="เปิดใบรับรองสาธารณะ" onPress={() => { void Linking.openURL(certificate.publicUrl); }} />
          </View>
        ) : (
          <ThemedText style={{ textAlign: 'center' }}>หน้าใบรับรองสาธารณะและ QR ยังไม่พร้อมใช้งาน</ThemedText>
        )}

        {/* Action Buttons: Save Photo & Share */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="บันทึกรูป"
            onPress={handleSavePhoto}
            style={{
              flex: 1,
              paddingVertical: 12,
              borderRadius: 12,
              backgroundColor: theme.backgroundElement,
              borderWidth: 1,
              borderColor: theme.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <ThemedText style={{ fontSize: 13, fontWeight: '700', color: theme.text }}>⬇ บันทึกรูป</ThemedText>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="แชร์ลิงก์"
            onPress={handleShare}
            style={{
              flex: 1,
              paddingVertical: 12,
              borderRadius: 12,
              backgroundColor: '#059669',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <ThemedText style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>🔗 แชร์ลิงก์</ThemedText>
          </Pressable>
        </View>

        {toastMessage ? (
          <View style={{ padding: 10, borderRadius: 10, backgroundColor: '#059669', alignItems: 'center' }}>
            <ThemedText style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{toastMessage}</ThemedText>
          </View>
        ) : null}
      </View>
    ) : (
      <ThemedText>ไม่มีใบรับรองสำหรับผลการตรวจนี้</ThemedText>
    )}
  </ConfirmationSheet>;
}
export function BuyerResultView({ outcome, summary, inspectedAt, photos = [], certificate = null, nextAction, recordedDecision = null,
  certificatePublicHtml = false, certificateDecision = false, canDecide = false, busy, error, onDecision }: {
  outcome: InspectionOutcome; summary: string; inspectedAt: string; photos?: InspectionPhoto[];
  certificate?: CertificateData | null; nextAction: 'WAIT_BUYER_DECISION' | 'RETURN_TO_SELLER' | 'SHIP_TO_BUYER' | null;
  recordedDecision?: BuyerDecisionData | null;
  certificatePublicHtml?: boolean; certificateDecision?: boolean; canDecide?: boolean; busy?: boolean; error?: string;
  onDecision?(decision: 'CONFIRM' | 'REJECT', reason?: string | null): void;
}) {
  const theme = useTheme();
  const info = outcomes[outcome];
  const [showCertificate, setCertificate] = useState(false);
  const [photo, setPhoto] = useState<InspectionPhoto | null>(null);
  const [decision, setDecision] = useState<'CONFIRM' | 'REJECT' | null>(null);
  const [reason, setReason] = useState('');
  const [ackCondition, setAckCondition] = useState(false);
  const validReason = [...reason.trim()].length <= 500;
  const positive = outcome === 'PASS' || outcome === 'MINOR_ISSUE';
  const allowed = positive && !!certificate && certificateDecision && canDecide && nextAction === 'WAIT_BUYER_DECISION' && !!onDecision;
  const failAllowed = !positive && canDecide && nextAction === 'WAIT_BUYER_DECISION' && !!onDecision;
  const nextActionLabel = nextAction === 'RETURN_TO_SELLER'
    ? 'ขั้นตอนถัดไปคือส่งสินค้าคืนผู้ขาย ติดตามความคืบหน้าจากคำสั่งซื้อ'
    : nextAction === 'SHIP_TO_BUYER'
      ? 'ขั้นตอนถัดไปคือจัดส่งสินค้าไปยังผู้ซื้อ การยอมรับผลตรวจยังไม่ใช่การยืนยันว่าได้รับสินค้าแล้ว'
      : nextAction === 'WAIT_BUYER_DECISION'
        ? (positive
          ? 'โปรดอ่านรายงานและหลักฐานก่อนตัดสินใจเกี่ยวกับผลตรวจ'
          : 'ผลตรวจไม่ผ่านเกณฑ์ โปรดเลือกว่าจะขอคืนเงินหรือรับสินค้าตามสภาพจริง')
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

    {/* 3 Inspection Checklist Items matching prototype brChecks */}
    <Card>
      <ThemedText type="subtitle">หัวข้อการตรวจสอบ</ThemedText>
      <View style={{ gap: 8, marginTop: 4 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 }}>
          <ThemedText type="small" themeColor="textSecondary">ความแท้ของสินค้า</ThemedText>
          <ThemedText type="smallBold" style={{ color: outcome !== 'FAKE' ? '#059669' : '#DC2626' }}>
            {outcome !== 'FAKE' ? '✓ ของแท้' : '✗ ไม่แท้'}
          </ThemedText>
        </View>
        <View style={{ height: 1, backgroundColor: theme.border }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 }}>
          <ThemedText type="small" themeColor="textSecondary">สภาพสินค้า</ThemedText>
          <ThemedText type="smallBold" style={{ color: outcome === 'PASS' ? '#059669' : outcome === 'MINOR_ISSUE' ? '#D97706' : '#DC2626' }}>
            {outcome === 'PASS' ? '✓ ตรงตามที่ประกาศ' : outcome === 'MINOR_ISSUE' ? '⚠️ มีตำหนิเล็กน้อย' : '✗ ต่ำกว่าที่ประกาศ'}
          </ThemedText>
        </View>
        <View style={{ height: 1, backgroundColor: theme.border }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 }}>
          <ThemedText type="small" themeColor="textSecondary">ตรงกับรายละเอียดในประกาศ</ThemedText>
          <ThemedText type="smallBold" style={{ color: outcome !== 'NOT_AS_DESCRIBED' ? '#059669' : '#D97706' }}>
            {outcome !== 'NOT_AS_DESCRIBED' ? '✓ ตรง' : '✗ ไม่ตรง'}
          </ThemedText>
        </View>
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
        <Button label="ดูใบรับรองผลการตรวจ" onPress={() => setCertificate(true)} />
      </Card>
    )}

    {/* 72-Hour Decision Countdown Banner matching prototype */}
    {nextAction === 'WAIT_BUYER_DECISION' && (
      positive ? (
        <View style={{
          padding: 16,
          borderRadius: 16,
          backgroundColor: theme.warningSoft ?? '#FEF3C7',
          borderWidth: 1,
          borderColor: theme.warning,
          gap: 6,
        }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <ThemedText type="smallBold" style={{ color: theme.text }}>กรุณายืนยันภายใน</ThemedText>
            <ThemedText style={{ fontSize: 16, fontWeight: '800', color: theme.warning }}>72 ชม.</ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            ถ้าไม่ตอบภายใน 72 ชม. ระบบจะถือว่ายอมรับผลตรวจและรับสินค้าโดยอัตโนมัติ
          </ThemedText>
        </View>
      ) : (
        <View style={{
          padding: 16,
          borderRadius: 16,
          backgroundColor: outcome === 'FAKE' ? '#FEF2F2' : '#FFF7ED',
          borderWidth: 2,
          borderColor: outcome === 'FAKE' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(249, 115, 22, 0.4)',
          gap: 8,
        }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <ThemedText type="smallBold" style={{ color: theme.text }}>
              {canDecide ? 'เลือกภายใน' : 'รอผู้ซื้อเลือกภายใน'}
            </ThemedText>
            <ThemedText style={{ fontSize: 18, fontWeight: '800', color: outcome === 'FAKE' ? '#EF4444' : '#EA580C' }}>
              72 ชม.
            </ThemedText>
          </View>
          <View style={{ gap: 4 }}>
            <ThemedText type="small" themeColor="textSecondary">
              • <ThemedText type="smallBold">ปฏิเสธ</ThemedText> = ส่งคืนผู้ขาย + คืนเงินค่าสินค้า
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              • <ThemedText type="smallBold">ยอมรับ</ThemedText> = รับสินค้าตามสภาพจริง · ไม่ออกใบรับรอง · ขอคืนเงินภายหลังไม่ได้
            </ThemedText>
          </View>
          <ThemedText style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
            ถ้าไม่เลือกภายใน 72 ชม. ระบบจะส่งคืนผู้ขายและคืนเงินค่าสินค้าให้อัตโนมัติ
          </ThemedText>
        </View>
      )
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
          {recordedDecision.decision === 'CONFIRM'
            ? (!positive ? 'คุณยอมรับสินค้าตามสภาพจริงแล้ว' : 'บันทึกคำตัดสิน: ยอมรับผลตรวจ')
            : 'บันทึกคำตัดสิน: ไม่ยอมรับผลตรวจ'}
        </ThemedText>
        {recordedDecision.decision === 'REJECT' ? (
          <ThemedText type="small" themeColor="textSecondary">
            กำลังส่งคืนผู้ขาย · ศูนย์จะส่งสินค้าคืนผู้ขาย แล้วคืนเงินค่าสินค้าให้คุณ · ไม่คืนค่าจัดส่ง ฿50 และค่าตรวจสอบ ฿100
          </ThemedText>
        ) : !positive ? (
          <ThemedText type="small" themeColor="textSecondary">
            ศูนย์กำลังส่งสินค้าถึงคุณ · <ThemedText style={{ fontWeight: '700' }}>ไม่ออกใบรับรอง</ThemedText> เพราะผลตรวจไม่ผ่าน
          </ThemedText>
        ) : null}
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
          <Button label="ยอมรับผลตรวจ" variant="primary" busy={busy} onPress={() => setDecision('CONFIRM')} />
          <Button label="ไม่ยอมรับผลตรวจ" busy={busy} onPress={() => { setReason(''); setDecision('REJECT'); }} />
        </View>
      ) : failAllowed ? (
        <View style={{ gap: 10, marginTop: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="ปฏิเสธ · คืนเงิน"
            disabled={busy}
            onPress={() => setDecision('REJECT')}
            style={{
              paddingVertical: 14,
              borderRadius: 12,
              backgroundColor: '#059669',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <ThemedText style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>
              ปฏิเสธ · คืนเงิน
            </ThemedText>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="ยอมรับตามสภาพจริง"
            disabled={busy}
            onPress={() => { setAckCondition(false); setDecision('CONFIRM'); }}
            style={{
              paddingVertical: 13,
              borderRadius: 12,
              backgroundColor: 'transparent',
              borderWidth: 2,
              borderColor: outcome === 'FAKE' ? 'rgba(239, 68, 68, 0.6)' : 'rgba(249, 115, 22, 0.6)',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <ThemedText style={{ color: outcome === 'FAKE' ? '#EF4444' : '#EA580C', fontWeight: '700', fontSize: 14 }}>
              ยอมรับตามสภาพจริง
            </ThemedText>
          </Pressable>
        </View>
      ) : positive && !recordedDecision && (
        <ThemedText type="small">การตัดสินผลตรวจยังไม่พร้อมใช้งานสำหรับรายการนี้</ThemedText>
      )}
      {!!error && <ThemedText accessibilityRole="alert">{error}</ThemedText>}
    </Card>

    <CertificateSheet certificate={positive ? certificate : null} outcome={outcome} enabled={certificatePublicHtml} visible={showCertificate && positive} onClose={() => setCertificate(false)} />
    <ImageViewer source={photo?.source} label={photo?.label ?? 'หลักฐานการตรวจ'} onClose={() => setPhoto(null)} />

    {/* Confirmation Sheet for PASS / MINOR_ISSUE */}
    <ConfirmationSheet visible={!!decision && allowed} title="ยืนยันการตัดสินผลตรวจ" onClose={() => setDecision(null)}>
      <ThemedText>การตัดสินใจนี้เกี่ยวกับผลตรวจเท่านั้น ไม่ใช่การยืนยันรับสินค้า</ThemedText>
      {decision === 'CONFIRM' && (
        <ThemedText type="small" themeColor="textSecondary">
          ระบบจะออกใบรับรองดิจิทัล และศูนย์จะส่งสินค้าถึงคุณ · ยอมรับแล้วเปลี่ยนใจไม่ได้
        </ThemedText>
      )}
      {decision === 'REJECT' && (
        <View style={{ gap: 8 }}>
          <ThemedText type="small" style={{ color: theme.danger }}>
            ⚠️ คุณจะได้รับเงินคืนเฉพาะค่าสินค้า · ไม่คืนค่าจัดส่ง ฿50 และค่าตรวจสอบ ฿100 · สินค้าจะถูกส่งคืนผู้ขาย · ปฏิเสธแล้วเปลี่ยนใจไม่ได้
          </ThemedText>
          <TextField
            label="เหตุผลที่ไม่ยอมรับ (ไม่บังคับ)"
            value={reason}
            onChangeText={setReason}
            multiline
            editable={!busy}
            error={!validReason ? 'เหตุผลต้องไม่เกิน 500 ตัวอักษร' : undefined}
          />
        </View>
      )}
      <Button
        label={decision === 'CONFIRM' ? 'ยืนยันยอมรับผลตรวจ' : 'ยืนยันไม่ยอมรับผลตรวจ'}
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

    {/* Confirmation Sheet for NOT_AS_DESCRIBED / FAKE (Fail Flow) */}
    <ConfirmationSheet visible={!!decision && failAllowed} title={decision === 'REJECT' ? 'ปฏิเสธและขอคืนเงิน?' : (outcome === 'FAKE' ? 'ยอมรับสินค้าที่ตรวจพบว่าเป็นของปลอม?' : 'ยอมรับสินค้าที่ไม่ตรงตามประกาศ?')} onClose={() => setDecision(null)}>
      {decision === 'REJECT' ? (
        <View style={{ gap: 12 }}>
          <View style={{
            padding: 14,
            borderRadius: 12,
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            borderWidth: 1,
            borderColor: 'rgba(16, 185, 129, 0.4)',
            gap: 6,
          }}>
            <ThemedText type="smallBold" style={{ color: '#059669' }}>
              ไม่ต้องกรอกเหตุผล · ใช้ผลตรวจ "{outcome === 'FAKE' ? 'ของปลอม' : 'ไม่ตรงตามประกาศ'}" เป็นเหตุผล
            </ThemedText>
            <ThemedText type="small">• ศูนย์จะส่งสินค้าคืนผู้ขาย</ThemedText>
            <ThemedText type="small">• คุณได้รับเงินคืนค่าสินค้า</ThemedText>
            <ThemedText type="small" style={{ color: '#64748B' }}>• ไม่คืนค่าจัดส่ง ฿50 และค่าตรวจสอบ ฿100</ThemedText>
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="กลับ"
              onPress={() => setDecision(null)}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 12,
                backgroundColor: theme.backgroundElement,
                borderWidth: 1,
                borderColor: theme.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <ThemedText style={{ fontSize: 13, fontWeight: '700', color: theme.text }}>กลับ</ThemedText>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="ยืนยันคืนเงิน"
              disabled={busy}
              onPress={() => {
                onDecision?.('REJECT', outcome === 'FAKE' ? 'ตรวจพบว่าเป็นของปลอม' : 'สินค้าไม่ตรงตามประกาศ');
                setDecision(null);
              }}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 12,
                backgroundColor: '#059669',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <ThemedText style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>ยืนยันคืนเงิน</ThemedText>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <View style={{
            padding: 14,
            borderRadius: 12,
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            borderWidth: 2,
            borderColor: 'rgba(239, 68, 68, 0.4)',
            gap: 6,
          }}>
            <ThemedText type="smallBold" style={{ color: '#DC2626' }}>⚠️ โปรดอ่านก่อนยืนยัน</ThemedText>
            <ThemedText type="small">• <ThemedText style={{ fontWeight: '700' }}>ไม่ออกใบรับรองดิจิทัล</ThemedText> เพราะผลตรวจไม่ผ่าน</ThemedText>
            <ThemedText type="small">• เงินจะโอนให้ผู้ขายเมื่อคุณได้รับสินค้า · <ThemedText style={{ fontWeight: '700' }}>ขอคืนเงินภายหลังไม่ได้</ThemedText></ThemedText>
            <ThemedText type="small">• ยอมรับแล้วเปลี่ยนใจไม่ได้</ThemedText>
            {outcome === 'FAKE' && (
              <ThemedText type="small">• สินค้าปลอมอาจมีข้อจำกัดทางกฎหมายในการนำไปขายต่อ</ThemedText>
            )}
          </View>

          {/* Mandatory Checkbox */}
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel="ฉันเข้าใจเงื่อนไขและต้องการรับสินค้าตามสภาพจริง"
            accessibilityState={{ checked: ackCondition }}
            onPress={() => setAckCondition(v => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}>
            <View style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              backgroundColor: ackCondition ? '#059669' : 'transparent',
              borderWidth: 2,
              borderColor: ackCondition ? '#059669' : '#94A3B8',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {ackCondition && <ThemedText style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 'bold' }}>✓</ThemedText>}
            </View>
            <ThemedText style={{ flex: 1, fontSize: 12, color: theme.text }}>
              ฉันเข้าใจเงื่อนไขและต้องการรับสินค้าตามสภาพจริง
            </ThemedText>
          </Pressable>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="กลับ"
              onPress={() => setDecision(null)}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 12,
                backgroundColor: theme.backgroundElement,
                borderWidth: 1,
                borderColor: theme.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <ThemedText style={{ fontSize: 13, fontWeight: '700', color: theme.text }}>กลับ</ThemedText>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="ยืนยันยอมรับ"
              disabled={!ackCondition || busy}
              onPress={() => {
                if (ackCondition) {
                  onDecision?.('CONFIRM');
                  setDecision(null);
                }
              }}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 12,
                backgroundColor: '#DC2626',
                opacity: ackCondition ? 1 : 0.4,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <ThemedText style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>ยืนยันยอมรับ</ThemedText>
            </Pressable>
          </View>
        </View>
      )}
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
