import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-provider';
import { Fonts, MaxContentWidth, Spacing, type MarketplaceTheme } from '@/constants/theme';
import { isProductMockModeEnabled } from '@/products/product-runtime';
import { createProductService, type MyProductSummary } from '@/services/product-service';

const productService = createProductService({
  baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
  mockMode: isProductMockModeEnabled(),
});
const statusLabels: Record<string, string> = {
  AVAILABLE: 'พร้อมขาย', RESERVED: 'จองแล้ว', SOLD: 'ขายแล้ว', CANCELLED: 'ยกเลิกแล้ว',
};

export default function MyProductsScreen() {
  const styles = makeStyles(useTheme());
  const { session } = useAuth();
  const accessToken = session?.access_token;
  const [items, setItems] = useState<MyProductSummary[]>([]);
  const [page, setPage] = useState(1);
  const [retryPage, setRetryPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const load = useCallback(async (nextPage: number) => {
    const current = ++generation.current;
    setRetryPage(nextPage);
    if (nextPage === 1) setLoading(true);
    else setLoadingMore(true);
    setError(null);
    try {
      const result = await productService.getMyProducts(nextPage, accessToken);
      if (current !== generation.current) return;
      setItems(current => nextPage === 1 ? result.items : [...current, ...result.items]);
      setPage(nextPage);
      setHasNext(result.hasNext);
    } catch (cause) {
      if (current !== generation.current) return;
      setError(cause instanceof Error ? cause.message : 'โหลดสินค้าของฉันไม่สำเร็จ');
    } finally {
      if (current === generation.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [accessToken]);

  useFocusEffect(useCallback(() => {
    void load(1);
    return () => { generation.current += 1; };
  }, [load]));

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SafeAreaView style={styles.content}>
          <ThemedText style={styles.title}>สินค้าของฉัน</ThemedText>
          <TouchableOpacity style={styles.button} onPress={() => router.push('/product/new')} accessibilityRole="button">
            <ThemedText style={styles.buttonText}>ลงขายสินค้า</ThemedText>
          </TouchableOpacity>
          {loading && <ActivityIndicator accessibilityLabel="กำลังโหลดสินค้าของฉัน" />}
          {!loading && items.length === 0 && !error && <ThemedText>ยังไม่มีสินค้า</ThemedText>}
          {!loading && items.map(item => (
            <TouchableOpacity
              key={item.id}
              style={styles.card}
              accessibilityRole="button"
              disabled={item.status !== 'AVAILABLE'}
              accessibilityLabel={item.status === 'AVAILABLE' ? `แก้ไขสินค้า ${item.name}` : `สินค้า ${item.name} ${statusLabels[item.status] ?? item.status}`}
              onPress={() => router.push({ pathname: '/product/[id]/edit', params: { id: item.id } })}
            >
              {item.mainImageUrl && <Image source={{ uri: item.mainImageUrl }} style={styles.image} />}
              <View style={styles.details}>
                <ThemedText style={styles.name}>{item.name}</ThemedText>
                <ThemedText>฿{item.price} · {statusLabels[item.status] ?? item.status}</ThemedText>
                {item.status === 'AVAILABLE' && <ThemedText style={styles.action}>แก้ไข / ยกเลิกการขาย</ThemedText>}
              </View>
            </TouchableOpacity>
          ))}
          {error && <View style={styles.errorBox}>
            <ThemedText accessibilityLiveRegion="polite">{error}</ThemedText>
            <TouchableOpacity style={styles.button} onPress={() => { void load(retryPage); }} accessibilityRole="button">
              <ThemedText style={styles.buttonText}>ลองใหม่อีกครั้ง</ThemedText>
            </TouchableOpacity>
          </View>}
          {hasNext && !error && !loading && (
            <TouchableOpacity style={styles.button} disabled={loadingMore} onPress={() => { void load(page + 1); }} accessibilityRole="button">
              <ThemedText style={styles.buttonText}>{loadingMore ? 'กำลังโหลด...' : 'โหลดเพิ่ม'}</ThemedText>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={{ minHeight: 48, justifyContent: 'center' }} onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/'); }} accessibilityRole="button">
            <ThemedText style={styles.action}>กลับ</ThemedText>
          </TouchableOpacity>
        </SafeAreaView>
      </ScrollView>
    </View>
  );
}

const makeStyles = (theme: MarketplaceTheme) => StyleSheet.create({
  page: { flex: 1, backgroundColor: theme.background },
  scroll: { flexGrow: 1, alignItems: 'center' },
  content: { width: '100%', maxWidth: MaxContentWidth, padding: Spacing.three, gap: Spacing.three },
  title: { fontFamily: Fonts.sans, fontSize: 22, fontWeight: '700', color: theme.text },
  button: { backgroundColor: theme.primary, minHeight: 48, borderRadius: 16, padding: Spacing.three, alignItems: 'center' },
  buttonText: { color: theme.onPrimary, fontWeight: '700' },
  card: { backgroundColor: theme.surface, borderRadius: 16, padding: Spacing.three, flexDirection: 'row', gap: Spacing.three },
  image: { width: 72, height: 72, borderRadius: 8 },
  details: { flex: 1, gap: Spacing.one },
  name: { color: theme.text, fontFamily: Fonts.sans, fontSize: 16, fontWeight: '700' },
  action: { color: theme.primary, fontWeight: '700' },
  errorBox: { gap: Spacing.two },
});
