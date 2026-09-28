import { useCallback, useState } from 'react';
import { WondeeMascot } from './wondee/brand';
import { router, useFocusEffect } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';
import { MarketplaceIcon } from './marketplace-icon';

export function MarketplaceNav({ selected }: { selected: 'home' | 'orders' | 'sell' | 'profile' }) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  return <View style={[styles.bar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
    {([
      { key: 'home', label: 'หน้าแรก', href: '/' },
      { key: 'orders', label: 'คำสั่งซื้อ', href: '/orders' },
      { key: 'profile', label: 'ฉัน', href: '/profile' },
    ] as const).map(tab => {
      const active = selected === tab.key;
      const color = active ? theme.accent : theme.textSecondary;
      return <Pressable key={tab.key} accessibilityRole="tab" accessibilityLabel={tab.label}
        accessibilityState={{ selected: active }} onPress={() => router.replace(tab.href)}
        style={({ pressed }) => [styles.tab, { opacity: pressed ? 0.65 : 1 }]}>
        <View style={[styles.icon, active && { backgroundColor: theme.backgroundSelected }]}>
          {tab.key === 'profile' ? <WondeeMascot size={32} outline={!active} animate={active && focused} /> : <MarketplaceIcon name={tab.key} color={color} size={26} />}
        </View>
        <ThemedText type="small" style={{ color, fontSize: 12 }}>{tab.label}</ThemedText>
      </Pressable>;
    })}
  </View>;
}
const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: 1, paddingTop: 6, paddingBottom: 4 },
  tab: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 2 },
  icon: { width: 46, height: 34, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
