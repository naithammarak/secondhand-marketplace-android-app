import { MarketplaceLoginRequired } from '@/components/marketplace-login-required';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/auth-provider';
import { useVerification } from '@/verification/verification-provider';
import { MarketplaceHeader } from '@/components/marketplace-header';
import { Button, Card, Loading, Screen, styles } from '@/components/order-ui';
import { ThemedText } from '@/components/themed-text';

export default function SellScreen() {
  const auth = useAuth();
  const { state, store } = useVerification();
  const owner = auth.session?.user.id;
  const isSeller = auth.account?.source === 'backend' && auth.account.role === 'SELLER';
  useFocusEffect(useCallback(() => {
    if (owner && isSeller && state.owner === owner) void store.refresh();
  }, [isSeller, owner, state.owner, store]));
  if (auth.initializing) return <Screen><Loading label="กำลังตรวจสอบบัญชี" /></Screen>;
  if (!auth.session) return <MarketplaceLoginRequired destination={{ kind: 'sell' }} />;
  const record = state.owner === owner ? state.record : null;
  const ready = !auth.accountChecking && !auth.accountError && !state.loading && !state.refreshing && !state.loadError;
  return <Screen><SafeAreaView style={[styles.content, { flex: 1, alignSelf: 'center', gap: 0 }]}>
    <MarketplaceHeader title="ร้านค้าของฉัน" back />
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Card>
        <ThemedText type="title">ส่งต่อของที่คุณรัก</ThemedText>
        <ThemedText themeColor="textSecondary">จัดการสินค้าและเตรียมร้านของคุณให้พร้อมขาย</ThemedText>
      </Card>
      {auth.accountChecking || state.loading || state.refreshing ? <Loading label="กำลังตรวจสอบสิทธิ์ผู้ขาย" /> : null}
      {auth.accountError && <Button label="ตรวจสอบบัญชีอีกครั้ง" onPress={() => { void auth.retryAccount(); }} />}
      {state.loadError && isSeller && <Button label="ลองโหลดสถานะอีกครั้ง" onPress={() => { void store.refresh(); }} />}
      {!isSeller && !auth.accountChecking && <Card>
        <ThemedText>การลงขายต้องใช้บัญชีผู้ขายที่ผ่านการยืนยันตัวตน</ThemedText>
        {auth.account?.role === 'BUYER' ? <Button label="ขอเปิดร้านค้า" variant="primary" onPress={() => router.push('/seller-verification')} /> : <Button label="ดูบัญชีของฉัน" onPress={() => router.push('/profile')} />}
      </Card>}
      {isSeller && ready && record && <Card>
        <ThemedText type="subtitle">สถานะผู้ขาย</ThemedText>
        <ThemedText>{({ NOT_SUBMITTED: 'ยังไม่ได้ยืนยันตัวตน', PENDING: 'รอตรวจสอบ', APPROVED: 'ยืนยันตัวตนแล้ว', REJECTED: 'คำขอถูกปฏิเสธ' })[record.status]}</ThemedText>
        {record.status === 'APPROVED' ? <>
          <Button label="ลงขายสินค้า" variant="primary" onPress={() => router.push('/product/new')} />
          <Button label="สินค้าของฉัน" onPress={() => router.push('/product/mine')} />
        </> : <Button label="ดูการยืนยันตัวตน" onPress={() => router.push('/seller-verification')} />}
      </Card>}
    </ScrollView>
  </SafeAreaView></Screen>;
}
