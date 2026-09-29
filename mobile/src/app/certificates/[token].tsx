import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createInspectionService, type InspectionResult } from '@/services/inspection-service';
import { inspectionError } from '@/inspections/use-inspection-api';
import { MarketplaceHeader } from '@/components/marketplace-header';
import { Button, Card, Loading, Screen, styles } from '@/components/order-ui';
import { ThemedText } from '@/components/themed-text';
import { WondeeMascot } from '@/components/wondee/brand';
import { outcomes } from '@/components/inspection/views';

export default function PublicCertificateScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  return <CertificateContent key={token} token={token} />;
}

function CertificateContent({ token }: { token?: string }) {
  const service = useMemo(() => createInspectionService({ baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL }), []);
  const [data, setData] = useState<{ certificate_no: string; result: InspectionResult; issued_at: string; status: 'ISSUED' | 'REVOKED' }>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    if (!token || !/^[\w-]{20,100}$/.test(token)) return;
    void service.publicCertificate(token).then(value => { if (active) setData(value); })
      .catch(failure => { if (active) setError(inspectionError(failure)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, service, attempt]);
  return <Screen><SafeAreaView style={[styles.content, { flex: 1, alignSelf: 'center', gap: 0 }]}>
    <MarketplaceHeader title="ใบรับรองผลการตรวจ" back /><ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
      {(!token || !/^[\w-]{20,100}$/.test(token)) ? <ThemedText>ลิงก์ใบรับรองไม่ถูกต้อง</ThemedText> : loading && <Loading label="กำลังตรวจสอบใบรับรอง" />}
      {error && <Card><ThemedText accessibilityRole="alert">{error}</ThemedText><Button label="ลองใหม่" onPress={() => { setError(undefined); setData(undefined); setLoading(true); setAttempt(value => value + 1); }} /></Card>}
      {data && data.status !== 'ISSUED' && <Card><ThemedText type="title">{data.status === 'REVOKED' ? 'ใบรับรองนี้ถูกเพิกถอน' : 'ไม่สามารถยืนยันใบรับรองนี้ได้'}</ThemedText>
        <ThemedText>ไม่สามารถใช้ใบรับรองนี้เพื่อยืนยันผลการตรวจได้</ThemedText><ThemedText>{data.certificate_no}</ThemedText>
        <ThemedText>ออกเมื่อ {new Date(data.issued_at).toLocaleString('th-TH')}</ThemedText>
      </Card>}
      {data?.status === 'ISSUED' && <Card><WondeeMascot variant="seal" size={96} /><ThemedText type="title">ใบรับรองวนดี</ThemedText>
        <ThemedText>{data.certificate_no}</ThemedText><ThemedText type="subtitle">{outcomes[data.result]?.label ?? 'ผลการตรวจ'}</ThemedText>
        <ThemedText>ออกเมื่อ {new Date(data.issued_at).toLocaleString('th-TH')}</ThemedText><ThemedText>รับรองผลการตรวจ ณ วันที่ออกตามรายงาน</ThemedText>
      </Card>}
    </ScrollView></SafeAreaView></Screen>;
}
