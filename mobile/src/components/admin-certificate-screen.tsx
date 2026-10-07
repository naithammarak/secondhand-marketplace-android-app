import { useCallback, useState } from 'react';
import { Redirect, router } from 'expo-router';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/auth-provider';
import { useCertificateResource } from '@/certificates/use-certificate-resource';
import { useInspectionApi, useInspectionMutation } from '@/inspections/use-inspection-api';
import { MarketplaceHeader } from './marketplace-header';
import { Button, Card, Loading, Row, Screen, styles } from './order-ui';
import { ThemedText } from './themed-text';
import { ConfirmationSheet, EmptyState, TextField } from './wondee/primitives';

export function AdminCertificateScreen({ certificateId }: { certificateId?: number | null }) {
  const auth = useAuth();
  if (!auth.initializing && !auth.session) return <Redirect href="/login" />;
  const allowed = auth.account?.source === 'backend' && auth.account.role === 'ADMIN' && !auth.accountError;
  return <Screen><SafeAreaView style={[styles.content, { flex: 1, alignSelf: 'center', gap: 0 }]}>
    <MarketplaceHeader title="จัดการใบรับรอง" back />
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
      {auth.initializing || auth.accountChecking ? <Loading label="กำลังตรวจสอบบัญชี" />
        : !allowed ? <Card><ThemedText>เฉพาะผู้ดูแลระบบที่ใช้งานได้เท่านั้น</ThemedText>
          <Button label="ตรวจบัญชีอีกครั้ง" onPress={() => { void auth.retryAccount(); }} /></Card>
        : certificateId === null ? <EmptyState title="รหัสใบรับรองไม่ถูกต้อง" />
        : certificateId === undefined ? <CertificateList key={auth.session?.user.id} />
        : <CertificateDetail key={`${auth.session?.user.id}:${certificateId}`} id={certificateId} />}
    </ScrollView>
  </SafeAreaView></Screen>;
}

function ResourceStatus({ loading, error, reload }: { loading: boolean; error?: string; reload(): Promise<void> }) {
  return <>{loading && <Loading label="กำลังโหลดใบรับรอง" />}{error && <Card>
    <ThemedText accessibilityRole="alert">{error}</ThemedText>
    <Button label="ลองโหลดอีกครั้ง" onPress={() => { void reload(); }} />
  </Card>}</>;
}

function CertificateList() {
  const api = useInspectionApi();
  const [cursors, setCursors] = useState<(number | undefined)[]>([undefined]);
  const beforeId = cursors[cursors.length - 1];
  const resource = useCertificateResource(useCallback(() => api.call(token => api.service.adminCertificates(token, beforeId)), [api, beforeId]));
  return <>
    <ThemedText>เลือกใบรับรองเพื่อตรวจสถานะและเพิกถอน</ThemedText>
    <ResourceStatus {...resource} />
    {resource.data?.items.length === 0 && <EmptyState title="ไม่มีใบรับรองในหน้านี้" />}
    {resource.data?.items.map(item => <Card key={item.id}>
      <ThemedText type="subtitle">{item.certificate_no}</ThemedText>
      <Row label="สถานะ" value={item.status === 'REVOKED' ? 'เพิกถอนแล้ว (REVOKED)' : 'ออกใบรับรองแล้ว (ISSUED)'} />
      <Button label="รายละเอียดใบรับรอง" accessibilityLabel={`รายละเอียด ${item.certificate_no}`}
        onPress={() => router.push({ pathname: '/admin-certificates/[certificateId]', params: { certificateId: item.id } })} />
    </Card>)}
    {cursors.length > 1 && <Button label="หน้าก่อนหน้า" disabled={resource.loading} onPress={() => setCursors(values => values.slice(0, -1))} />}
    {resource.data?.next_before_id != null && <Button label="หน้าถัดไป" disabled={resource.loading}
      onPress={() => setCursors(values => [...values, resource.data!.next_before_id!])} />}
    <Button label="โหลดสถานะล่าสุด" disabled={resource.loading} onPress={() => { void resource.reload(); }} />
  </>;
}

function CertificateDetail({ id }: { id: number }) {
  const api = useInspectionApi();
  const resource = useCertificateResource(useCallback(() => api.call(token => api.service.adminCertificate(token, id)), [api, id]));
  const action = useInspectionMutation();
  const [reason, setReason] = useState('');
  const [pendingReason, setPendingReason] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [committed, setCommitted] = useState(false);
  const cleaned = reason.trim();
  const length = Array.from(cleaned).length;
  const valid = length >= 10 && length <= 1000 && !/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(cleaned);
  const submit = async (value: string) => {
    setConfirm(false); setPendingReason(value);
    const ok = await action.mutate(`revoke:${id}:${value}`,
      key => api.call(token => api.service.revokeCertificate(token, id, value, key)),
      () => { setPendingReason(null); void resource.reload(); });
    if (ok) {
      setCommitted(true); setPendingReason(null); setReason('');
      await resource.reload();
    }
  };
  const certificate = resource.data;
  return <>
    <ResourceStatus {...resource} />
    {committed && <ThemedText accessibilityRole="alert">เพิกถอนใบรับรองแล้ว</ThemedText>}
    {action.error && <ThemedText accessibilityRole="alert">{action.error}</ThemedText>}
    {certificate && <Card>
      <ThemedText type="subtitle">{certificate.certificate_no}</ThemedText>
      <Row label="สถานะ" value={certificate.status === 'REVOKED' ? 'เพิกถอนแล้ว (REVOKED)' : 'ออกใบรับรองแล้ว (ISSUED)'} />
      <Row label="ผลตรวจเดิม" value={certificate.result} />
      <Row label="ออกเมื่อ" value={new Date(certificate.issued_at).toLocaleString('th-TH')} />
      {certificate.revoked_at && <Row label="เพิกถอนเมื่อ" value={new Date(certificate.revoked_at).toLocaleString('th-TH')} />}
      <Button label="ดูหน้าสาธารณะ" onPress={() => {
        const token = new URL(certificate.public_url).pathname.split('/').pop()!;
        router.push({ pathname: '/certificates/[token]', params: { token } });
      }} />
    </Card>}
    {certificate?.status === 'REVOKED' && <ThemedText>ใบรับรองนี้ใช้ยืนยันผลตรวจไม่ได้ และไม่สามารถยกเลิกการเพิกถอนผ่านหน้านี้</ThemedText>}
    {certificate?.can_revoke && !committed && pendingReason === null && <Card>
      <ThemedText>การเพิกถอนมีผลถาวร ไม่เปลี่ยนผลตรวจ การตัดสินใจของผู้ซื้อ หรือคืนเงินอัตโนมัติ</ThemedText>
      <TextField label="เหตุผลส่วนตัวสำหรับบันทึกตรวจสอบ" value={reason} onChangeText={setReason} multiline
        editable={!action.busy} error={reason.length > 0 && !valid ? 'กรอกเหตุผล 10–1000 ตัวอักษรหลังตัดช่องว่างหัวท้าย' : undefined} />
      <ThemedText type="small">เหตุผลนี้ไม่แสดงในใบรับรองสาธารณะ</ThemedText>
      <Button label="เพิกถอนใบรับรอง" variant="danger" disabled={!valid || resource.loading} busy={action.busy} onPress={() => setConfirm(true)} />
    </Card>}
    {pendingReason !== null && <Card>
      <ThemedText>กำลังตรวจสอบผลคำขอเดิม กรุณาลองส่งคำขอเดิมหรือโหลดสถานะล่าสุด</ThemedText>
      <Button label="ลองส่งคำขอเดิม" busy={action.busy} onPress={() => { void submit(pendingReason); }} />
    </Card>}
    <Button label="โหลดสถานะล่าสุด" disabled={action.busy || resource.loading} onPress={() => { void resource.reload(); }} />
    <ConfirmationSheet visible={confirm} title="ยืนยันการเพิกถอนถาวร" onClose={() => setConfirm(false)}>
      <ThemedText>{certificate?.certificate_no}</ThemedText><ThemedText>{cleaned}</ThemedText>
      <ThemedText>เมื่อยืนยันแล้ว ใบรับรองสาธารณะจะแสดงว่าเพิกถอน</ThemedText>
      <Button label="ยืนยันเพิกถอน" variant="danger" disabled={!valid || !certificate?.can_revoke} busy={action.busy}
        onPress={() => { void submit(cleaned); }} />
    </ConfirmationSheet>
  </>;
}
