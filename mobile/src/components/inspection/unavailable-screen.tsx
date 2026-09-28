import { Redirect, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/auth-provider';
import { parseRouteId } from '@/orders/route-params';
import { MarketplaceHeader } from '../marketplace-header';
import { Button, Card, Loading, Screen, styles } from '../order-ui';
import { ThemedText } from '../themed-text';
import { UnavailableInspection } from './views';

/** Gated routes deliberately perform no inspection/evidence requests in this base. */
export function InspectionUnavailableScreen({ kind }: { kind: 'ship' | 'result' | 'queue' | 'work' }) {
  const auth = useAuth();
  const params = useLocalSearchParams<{ orderId?: string; inspectionId?: string }>();
  const title = { ship: 'ส่งสินค้าเข้าศูนย์', result: 'ผลการตรวจสินค้า', queue: 'งานตรวจสินค้า', work: 'ตรวจสินค้า' }[kind];
  if (!auth.session) return <Redirect href="/login" />;
  const customer = auth.account?.role === 'BUYER' || auth.account?.role === 'SELLER';
  const allowed = auth.account?.source === 'backend' && !auth.accountError &&
    (kind === 'queue' || kind === 'work' ? auth.account.role === 'INSPECTOR' : kind === 'ship' ? auth.account.role === 'SELLER' : customer);
  const validId = kind === 'queue' || parseRouteId(kind === 'work' ? params.inspectionId : params.orderId) !== null;
  return <Screen><SafeAreaView style={[styles.content, { flex: 1, alignSelf: 'center', gap: 0 }]}>
    <MarketplaceHeader title={title} back /><ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      {auth.accountChecking ? <Loading label="กำลังตรวจสอบสิทธิ์บัญชี" /> : !allowed ? <Card><ThemedText>บัญชีนี้ไม่มีสิทธิ์ใช้บริการนี้ หรือยังตรวจสอบบัญชีไม่สำเร็จ</ThemedText><Button label="ตรวจบัญชีอีกครั้ง" onPress={() => { void auth.retryAccount(); }} /></Card> : !validId ? <Card><ThemedText>รหัสรายการไม่ถูกต้อง</ThemedText></Card> : <UnavailableInspection />}
    </ScrollView></SafeAreaView></Screen>;
}
