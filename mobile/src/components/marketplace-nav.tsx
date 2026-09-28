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

  const activeColor = '#10b981';
  const inactiveColor = '#94a3b8';

  return <View style={[styles.bar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
    {([
      { key: 'home', label: 'หน้าแรก', href: '/' },
      { key: 'orders', label: 'คำสั่งซื้อ', href: '/orders' },
      { key: 'profile', label: 'ฉัน', href: '/profile' },
    ] as const).map(tab => {
      const active = selected === tab.key;
      const color = active ? activeColor : inactiveColor;
      const iconName = tab.key === 'home' && active ? 'home-filled' : tab.key;
      return <Pressable key={tab.key} accessibilityRole="tab" accessibilityLabel={tab.label}
        accessibilityState={{ selected: active }} onPress={() => router.replace(tab.href)}
        style={({ pressed }) => [styles.tab, { opacity: pressed ? 0.65 : 1 }]}>
        <View style={styles.icon}>
          {tab.key === 'profile' ? (
            <WondeeMascot size={22} outline={!active} animate={active && focused} />
          ) : (
            <MarketplaceIcon name={iconName} color={color} size={22} />
          )}
        </View>
        <ThemedText style={{ color, fontSize: 11, fontWeight: active ? '600' : '400', marginTop: 2 }}>
          {tab.label}
        </ThemedText>
      </Pressable>;
    })}
  </View>;
}
const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: 1, paddingTop: 6, paddingBottom: 6 },
  tab: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 1 },
  icon: { height: 26, alignItems: 'center', justifyContent: 'center' },
});
