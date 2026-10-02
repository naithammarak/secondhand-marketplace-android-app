import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-provider';
import { Fonts, MaxContentWidth, Spacing, type MarketplaceTheme } from '@/constants/theme';
import { isProductMockModeEnabled } from '@/products/product-runtime';
import { createProductService, type MyProductSummary } from '@/services/product-service';
import { MarketplaceNav } from '@/components/marketplace-nav';
import { SellerReviewSummary } from '@/components/seller-reviews-modal';
import { useProfile } from '@/profile/use-profile';

const productService = createProductService({
  baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
  mockMode: isProductMockModeEnabled(),
});

const statusLabels: Record<string, string> = {
  AVAILABLE: 'พร้อมขาย',
  RESERVED: 'จองแล้ว',
  SOLD: 'ขายแล้ว',
  CANCELLED: 'ยกเลิกแล้ว',
};

const filterOptions = [
  { key: 'ALL', label: 'ทั้งหมด' },
  { key: 'AVAILABLE', label: 'พร้อมขาย' },
  { key: 'RESERVED', label: 'จองแล้ว' },
  { key: 'SOLD', label: 'ขายแล้ว' },
  { key: 'CANCELLED', label: 'ยกเลิกแล้ว' },
] as const;

export default function MyProductsScreen() {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const { session } = useAuth();
  const profile = useProfile();
  const accessToken = session?.access_token;
  const [items, setItems] = useState<MyProductSummary[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'AVAILABLE' | 'RESERVED' | 'SOLD' | 'CANCELLED'>('ALL');
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
      setItems(currentItems => nextPage === 1 ? result.items : [...currentItems, ...result.items]);
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

  const counts = useMemo(() => {
    return {
      available: items.filter(i => i.status === 'AVAILABLE').length,
      reserved: items.filter(i => i.status === 'RESERVED').length,
      sold: items.filter(i => i.status === 'SOLD').length,
    };
  }, [items]);

  const displayedItems = useMemo(() => {
    if (filter === 'ALL') return items;
    return items.filter(i => i.status === filter);
  }, [items, filter]);

  return (
    <View style={styles.page}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.content}>
            {/* Header: ร้านของฉัน */}
            <View style={styles.header}>
              <View>
                <ThemedText style={styles.title}>ร้านของฉัน</ThemedText>
                <ThemedText style={styles.verifiedBadge}>
                  ✓ ผู้ขายยืนยันตัวตนแล้ว
                </ThemedText>
                <SellerReviewSummary sellerId={profile.profile?.role === 'SELLER' ? profile.profile.id : null} />
              </View>
            </View>

            {/* Stats Summary */}
            <View style={styles.statsGrid}>
              <View style={styles.statBox}>
                <ThemedText style={styles.statNumberPrimary}>{counts.available}</ThemedText>
                <ThemedText style={styles.statLabel}>พร้อมขาย</ThemedText>
              </View>
              <View style={styles.statBox}>
                <ThemedText style={styles.statNumberWarning}>{counts.reserved}</ThemedText>
                <ThemedText style={styles.statLabel}>จองแล้ว</ThemedText>
              </View>
              <View style={styles.statBox}>
                <ThemedText style={styles.statNumberSecondary}>{counts.sold}</ThemedText>
                <ThemedText style={styles.statLabel}>ขายแล้ว</ThemedText>
              </View>
            </View>

            {/* Filter Chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
              {filterOptions.map(opt => {
                const isSelected = filter === opt.key;
                const countSuffix = opt.key === 'ALL' ? ` (${items.length})` : '';
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setFilter(opt.key)}
                    style={[
                      styles.filterChip,
                      isSelected ? styles.filterChipActive : styles.filterChipInactive,
                    ]}
                  >
                    <ThemedText style={[styles.filterChipText, isSelected ? styles.filterChipTextActive : styles.filterChipTextInactive]}>
                      {opt.label}{countSuffix}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Add product button */}
            <TouchableOpacity
              style={styles.button}
              onPress={() => router.push('/product/new')}
              accessibilityRole="button"
              accessibilityLabel="ลงขายสินค้า"
            >
              <ThemedText style={styles.buttonText}>+ ลงขายสินค้าเพิ่ม</ThemedText>
            </TouchableOpacity>

            {loading && <ActivityIndicator accessibilityLabel="กำลังโหลดสินค้าของฉัน" style={{ marginVertical: 24 }} />}
            {!loading && displayedItems.length === 0 && !error && (
              <View style={styles.emptyBox}>
                <ThemedText style={{ fontSize: 32 }}>🛍️</ThemedText>
                <ThemedText style={styles.emptyText}>ยังไม่มีสินค้า</ThemedText>
              </View>
            )}

            {!loading && displayedItems.map(item => (
              <TouchableOpacity
                key={item.id}
                style={styles.card}
                accessibilityRole="button"
                disabled={item.status !== 'AVAILABLE'}
                accessibilityLabel={
                  item.status === 'AVAILABLE'
                    ? `แก้ไขสินค้า ${item.name}`
                    : `สินค้า ${item.name} ${statusLabels[item.status] ?? item.status}`
                }
                onPress={() => router.push({ pathname: '/product/[id]/edit', params: { id: item.id } })}
              >
                {item.mainImageUrl ? (
                  <Image source={{ uri: item.mainImageUrl }} style={styles.image} />
                ) : (
                  <View style={styles.imagePlaceholder}>
                    <ThemedText style={{ fontSize: 24 }}>📦</ThemedText>
                  </View>
                )}
                <View style={styles.details}>
                  <ThemedText style={styles.name} numberOfLines={1}>{item.name}</ThemedText>
                  <ThemedText style={styles.price}>฿{item.price}</ThemedText>
                  <View style={styles.badgeRow}>
                    <View style={[
                      styles.statusBadge,
                      item.status === 'AVAILABLE'
                        ? styles.badgeSuccess
                        : item.status === 'RESERVED'
                          ? styles.badgeWarning
                          : styles.badgeMuted,
                    ]}>
                      <ThemedText style={[
                        styles.statusBadgeText,
                        item.status === 'AVAILABLE'
                          ? styles.badgeTextSuccess
                          : item.status === 'RESERVED'
                            ? styles.badgeTextWarning
                            : styles.badgeTextMuted,
                      ]}>
                        {statusLabels[item.status] ?? item.status}
                      </ThemedText>
                    </View>
                  </View>
                  {item.status === 'AVAILABLE' && (
                    <ThemedText style={styles.action}>แก้ไข / ยกเลิกการขาย</ThemedText>
                  )}
                </View>
                <View style={styles.actionButton}>
                  <ThemedText style={styles.actionButtonText}>
                    {item.status === 'AVAILABLE' ? 'แก้ไข' : 'ดู'}
                  </ThemedText>
                </View>
              </TouchableOpacity>
            ))}

            {error && (
              <View style={styles.errorBox}>
                <ThemedText accessibilityLiveRegion="polite">{error}</ThemedText>
                <TouchableOpacity style={styles.button} onPress={() => { void load(retryPage); }} accessibilityRole="button">
                  <ThemedText style={styles.buttonText}>ลองใหม่อีกครั้ง</ThemedText>
                </TouchableOpacity>
              </View>
            )}

            {hasNext && !error && !loading && (
              <TouchableOpacity
                style={styles.loadMoreButton}
                disabled={loadingMore}
                onPress={() => { void load(page + 1); }}
                accessibilityRole="button"
              >
                <ThemedText style={styles.loadMoreText}>{loadingMore ? 'กำลังโหลด...' : 'โหลดเพิ่ม'}</ThemedText>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={{ minHeight: 48, justifyContent: 'center', alignItems: 'center' }}
              onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/'); }}
              accessibilityRole="button"
            >
              <ThemedText style={styles.backAction}>กลับหน้าหลัก</ThemedText>
            </TouchableOpacity>
          </View>
        </ScrollView>
        <MarketplaceNav selected="my-shop" />
      </SafeAreaView>
    </View>
  );
}

const makeStyles = (theme: MarketplaceTheme) => StyleSheet.create({
  page: { flex: 1, backgroundColor: theme.background },
  scroll: { flexGrow: 1, alignItems: 'center', paddingBottom: 24 },
  content: { width: '100%', maxWidth: MaxContentWidth, padding: Spacing.three, gap: Spacing.three },
  header: { gap: 2, paddingVertical: 4 },
  title: { fontFamily: Fonts.sans, fontSize: 20, fontWeight: '700', color: theme.text },
  verifiedBadge: { fontSize: 12, fontWeight: '600', color: theme.primary, marginTop: 2 },
  reviewsText: { fontSize: 12, fontWeight: '700', color: '#f59e0b', marginTop: 2 },
  reviewsCount: { fontSize: 12, fontWeight: '400', color: theme.textSecondary },
  statsGrid: { flexDirection: 'row', gap: 8 },
  statBox: {
    flex: 1,
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 2,
  },
  statNumberPrimary: { fontSize: 18, fontWeight: '700', color: theme.primary },
  statNumberWarning: { fontSize: 18, fontWeight: '700', color: theme.warning },
  statNumberSecondary: { fontSize: 18, fontWeight: '700', color: theme.textSecondary },
  statLabel: { fontSize: 11, color: theme.textSecondary },
  filterScroll: { flexDirection: 'row', gap: 6, paddingVertical: 2 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  filterChipActive: { backgroundColor: theme.primary },
  filterChipInactive: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
  filterChipText: { fontSize: 12 },
  filterChipTextActive: { color: theme.onPrimary, fontWeight: '700' },
  filterChipTextInactive: { color: theme.textSecondary, fontWeight: '500' },
  button: {
    backgroundColor: theme.primary,
    minHeight: 48,
    borderRadius: 16,
    padding: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: theme.onPrimary, fontWeight: '700', fontSize: 15 },
  emptyBox: { alignItems: 'center', gap: 8, paddingVertical: 32 },
  emptyText: { color: theme.textSecondary, fontSize: 14 },
  card: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  image: { width: 68, height: 68, borderRadius: 12 },
  imagePlaceholder: {
    width: 68,
    height: 68,
    borderRadius: 12,
    backgroundColor: theme.backgroundElement,
    alignItems: 'center',
    justifyContent: 'center',
  },
  details: { flex: 1, gap: 2 },
  name: { color: theme.text, fontFamily: Fonts.sans, fontSize: 15, fontWeight: '600' },
  price: { color: theme.primary, fontSize: 15, fontWeight: '700' },
  badgeRow: { flexDirection: 'row', gap: 4, marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeSuccess: { backgroundColor: theme.successSoft ?? '#ecfdf5' },
  badgeWarning: { backgroundColor: theme.warningSoft ?? '#fef3c7' },
  badgeMuted: { backgroundColor: theme.backgroundElement },
  statusBadgeText: { fontSize: 10, fontWeight: '600' },
  badgeTextSuccess: { color: theme.primary },
  badgeTextWarning: { color: theme.warning },
  badgeTextMuted: { color: theme.textSecondary },
  action: { color: theme.primary, fontWeight: '600', fontSize: 12, marginTop: 4 },
  actionButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: theme.backgroundElement,
    borderWidth: 1,
    borderColor: theme.border,
  },
  actionButtonText: { fontSize: 11, fontWeight: '600', color: theme.text },
  errorBox: { gap: Spacing.two },
  loadMoreButton: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    minHeight: 44,
    borderRadius: 12,
    padding: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadMoreText: { color: theme.text, fontWeight: '600', fontSize: 14 },
  backAction: { color: theme.textSecondary, fontWeight: '600' },
});
