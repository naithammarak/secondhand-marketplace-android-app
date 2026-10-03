import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useAuth } from '@/auth/auth-provider';
import { useTheme } from '@/hooks/use-theme';
import { useThemePreference } from '@/theme/theme-provider';
import { ThemedText } from './themed-text';

export type NavTabKey = 'home' | 'orders' | 'sell' | 'profile' | 'my-shop' | 'shop-orders';

type TabIconKey = 'home' | 'orders' | 'my-shop' | 'shop-orders' | 'profile';

// ไอคอนเส้นตาม design reference (tabbar-script)
function TabIcon({ name, color, size = 22 }: { name: TabIconKey; color: string; size?: number }) {
  const stroke = { stroke: color, strokeWidth: name === 'my-shop' ? 2.2 : 2, fill: 'none' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'home' && (
        <Path {...stroke} strokeLinejoin="round" d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
      )}
      {name === 'orders' && (
        <Path {...stroke} strokeLinejoin="round" d="M16 11V7a4 4 0 0 0-8 0v4M5 9h14l1 12H4L5 9z" />
      )}
      {name === 'my-shop' && (
        <Path
          {...stroke}
          strokeLinejoin="round"
          d="M4 9.5 5.5 4h13L20 9.5M4 9.5V20h16V9.5M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0M10 20v-5h4v5"
        />
      )}
      {name === 'shop-orders' && (
        <Path
          {...stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M7 3h10a1 1 0 0 1 1 1v17l-3-2-3 2-3-2-3 2V4a1 1 0 0 1 1-1zM9 8h6M9 12h6"
        />
      )}
      {name === 'profile' && (
        <>
          <Circle {...stroke} cx={12} cy={8} r={4} />
          <Path {...stroke} strokeLinecap="round" d="M4 21a8 8 0 0 1 16 0" />
        </>
      )}
    </Svg>
  );
}

export function MarketplaceNav({ selected }: { selected: NavTabKey }) {
  const theme = useTheme();
  const { scheme } = useThemePreference();
  const isDark = scheme === 'dark';
  const auth = useAuth();

  const isSeller = auth.account?.source === 'backend' && auth.account.role === 'SELLER';

  const activeColor = isDark ? '#34d399' : '#059669';
  const inactiveColor = isDark ? '#64748b' : '#94a3b8';
  const barColor = isDark ? '#121622' : '#ffffff';

  const buyerTabs = [
    { key: 'home', label: 'หน้าแรก', href: '/' },
    { key: 'orders', label: 'คำสั่งซื้อ', href: '/orders' },
    { key: 'profile', label: 'โปรไฟล์', href: '/profile' },
  ] as const;

  const sellerTabs = [
    { key: 'home', label: 'หน้าแรก', href: '/' },
    { key: 'orders', label: 'ที่ฉันซื้อ', href: '/orders?view=buyer' },
    { key: 'my-shop', label: 'ร้านของฉัน', href: '/product/mine', isRaised: true },
    { key: 'shop-orders', label: 'ออเดอร์ร้าน', href: '/orders?view=seller' },
    { key: 'profile', label: 'โปรไฟล์', href: '/profile' },
  ] as const;

  const tabs: readonly { key: TabIconKey; label: string; href: string; isRaised?: boolean }[] = isSeller
    ? sellerTabs
    : buyerTabs;

  return (
    <View style={[styles.bar, { backgroundColor: barColor, borderColor: theme.border }]}>
      {tabs.map(tab => {
        const active = selected === tab.key;
        const color = active ? activeColor : inactiveColor;

        if (tab.isRaised) {
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: active }}
              onPress={() => router.replace(tab.href as never)}
              style={({ pressed }) => [styles.tab, { transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
              <View
                style={[
                  styles.fab,
                  { borderColor: barColor },
                  active && { transform: [{ translateY: -2 }, { scale: 1.04 }] },
                ]}>
                <LinearGradient
                  colors={['#10b981', '#059669']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <TabIcon name="my-shop" color="#ffffff" size={24} />
              </View>
              <ThemedText style={[styles.label, { color, fontWeight: active ? '700' : '400' }]}>
                {tab.label}
              </ThemedText>
            </Pressable>
          );
        }

        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: active }}
            onPress={() => router.replace(tab.href as never)}
            style={({ pressed }) => [styles.tab, { transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
            <View
              style={[
                styles.pill,
                active && { backgroundColor: isDark ? 'rgba(16,185,129,0.14)' : '#d1fae5' },
              ]}>
              <TabIcon name={tab.key} color={color} />
            </View>
            <ThemedText style={[styles.label, { color, fontWeight: active ? '700' : '400' }]}>
              {tab.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: 1, paddingTop: 6, paddingBottom: 8, paddingHorizontal: 6 },
  tab: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'flex-end', gap: 3 },
  pill: { width: 44, height: 26, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 10, lineHeight: 12 },
  fab: {
    width: 54,
    height: 54,
    marginTop: -30,
    borderRadius: 27,
    borderWidth: 5,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
});
