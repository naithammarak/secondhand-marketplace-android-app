import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Button, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/auth-provider';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

export default function AuthCallbackScreen() {
  const { session, initializing } = useAuth();
  useEffect(() => { if (session) router.replace('/'); }, [session]);
  return <ThemedView style={styles.container}>
    <SafeAreaView style={styles.content}>
      {(initializing || !session) && <ActivityIndicator />}
      <ThemedText>{session ? 'เข้าสู่ระบบสำเร็จ' : 'กำลังประมวลผลการเข้าสู่ระบบ'}</ThemedText>
      {!initializing && !session && <Button title="กลับไปลองใหม่" onPress={() => router.replace('/')} />}
    </SafeAreaView>
  </ThemedView>;
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { alignItems: 'center', gap: Spacing.three, padding: Spacing.four },
});
