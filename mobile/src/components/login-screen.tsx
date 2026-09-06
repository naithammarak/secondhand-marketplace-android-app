import { useEffect, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Button, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createLoginController, type LoginAdapter, type LoginState } from '@/auth/login-controller';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/auth/auth-provider';

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

function roleMessage(role: string | null | undefined) {
  if (role === 'BUYER') return 'บทบาทผู้ซื้อ';
  if (role === 'SELLER') return 'บทบาทผู้ขาย';
  if (role) return 'บทบาทได้รับการจัดการโดยระบบ';
  return 'ยังไม่ได้เลือกบทบาทผู้ซื้อหรือผู้ขาย';
}

export function LoginScreen({ adapter: adapterOverride }: { adapter?: LoginAdapter }) {
  const auth = useAuth();
  const adapter = adapterOverride ?? auth.loginAdapter;
  const [controller] = useState(() => createLoginController(adapter));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => () => controller.cancel(), [controller]);
  const busy = state === 'waiting' || state === 'processing';
  if (auth.initializing) return (
    <ThemedView style={styles.container}><ActivityIndicator accessibilityLabel="กำลังกู้คืนเซสชัน" /></ThemedView>
  );
  if (auth.session && (auth.account || auth.accountChecking || auth.accountError)) return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.content}>
        <ThemedText type="subtitle" style={styles.statusTitle}>
          {auth.account ? 'เข้าสู่ระบบแล้ว' : 'กำลังตรวจสอบบัญชี'}
        </ThemedText>
        {auth.accountChecking && <ActivityIndicator accessibilityLabel="กำลังตรวจสอบบัญชี" />}
        {auth.account && <ThemedText>{roleMessage(auth.account.role)}</ThemedText>}
        {auth.accountError && <ThemedText accessibilityLiveRegion="polite">
          {messages[auth.accountError]}
        </ThemedText>}
        {auth.account?.source === 'mock' && (
          <ThemedText type="small">กำลังใช้ผลจำลอง /me จนกว่า Backend จะพร้อม</ThemedText>
        )}
        {auth.accountError && <Button title="ลองตรวจบัญชีอีกครั้ง" disabled={auth.accountChecking}
          onPress={() => { void auth.retryAccount(); }} />}
        <Button title="ออกจากระบบ" onPress={() => { void auth.logout(); }} />
      </SafeAreaView>
    </ThemedView>
  );
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.content}>
        <ThemedText type="subtitle">เข้าสู่ระบบ</ThemedText>
        <ThemedText accessibilityLiveRegion="polite">{messages[state]}</ThemedText>
        {busy && <ActivityIndicator accessibilityLabel="กำลังเข้าสู่ระบบ" />}
        {state !== 'success' && <Button title="เข้าสู่ระบบด้วย Google" disabled={busy}
          onPress={() => { void controller.start(); }} />}
        {state === 'waiting' && <Button title="ยกเลิก" onPress={controller.cancel} />}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { width: '100%', maxWidth: MaxContentWidth, padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four, gap: Spacing.three },
  statusTitle: { alignSelf: 'stretch', flexShrink: 1, textAlign: 'center' },
});
