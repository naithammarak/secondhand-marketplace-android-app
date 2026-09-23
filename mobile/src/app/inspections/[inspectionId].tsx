import * as Crypto from 'expo-crypto';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-provider';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Loading, Row, Screen, styles } from '@/components/order-ui';
import { formatDateTime, orderStatusLabels } from '@/orders/order-format';
import { parseRouteId } from '@/orders/route-params';
import { pickProductImage } from '@/products/pick-product-image';
import { createInspectionService, InspectionServiceError, type InspectionResult, type WorkDetail } from '@/services/inspection-service';

const results: { value: InspectionResult; label: string }[] = [
  { value: 'PASS', label: 'ผ่านการตรวจ' },
  { value: 'MINOR_ISSUE', label: 'มีข้อสังเกตเล็กน้อย' },
  { value: 'NOT_AS_DESCRIBED', label: 'ไม่ตรงรายละเอียด' },
  { value: 'FAKE', label: 'สินค้าไม่แท้' },
];

function errorMessage(error: unknown): string {
  if (!(error instanceof InspectionServiceError)) return 'ระบบขัดข้อง กรุณาลองใหม่';
  if (error.code === 'certificate_unavailable') return 'ออกใบรับรองไม่สำเร็จ ผลยังไม่ถูกบันทึก ลองส่งคำขอเดิมอีกครั้ง';
  if (error.status === 403 || error.status === 404) return 'คุณไม่มีสิทธิ์ทำรายการนี้';
  if (error.status === 409) return 'สถานะงานเปลี่ยนไปแล้ว กรุณารีเฟรช';
  if (error.status === 413) return 'รูปใหญ่เกิน 5 MiB';
  if (error.status === 415) return 'รองรับเฉพาะภาพ JPEG, PNG หรือ WebP';
  if (error.code === 'timeout' || error.code === 'network_error') return 'ยังไม่ทราบผลคำขอ กรุณารีเฟรชหรือลองส่งคำขอเดิม';
  return 'ทำรายการไม่สำเร็จ กรุณาลองใหม่';
}

export default function InspectionWorkRoute() {
  const { inspectionId } = useLocalSearchParams<{ inspectionId: string }>();
  const id = parseRouteId(inspectionId);
  const auth = useAuth();
  const router = useRouter();
  const service = useMemo(() => createInspectionService({ baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL }), []);
  const [work, setWork] = useState<WorkDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [summary, setSummary] = useState('');
  const [result, setResult] = useState<InspectionResult | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const pending = useRef<{ operation: string; fingerprint: string; key: string } | null>(null);
  const pendingUploadFile = useRef<Awaited<ReturnType<typeof pickProductImage>> | null>(null);
  const token = auth.session?.access_token;
  const owner = auth.session?.user.id;

  useEffect(() => {
    let active = true;
    pending.current = null; pendingUploadFile.current = null;
    if (auth.account?.role !== 'INSPECTOR' || !token || id === null) return;
    void Promise.resolve().then(() => {
      if (!active) return;
      setWork(null); setError(null); setSelected([]); setLoading(true);
    });
    void service.detail(token, id).then(value => {
      if (!active) return;
      setWork(value);
      setSelected(value.evidence.map(item => item.id));
    }).catch(cause => { if (active) setError(errorMessage(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [auth.account?.role, id, owner, service, token]);

  const refresh = async () => {
    if (!token || id === null) return;
    try {
      const latest = await service.detail(token, id);
      setWork(latest);
      setSelected(previous => previous.filter(photoId => latest.evidence.some(item => item.id === photoId)));
      setError(null);
    } catch (cause) { setError(errorMessage(cause)); }
  };

  const keyFor = (operation: string, fingerprint: string) => {
    if (pending.current?.operation !== operation || pending.current.fingerprint !== fingerprint) {
      pending.current = { operation, fingerprint, key: Crypto.randomUUID() };
    }
    return pending.current.key;
  };

  const execute = async (operation: string, fingerprint: string, call: (key: string) => Promise<WorkDetail>) => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      setWork(await call(keyFor(operation, fingerprint)));
      pending.current = null;
    } catch (cause) {
      const failure = errorMessage(cause);
      if (cause instanceof InspectionServiceError && ![0, 500, 503].includes(cause.status)) pending.current = null;
      await refresh();
      setError(failure);
    } finally { setBusy(false); }
  };

  const upload = async () => {
    if (!token || id === null || busy || (work?.evidence.length ?? 0) >= 5) return;
    const picked = pending.current?.operation === 'upload' && pendingUploadFile.current?.status === 'picked'
      ? pendingUploadFile.current : await pickProductImage();
    if (picked.status === 'permission-denied') { setError('กรุณาอนุญาตให้เข้าถึงรูปภาพ'); return; }
    if (picked.status !== 'picked') return;
    if (picked.file.size && picked.file.size > 5 * 1024 * 1024) { setError('รูปใหญ่เกิน 5 MiB'); return; }
    pendingUploadFile.current = picked;
    setBusy(true); setError(null);
    try {
      const fingerprint = `${picked.file.uri}:${picked.file.size ?? ''}`;
      const uploaded = await service.upload(token, id, picked.file, keyFor('upload', fingerprint));
      pending.current = null;
      pendingUploadFile.current = null;
      setSelected(previous => [...previous, uploaded.evidence.id]);
      await refresh();
      setSelected(previous => previous.includes(uploaded.evidence.id) ? previous : [...previous, uploaded.evidence.id]);
    } catch (cause) {
      const failure = errorMessage(cause);
      if (cause instanceof InspectionServiceError && ![0, 500, 503].includes(cause.status)) {
        pending.current = null;
        pendingUploadFile.current = null;
      }
      await refresh();
      setError(failure);
    }
    finally { setBusy(false); }
  };

  const submit = async () => {
    if (!token || id === null || !result) { setError('กรุณาเลือกผลตรวจ'); return; }
    const cleaned = summary.trim();
    if (cleaned.length < 10 || cleaned.length > 2000) { setError('กรุณากรอกหมายเหตุ 10–2000 ตัวอักษร'); return; }
    if (!selected.length || selected.length > 5) { setError('กรุณาเลือกรูปหลักฐาน 1–5 รูป'); return; }
    const payload = { result, summary: cleaned, evidence_ids: selected };
    await execute('result', JSON.stringify(payload), key => service.result(token, id, payload, key));
  };

  if (!auth.session) return <Redirect href="/" />;
  if (auth.account?.role !== 'INSPECTOR') return <Redirect href="/" />;
  if (id === null) return <ThemedText>รหัสงานตรวจไม่ถูกต้อง</ThemedText>;
  return <Screen><ScrollView contentContainerStyle={styles.scrollContent}><SafeAreaView style={styles.content}>
    <ThemedText type="subtitle">งานตรวจ #{id}</ThemedText>
    {loading ? <Loading label="กำลังโหลดงานตรวจ" /> : null}
    {error ? <ThemedText style={styles.errorText} accessibilityLiveRegion="polite">{error}</ThemedText> : null}
    {work ? <>
      <Card>
        <ThemedText type="smallBold">{work.product.name}</ThemedText>
        <Row label="Order" value={`#${work.order_id}`} />
        <Row label="สภาพ/ไซซ์" value={`${work.product.condition} / ${work.product.size}`} />
        <Row label="สถานะ" value={orderStatusLabels[work.order_status]} />
        {work.shipment ? <Row label="เลขติดตาม" value={work.shipment.tracking_number} /> : null}
        <Button label="รีเฟรชงาน" disabled={busy} onPress={() => { void refresh(); }} />
      </Card>
      {work.order_status === 'SHIPPING_TO_CENTER' ? <Card>
        <ThemedText type="smallBold">รับสินค้าเข้าศูนย์</ThemedText>
        <TextInput style={styles.input} placeholder="หมายเหตุ (ไม่บังคับ)" value={note} onChangeText={setNote} editable={!busy} />
        <Button label="ยืนยันรับสินค้า" variant="primary" busy={busy} onPress={() => {
          if (token) void execute('receive', note.trim(), key => service.receive(token, id, note.trim() || null, key));
        }} />
      </Card> : null}
      {work.order_status === 'RECEIVED_AT_CENTER' ? <Card>
        <ThemedText type="smallBold">เริ่มตรวจ</ThemedText>
        <Button label="รับงานและเริ่มตรวจ" variant="primary" busy={busy} onPress={() => {
          if (token) void execute('start', '{}', key => service.start(token, id, key));
        }} />
      </Card> : null}
      {work.order_status === 'INSPECTING' ? <Card>
        <ThemedText type="smallBold">รูปหลักฐาน ({work.evidence.length}/5)</ThemedText>
        <Button label="เลือกรูปหรือส่งรูปเดิมอีกครั้ง" busy={busy} disabled={work.evidence.length >= 5} onPress={() => { void upload(); }} />
        {work.evidence.map(item => <Pressable key={item.id} onPress={() => setSelected(previous => previous.includes(item.id) ? previous.filter(value => value !== item.id) : [...previous, item.id])}>
          {token ? <Image source={service.privateImageSource(token, item)} style={{ width: '100%', height: 180 }} resizeMode="contain" /> : null}
          <ThemedText type="small">{selected.includes(item.id) ? '✓ เลือกไว้เป็นรูปผลตรวจ' : 'แตะเพื่อเลือกรูปนี้'}</ThemedText>
        </Pressable>)}
        <ThemedText type="smallBold">ผลตรวจ</ThemedText>
        <View style={{ gap: 8 }}>{results.map(option => <Button key={option.value}
          label={`${result === option.value ? '✓ ' : ''}${option.label}`}
          onPress={() => setResult(option.value)} disabled={busy} />)}</View>
        <TextInput style={[styles.input, { minHeight: 100 }]} multiline placeholder="สรุปความแท้ สภาพ และความตรงกับสินค้า" value={summary} onChangeText={setSummary} editable={!busy} />
        <Button label="บันทึกผลครั้งเดียว" variant="primary" busy={busy} onPress={() => { void submit(); }} />
      </Card> : null}
      {work.result ? <Card>
        <ThemedText type="smallBold">ผลตรวจ: {results.find(item => item.value === work.result)?.label}</ThemedText>
        <ThemedText type="small">{work.summary}</ThemedText>
        {formatDateTime(work.inspected_at) ? <Row label="บันทึกเมื่อ" value={formatDateTime(work.inspected_at)!} /> : null}
        {work.certificate ? <Row label="ใบรับรอง" value={work.certificate.certificate_no} /> : null}
        {work.evidence.map(item => token ? <Image key={item.id} source={service.privateImageSource(token, item)} style={{ width: '100%', height: 180 }} resizeMode="contain" /> : null)}
      </Card> : null}
    </> : null}
    <Button label="กลับคิวตรวจ" onPress={() => router.replace('/inspections')} />
  </SafeAreaView></ScrollView></Screen>;
}
