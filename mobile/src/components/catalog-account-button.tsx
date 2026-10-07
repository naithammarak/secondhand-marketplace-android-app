import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { useAuth } from '@/auth/auth-provider';
import { useTheme } from '@/hooks/use-theme';
import { Colors } from '@/constants/theme';
import { MarketplaceIcon } from './marketplace-icon';
import { ThemedText } from './themed-text';

export function CatalogAccountButton() {
  const { session } = useAuth();
  const theme = useTheme();
  const isDark = theme.background === Colors.dark.background;

  if (session) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="คำสั่งซื้อ"
        onPress={() => router.push('/orders')}
        style={({ pressed }) => [
          styles.bagButton,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.border,
            transform: [{ scale: pressed ? 0.94 : 1 }],
          },
        ]}
      >
        <MarketplaceIcon name="orders" color={isDark ? '#f8fafc' : '#0f172a'} size={18} />
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="เข้าสู่ระบบ"
      onPress={() => router.push('/login')}
      style={({ pressed }) => [
        styles.loginButton,
        {
          backgroundColor: pressed ? '#10b981' : '#059669',
          transform: [{ scale: pressed ? 0.96 : 1 }],
        },
      ]}
    >
      <ThemedText style={styles.loginText}>
        เข้าสู่ระบบ
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  loginButton: {
    minHeight: 32,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginText: {
    color: '#ffffff',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  bagButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
});
