import { WondeeWordmark } from './wondee/brand';
import type { ReactNode } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';
import { MarketplaceIcon } from './marketplace-icon';

export function MarketplaceHeader({ title, back, trailing }: { title: string; back?: boolean; trailing?: ReactNode }) {
  const theme = useTheme();
  return <View style={[styles.header, { borderColor: theme.border, backgroundColor: theme.surface }]}>
    {back && <Pressable accessibilityRole="button" accessibilityLabel="กลับ" hitSlop={8}
      style={styles.back} onPress={() => router.canGoBack() ? router.back() : router.replace('/')}>
      <MarketplaceIcon name="back" />
    </Pressable>}
    <View style={styles.title}>{title === 'ค้นหาสินค้า' ? <WondeeWordmark /> : <ThemedText type="subtitle" accessibilityRole="header">{title}</ThemedText>}</View>
    {trailing}
  </View>;
}
const styles = StyleSheet.create({
  header: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  title: { flex: 1 }, back: { minWidth: 48, minHeight: 48, justifyContent: 'center' },
});
