import { useCallback, useState } from 'react';
import { GeometricMascot } from './wondee/brand';
import { router, useFocusEffect } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useAuth } from '@/auth/auth-provider';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';
import { MarketplaceIcon } from './marketplace-icon';
import { isCatalogOnlyMode } from '@/runtime/catalog-capability';

export type NavTabKey = 'home' | 'orders' | 'sell' | 'profile' | 'my-shop' | 'shop-orders';

export function MarketplaceNav({ selected }: { selected: NavTabKey }) {
  const catalogOnly = isCatalogOnlyMode();
  const theme = useTheme();
  const auth = useAuth();
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));

  const isSeller = auth.account?.source === 'backend' && auth.account.role === 'SELLER';
  if (catalogOnly) return null;

  const activeColor = '#10b981';
  const inactiveColor = '#94a3b8';

  const buyerTabs = [
    { key: 'home', label: 'หน้าแรก', href: '/' },
    { key: 'orders', label: 'คำสั่งซื้อ', href: '/orders' },
    { key: 'profile', label: 'ฉัน', href: '/profile' },
  ] as const;

  const sellerTabs = [
    { key: 'home', label: 'หน้าแรก', href: '/' },
    { key: 'orders', label: 'ที่ฉันซื้อ', href: '/orders?view=buyer' },
    { key: 'my-shop', label: 'ร้านของฉัน', href: '/product/mine', isRaised: true },
    { key: 'shop-orders', label: 'ออเดอร์ร้าน', href: '/orders?view=seller' },
    { key: 'profile', label: 'ฉัน', href: '/profile' },
  ] as const;

  const tabs = isSeller ? sellerTabs : buyerTabs;

  return (
    <View style={[styles.bar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {tabs.map((tab: any) => {
        const active = selected === tab.key;
        const color = active ? activeColor : inactiveColor;
        const iconName =
          tab.key === 'home' && active
            ? 'home-filled'
            : tab.key === 'shop-orders'
              ? 'orders'
              : tab.key === 'my-shop'
                ? 'sell'
                : tab.key;

        if (tab.isRaised) {
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: active }}
              onPress={() => router.replace(tab.href)}
              style={({ pressed }) => [styles.raisedTab, { opacity: pressed ? 0.85 : 1 }]}>
              <View style={[styles.raisedCircle, active && styles.raisedCircleActive]}>
                <ThemedText style={{ fontSize: 20 }}>🏪</ThemedText>
              </View>
              <ThemedText
                style={{
                  color: active ? activeColor : inactiveColor,
                  fontSize: 10,
                  fontWeight: '700',
                  marginTop: 1,
                }}>
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
            onPress={() => router.replace(tab.href)}
            style={({ pressed }) => [styles.tab, { opacity: pressed ? 0.65 : 1 }]}>
            <View style={styles.icon}>
              {tab.key === 'profile' ? (
                <GeometricMascot
                  shape="circle"
                  size={24}
                  color={active ? activeColor : inactiveColor}
                  eyeColor={active ? '#022c22' : '#334155'}
                  animate={focused}
                />
              ) : (
                <MarketplaceIcon name={iconName} color={color} size={22} />
              )}
            </View>
            <ThemedText
              style={{
                color,
                fontSize: 11,
                fontWeight: active ? '600' : '400',
                marginTop: 2,
              }}>
              {tab.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: 1, paddingTop: 6, paddingBottom: 6 },
  tab: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 1 },
  raisedTab: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'flex-start', marginTop: -14 },
  raisedCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 6,
  },
  raisedCircleActive: {
    borderWidth: 2,
    borderColor: '#34d399',
  },
  icon: { height: 26, alignItems: 'center', justifyContent: 'center' },
});
