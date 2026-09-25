import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';
import { MarketplaceIcon } from './marketplace-icon';

export function MarketplaceNav({ selected }: { selected: 'home' | 'orders' | 'sell' | 'profile' }) {
  const theme = useTheme();
  return <View style={[styles.bar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
    {([
      { key: 'home', label: 'หน้าแรก', href: '/' },
      { key: 'orders', label: 'คำสั่งซื้อ', href: '/orders' },
      { key: 'sell', label: 'ขายของ', href: '/sell' },
      { key: 'profile', label: 'บัญชี', href: '/profile' },
    ] as const).map(tab => {
      const active = selected === tab.key;
      const color = active ? theme.primary : theme.textSecondary;
      return <Pressable key={tab.key} accessibilityRole="tab" accessibilityLabel={tab.label}
        accessibilityState={{ selected: active }} onPress={() => router.replace(tab.href)}
        style={({ pressed }) => [styles.tab, { opacity: pressed ? 0.65 : 1 }]}>
        <View style={[styles.icon, active && { backgroundColor: theme.backgroundSelected }]}>
          <MarketplaceIcon name={tab.key} color={color} />
        </View>
        <ThemedText type="small" style={{ color, fontSize: 11 }}>{tab.label}</ThemedText>
      </Pressable>;
    })}
  </View>;
}
const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: 1, paddingTop: 6, paddingBottom: 4 },
  tab: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 2 },
  icon: { width: 46, height: 28, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
