import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
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
            backgroundColor: isDark ? theme.surface : '#ffffff',
            borderColor: isDark ? theme.border : '#e1e7ef',
            opacity: pressed ? 0.75 : 1,
          },
        ]}
      >
        <MarketplaceIcon name="orders" color="#10b981" size={19} />
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
          borderColor: '#10b981',
          backgroundColor: isDark ? theme.surface : '#ffffff',
          opacity: pressed ? 0.75 : 1,
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
    height: 42,
    paddingHorizontal: 16,
    borderRadius: 21,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginText: {
    color: '#10b981',
    fontSize: 13,
    fontWeight: '600',
  },
  bagButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badgeDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#f59e0b',
  },
});
