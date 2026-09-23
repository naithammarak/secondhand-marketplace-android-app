import * as Crypto from 'expo-crypto';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Linking, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Row, styles } from '@/components/order-ui';
import { formatDateTime, orderStatusLabels } from '@/orders/order-format';
import type { OrderStatus, ViewerRole } from '@/services/order-service';
import { createInspectionService, InspectionServiceError, type BuyerResult, type Progress } from '@/services/inspection-service';

const resultLabels = {
  PASS: 'ผ่านการตรวจ', MINOR_ISSUE: 'ผ่านโดยมีข้อสังเกตเล็กน้อย',
  NOT_AS_DESCRIBED: 'สินค้าไม่ตรงรายละเอียด', FAKE: 'สินค้าไม่แท้',
} as const;

function message(error: unknown): string {
  if (!(error instanceof InspectionServiceError)) return 'ระบบขัดข้อง กรุณาลองใหม่';
  if (error.status === 401) return 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่';
  if (error.status === 403 || error.status === 404) return 'คุณไม่มีสิทธิ์ดูหรือทำรายการนี้';
  if (error.status === 409) return 'สถานะเปลี่ยนไปแล้ว กรุณารีเฟรช';
  if (error.status === 503) return 'บริการยังไม่พร้อม กรุณาลองใหม่ภายหลัง';
  if (error.code === 'timeout' || error.code === 'network_error') return 'ยังไม่ทราบผลคำขอ กรุณารีเฟรชหรือลองส่งคำขอเดิม';
  return 'ดำเนินการไม่สำเร็จ กรุณาลองใหม่';
}

export function InspectionOrderPanel({ orderId, status, role, token, onChanged }: {
  orderId: number; status: OrderStatus; role: ViewerRole; token: string; onChanged(): void;
}) {
  const service = useMemo(() => createInspectionService({ baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL }), []);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [result, setResult] = useState<BuyerResult | null>(null);
  const [carrier, setCarrier] = useState('');
  const [tracking, setTracking] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<{ key: string; carrier: string; tracking_number: string } | null>(null);

  useEffect(() => {
    let active = true;
    pending.current = null;
    void Promise.resolve().then(() => {
      if (!active) return;
      setProgress(null); setResult(null); setError(null);
    });
    const load = async () => {
      try {
        const latest = await service.getProgress(token, orderId);
        if (!active) return;
        setProgress(latest);
        if (role === 'buyer' && latest.order_status === 'RESULT_NOTIFIED') {
          const final = await service.getBuyerResult(token, orderId);
          if (active) setResult(final);
        }
      } catch (cause) { if (active) setError(message(cause)); }
    };
    void load();
    return () => { active = false; };
  }, [orderId, role, service, status, token]);

  const refresh = async () => {
    setError(null);
    try {
      const latest = await service.getProgress(token, orderId);
      setProgress(latest);
      if (role === 'buyer' && latest.order_status === 'RESULT_NOTIFIED') {
        setResult(await service.getBuyerResult(token, orderId));
      }
      onChanged();
    } catch (cause) { setError(message(cause)); }
  };

  const ship = async () => {
    if (busy) return;
    const input = { carrier: carrier.trim(), tracking_number: tracking.trim() };
    if (!input.carrier || !input.tracking_number) { setError('กรุณากรอกบริษัทขนส่งและเลขติดตาม'); return; }
    if (pending.current && (pending.current.carrier !== input.carrier || pending.current.tracking_number !== input.tracking_number)) pending.current = null;
    pending.current ??= { ...input, key: Crypto.randomUUID() };
    setBusy(true);
    setError(null);
    try {
      const latest = await service.ship(token, orderId, input, pending.current.key);
      pending.current = null;
      setProgress(latest);
      onChanged();
    } catch (cause) {
      const failure = message(cause);
      if (cause instanceof InspectionServiceError && ![0, 500, 503].includes(cause.status)) pending.current = null;
      await refresh();
      setError(failure);
    } finally { setBusy(false); }
  };

  return <Card>
    <ThemedText type="smallBold">การส่งเข้าศูนย์และผลตรวจ</ThemedText>
    <Row label="สถานะล่าสุด" value={orderStatusLabels[progress?.order_status ?? status]} />
    {progress?.shipment ? <>
      <Row label="ขนส่ง" value={progress.shipment.carrier} />
      <Row label="เลขติดตาม" value={progress.shipment.tracking_number} />
      {progress.shipment.received_at ? <Row label="รับเข้าศูนย์" value={formatDateTime(progress.shipment.received_at) ?? '-'} /> : null}
    </> : null}
    {role === 'seller' && status === 'WAITING_SELLER_SHIP' ? <>
      <TextInput style={styles.input} placeholder="บริษัทขนส่ง" value={carrier} onChangeText={setCarrier} editable={!busy} />
      <TextInput style={styles.input} placeholder="เลขติดตาม" value={tracking} onChangeText={setTracking} editable={!busy} />
      <Button label="แจ้งส่งเข้าศูนย์ / ส่งคำขอเดิมอีกครั้ง" variant="primary" busy={busy} onPress={() => { void ship(); }} />
    </> : null}
    {result?.result ? <>
      <ThemedText type="smallBold">ผลตรวจ: {resultLabels[result.result]}</ThemedText>
      <ThemedText type="small">{result.summary}</ThemedText>
      {result.evidence.map(item => <Image key={item.id} source={service.privateImageSource(token, item)}
        style={{ width: '100%', height: 220, borderRadius: 8 }} resizeMode="contain" accessibilityLabel={`รูปหลักฐานผลตรวจ ${item.id}`} />)}
      {result.certificate ? <Button label={`ดูใบรับรอง ${result.certificate.certificate_no}`}
        onPress={() => { void Linking.openURL(result.certificate!.public_url); }} /> : null}
    </> : null}
    {error ? <ThemedText type="small" style={styles.errorText} accessibilityLiveRegion="polite">{error}</ThemedText> : null}
    <View><Button label="รีเฟรชการตรวจ" disabled={busy} onPress={() => { void refresh(); }} /></View>
  </Card>;
}
