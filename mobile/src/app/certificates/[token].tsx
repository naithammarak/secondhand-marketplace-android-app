import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';
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
  return (
    <Screen>
      <SafeAreaView style={[styles.content, { flex: 1, alignSelf: 'center', gap: 0 }]}>
        {/* Simulated browser address bar matching prototype screen-cert-public */}
        <View style={{
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderBottomWidth: 1,
          borderBottomColor: '#E2E8F0',
          backgroundColor: '#F8FAFC',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}>
          <View style={{
            flex: 1,
            borderRadius: 8,
            backgroundColor: '#FFFFFF',
            borderWidth: 1,
            borderColor: '#CBD5E1',
            paddingHorizontal: 10,
            paddingVertical: 5,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
          }}>
            <ThemedText style={{ fontSize: 11 }}>🔒</ThemedText>
            <ThemedText style={{ fontSize: 11, color: '#64748B', fontFamily: 'monospace' }} numberOfLines={1}>
              2ndhand.app/verify/{token ?? '…'}
            </ThemedText>
          </View>
        </View>

        <MarketplaceHeader title="ตรวจสอบใบรับรอง" back />

        <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
          {/* Brand header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 4 }}>
            <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: '#059669', alignItems: 'center', justifyContent: 'center' }}>
              <ThemedText style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>2N</ThemedText>
            </View>
            <ThemedText style={{ fontWeight: '800', letterSpacing: 1 }}>2NDHAND</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">· ตรวจสอบใบรับรอง</ThemedText>
          </View>

          {(!token || !/^[\w-]{20,100}$/.test(token)) ? (
            <Card>
              <ThemedText style={{ textAlign: 'center' }}>ลิงก์ใบรับรองไม่ถูกต้อง</ThemedText>
            </Card>
          ) : loading && <Loading label="กำลังตรวจสอบใบรับรอง" />}

          {error && (
            <Card>
              <ThemedText accessibilityRole="alert">{error}</ThemedText>
              <Button label="ลองใหม่" onPress={() => { setError(undefined); setData(undefined); setLoading(true); setAttempt(value => value + 1); }} />
            </Card>
          )}

          {data && data.status !== 'ISSUED' && (
            <View style={{
              borderRadius: 16,
              padding: 20,
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              borderWidth: 2,
              borderColor: 'rgba(239, 68, 68, 0.4)',
              alignItems: 'center',
              gap: 6,
            }}>
              <ThemedText style={{ fontSize: 40, color: '#DC2626' }}>✕</ThemedText>
              <ThemedText type="title" style={{ color: '#DC2626', fontWeight: '800' }}>
                {data.status === 'REVOKED' ? 'ใบรับรองนี้ถูกเพิกถอน' : 'ไม่สามารถยืนยันใบรับรองนี้ได้'}
              </ThemedText>
              <ThemedText style={{ textAlign: 'center', fontSize: 12, color: '#DC2626' }}>
                ไม่สามารถใช้ใบรับรองนี้เพื่อยืนยันผลการตรวจได้
              </ThemedText>
              <ThemedText style={{ fontFamily: 'monospace', fontWeight: '700', marginTop: 4 }}>
                {data.certificate_no}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                ออกเมื่อ {new Date(data.issued_at).toLocaleString('th-TH')}
              </ThemedText>
            </View>
          )}

          {data?.status === 'ISSUED' && (
            <>
              <View style={{
                borderRadius: 16,
                padding: 20,
                backgroundColor: 'rgba(16, 185, 129, 0.08)',
                borderWidth: 2,
                borderColor: 'rgba(16, 185, 129, 0.4)',
                alignItems: 'center',
                gap: 6,
              }}>
                <WondeeMascot variant="seal" size={80} />
                <ThemedText type="title" style={{ color: '#059669', fontWeight: '800' }}>
                  ใบรับรองนี้ใช้งานได้
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  ออกโดยศูนย์ตรวจสอบ 2NDHAND
                </ThemedText>
              </View>

              <Card>
                <ThemedText type="subtitle">ข้อมูลใบรับรอง</ThemedText>
                <View style={{ gap: 8, marginTop: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <ThemedText type="small" themeColor="textSecondary">เลขใบรับรอง</ThemedText>
                    <ThemedText type="smallBold" style={{ fontFamily: 'monospace' }}>{data.certificate_no}</ThemedText>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <ThemedText type="small" themeColor="textSecondary">ผลการตรวจ</ThemedText>
                    <ThemedText type="smallBold" style={{ color: '#059669' }}>
                      {outcomes[data.result]?.label ?? 'ผ่านการตรวจตามรายงาน'}
                    </ThemedText>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <ThemedText type="small" themeColor="textSecondary">ออกใบรับรองเมื่อ</ThemedText>
                    <ThemedText type="smallBold">{new Date(data.issued_at).toLocaleString('th-TH')}</ThemedText>
                  </View>
                </View>
                <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: 8 }}>
                  รับรองผลการตรวจ ณ วันที่ออกตามรายงาน
                </ThemedText>
              </Card>

              {/* 3 Checklist items */}
              <Card>
                <ThemedText type="subtitle">หัวข้อการตรวจสอบ</ThemedText>
                <View style={{ gap: 8, marginTop: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <ThemedText type="small" themeColor="textSecondary">ความแท้ของสินค้า</ThemedText>
                    <ThemedText type="smallBold" style={{ color: '#059669' }}>✓ ของแท้</ThemedText>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <ThemedText type="small" themeColor="textSecondary">สภาพสินค้า</ThemedText>
                    <ThemedText type="smallBold" style={{ color: data.result === 'PASS' ? '#059669' : '#D97706' }}>
                      {data.result === 'PASS' ? '✓ ตรงตามที่ประกาศ' : '⚠️ มีตำหนิเล็กน้อย'}
                    </ThemedText>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <ThemedText type="small" themeColor="textSecondary">ตรงกับรายละเอียดในประกาศ</ThemedText>
                    <ThemedText type="smallBold" style={{ color: '#059669' }}>✓ ตรง</ThemedText>
                  </View>
                </View>
              </Card>
            </>
          )}

          {/* PDPA Privacy Note matching prototype */}
          <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center', lineHeight: 18, paddingHorizontal: 12 }}>
            หน้านี้ไม่แสดงข้อมูลส่วนบุคคลของผู้ซื้อหรือผู้ขาย ตามนโยบายคุ้มครองข้อมูลส่วนบุคคล (PDPA)
          </ThemedText>

          <Button label="ดาวน์โหลดแอป 2NDHAND" variant="primary" onPress={() => {}} />
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}
