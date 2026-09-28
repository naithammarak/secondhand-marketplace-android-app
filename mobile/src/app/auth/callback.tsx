import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Button, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/auth-provider';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { marketplaceReturn } from '@/auth/marketplace-return-instance';

export default function AuthCallbackScreen() {
  const { session, initializing, account, accountChecking, accountError, retryAccount } = useAuth();
  const redirected = useRef(false);
  const ready = !!session && account?.source === 'backend' && !!account.role && !accountChecking && !accountError;
  useEffect(() => {
    if (!ready || redirected.current) return;
    let active = true;
    void marketplaceReturn.peek().then(destination => {
      if (!active) return;
      redirected.current = true;
      if (destination?.kind === 'checkout') router.replace({ pathname: '/checkout/[productId]', params: { productId: String(destination.productId) } });
      else router.replace(destination?.kind === 'orders' ? '/orders' : destination?.kind === 'sell' ? '/sell' : '/profile');
      void marketplaceReturn.clear().catch(() => undefined);
    }).catch(() => { if (active) router.replace('/profile'); });
    return () => { active = false; };
  }, [ready]);
  return <ThemedView style={styles.container}>
    <SafeAreaView style={styles.content}>
      {(initializing || accountChecking || (!session && !accountError)) && <ActivityIndicator />}
      <ThemedText>{ready ? 'เข้าสู่ระบบและตรวจบัญชีสำเร็จ' : accountError ? 'ตรวจสอบบัญชีไม่สำเร็จ กรุณาลองใหม่' : 'กำลังประมวลผลการเข้าสู่ระบบ'}</ThemedText>
      {!!session && !!accountError && <Button title="ลองตรวจบัญชีอีกครั้ง" onPress={() => { void retryAccount(); }} />}
      {!initializing && !ready && <Button title="กลับไปลองใหม่" onPress={() => router.replace('/login')} />}
    </SafeAreaView>
  </ThemedView>;
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { alignItems: 'center', gap: Spacing.three, padding: Spacing.four },
});
