import { marketplaceReturn } from '@/auth/marketplace-return-instance';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/auth-provider';
import { createLoginController, type LoginAdapter, type LoginState } from '@/auth/login-controller';
import { ThemedText } from './themed-text';
import { Button, Card, Loading, Screen, styles } from './order-ui';
import { MarketplaceHeader } from './marketplace-header';
import { WondeeMascot, WondeeWordmark } from './wondee/brand';
const messages: Record<LoginState, string> = {
  ready: 'เข้าสู่ระบบเพื่อใช้งานบัญชีของคุณ',
  unavailable: 'ยังไม่เปิดให้เข้าสู่ระบบ กรุณาลองใหม่ภายหลัง',
  waiting: 'กำลังเข้าสู่ระบบผ่าน Google',
  processing: 'กำลังตรวจสอบบัญชี',
  cancelled: 'ยกเลิกการเข้าสู่ระบบแล้ว คุณสามารถลองใหม่ได้',
  'oauth-error': 'เข้าสู่ระบบ Google ไม่สำเร็จ กรุณาลองใหม่',
  'backend-error': 'ตรวจสอบบัญชีไม่สำเร็จ กรุณาลองใหม่',
  unauthorized: 'เซสชันไม่พร้อมใช้งาน กรุณาเข้าสู่ระบบใหม่',
  forbidden: 'บัญชียังไม่ได้รับสิทธิ์ใช้งาน กรุณาติดต่อผู้ดูแล',
  'network-error': 'เชื่อมต่อบริการตรวจบัญชีไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่',
  'server-error': 'บริการตรวจสอบบัญชีขัดข้อง กรุณาลองใหม่ภายหลัง',
  success: 'เข้าสู่ระบบและตรวจสอบบัญชีสำเร็จ',
};

export function LoginScreen({ adapter: adapterOverride }: { adapter?: LoginAdapter }) {
  const auth = useAuth();
  const [controller] = useState(() => createLoginController(adapterOverride ?? auth.loginAdapter));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const hadSession = useRef(false);
  const redirected = useRef(false);
  useEffect(() => () => controller.cancel(), [controller]);
  useEffect(() => {
    if (state === 'cancelled') void marketplaceReturn.clear().catch(() => undefined);
  }, [state]);
  useEffect(() => {
    if (auth.session) {
      hadSession.current = true;
    } else if (hadSession.current) {
      // ออกจากระบบแล้วรีเซ็ตสถานะ เพื่อให้ปุ่ม Google กลับมาและล็อกอินซ้ำได้
      hadSession.current = false;
      redirected.current = false;
      controller.reset();
    }
  }, [auth.session, controller]);
  useEffect(() => {
    if (!auth.session || auth.initializing || auth.accountChecking || auth.accountError
      || auth.account?.source !== 'backend' || !auth.account.role || state === 'cancelled'
      || redirected.current) return;
    let active = true;
    void marketplaceReturn.peek().then(destination => {
      if (!active || !destination) return;
      redirected.current = true;
      if (destination.kind === 'checkout') router.replace({ pathname: '/checkout/[productId]', params: { productId: String(destination.productId) } });
      else router.replace(destination.kind === 'orders' ? '/orders' : '/sell');
      void marketplaceReturn.clear().catch(() => undefined);
    }).catch(() => { redirected.current = false; });
    return () => { active = false; };
  }, [auth.session, auth.initializing, auth.accountChecking, auth.accountError, auth.account, state]);
  const accountReady = auth.account?.source === 'backend' && !!auth.account.role;
  const busy = state === 'waiting' || state === 'processing';
  return <Screen><SafeAreaView style={[styles.content, { flex: 1, alignSelf: 'center', gap: 0 }]}>
    <MarketplaceHeader title="เข้าสู่ระบบ" back />
    <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, justifyContent: 'center', gap: 24 }}>
      <View style={{ alignItems: 'center', gap: 16 }}><WondeeWordmark /><WondeeMascot size={96} />
        <ThemedText type="title" style={{ textAlign: 'center' }}>ของรักชิ้นเดิม เรื่องราวครั้งใหม่</ThemedText>
        <ThemedText themeColor="textSecondary" style={{ textAlign: 'center' }}>เลือกซื้อและส่งต่อสินค้ามือสองกับวนดี</ThemedText></View>
      <Card>
        <ThemedText accessibilityLiveRegion="polite">{auth.accountError ? messages[auth.accountError] : messages[state]}</ThemedText>
        {(auth.initializing || auth.accountChecking) && <Loading label="กำลังตรวจสอบบัญชี" />}
        {!auth.session && <Button label="เข้าสู่ระบบด้วย Google" variant="primary" busy={busy} onPress={() => { void controller.start(); }} />}
        {busy && <Button label="ยกเลิกการเข้าสู่ระบบ" onPress={() => controller.cancel()} />}
        {!!auth.session && auth.accountError && <Button label="ลองตรวจบัญชีอีกครั้ง" onPress={() => { void auth.retryAccount(); }} />}
        {!!auth.session && !auth.accountError && !auth.accountChecking && !accountReady && <><ThemedText accessibilityRole="alert">บริการบัญชียังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง</ThemedText><Button label="อัปเดตบัญชี" onPress={() => { void auth.retryAccount(); }} /></>}
        {!!auth.session && accountReady && !auth.accountError && !auth.accountChecking && <Button label="ไปที่โปรไฟล์" variant="primary" onPress={() => router.replace('/profile')} />}
        <Button label="ดูสินค้าก่อน" onPress={() => { controller.cancel(); void marketplaceReturn.clear().catch(() => undefined).then(() => router.replace('/')); }} />
      </Card>
      <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>บัญชีใหม่เริ่มเป็นผู้ซื้อ คุณขอเปิดร้านได้จากโปรไฟล์หลังเข้าสู่ระบบ</ThemedText>
    </ScrollView>
  </SafeAreaView></Screen>;
}
