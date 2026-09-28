import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAuth } from '@/auth/auth-provider';
import { useTheme } from '@/hooks/use-theme';
import { MarketplaceIcon } from './marketplace-icon';
import { ThemedText } from './themed-text';

export function CatalogAccountButton() {
  const { session } = useAuth();
  const theme = useTheme();

  if (session) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="คำสั่งซื้อ"
        onPress={() => router.push('/orders')}
        style={({ pressed }) => [
          styles.bagButton,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
            opacity: pressed ? 0.75 : 1,
          },
        ]}
      >
        <MarketplaceIcon name="orders" color={theme.text} size={20} />
        <View style={styles.badgeDot} />
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
          borderColor: theme.accent,
          backgroundColor: theme.surface,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <ThemedText style={[styles.loginText, { color: theme.accent }]}>
        เข้าสู่ระบบ
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  loginButton: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginText: {
    fontSize: 14,
    fontWeight: '600',
  },
  bagButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badgeDot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#f59e0b',
  },
});
