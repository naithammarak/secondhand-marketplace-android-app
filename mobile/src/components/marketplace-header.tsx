import { WondeeWordmark } from './wondee/brand';
import type { ReactNode } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';

/** หัวจอแบบ design (app-header-nav): ปุ่มกลับ 36px + ชื่อหน้า 14px ตัวหนา; หน้าแท็บไม่มีปุ่มกลับใช้ 16px */
export function MarketplaceHeader({ title, back, trailing }: { title: string; back?: boolean; trailing?: ReactNode }) {
  const theme = useTheme();
  const barColor = theme.background === '#0c0e14' ? '#121622' : '#ffffff';
  return <View style={[styles.header, back ? styles.headerBack : styles.headerTab, { borderColor: theme.border, backgroundColor: barColor }]}>
    {back && <Pressable accessibilityRole="button" accessibilityLabel="กลับ" hitSlop={8}
      style={styles.back} onPress={() => router.canGoBack() ? router.back() : router.replace('/')}>
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <Path d="M15 19l-7-7 7-7" stroke={theme.text} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </Pressable>}
    <View style={styles.title}>{title === 'ค้นหาสินค้า' ? <WondeeWordmark />
      : <ThemedText accessibilityRole="header" numberOfLines={1} style={[back ? styles.titleBack : styles.titleTab, { color: theme.text }]}>{title}</ThemedText>}</View>
    {trailing}
  </View>;
}
const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1 },
  headerBack: { paddingHorizontal: 12, paddingVertical: 10 },
  headerTab: { paddingHorizontal: 16, paddingVertical: 12 },
  title: { flex: 1, minWidth: 0 },
  back: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  titleBack: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  titleTab: { fontSize: 16, lineHeight: 24, fontWeight: '700' },
});
