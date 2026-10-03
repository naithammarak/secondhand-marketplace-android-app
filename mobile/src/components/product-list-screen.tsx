import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useProductBrand, fetchProductBrand } from '@/hooks/use-product-brand';
import { useTheme } from '@/hooks/use-theme';
import { useThemePreference } from '@/theme/theme-provider';
import { MarketplaceNav } from './marketplace-nav';
import { MarketplaceIcon } from './marketplace-icon';
import { CatalogAccountButton } from './catalog-account-button';
import { ProductImage } from '@/components/product-catalog-ui';
import { Button, Card, Loading, Screen, styles as orderUiStyles } from '@/components/order-ui';
import { ThemedText } from '@/components/themed-text';
import { EmptyState, ErrorState, Skeleton } from './wondee/primitives';
import { BrandHeaderLogo } from './wondee/brand';
import { Fonts, MaxContentWidth } from '@/constants/theme';
import { formatBaht } from '@/orders/order-format';
import { productCatalogStore } from '@/products/product-catalog-instance';
import {
  conditionLabels,
  type ProductListItem,
  type ProductCondition,
} from '@/services/product-catalog-service';

const catalogErrorMessages: Record<string, string> = {
  'network-error': 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่',
  timeout: 'เซิร์ฟเวอร์ตอบช้าเกินไป',
  'server-error': 'ระบบขัดข้อง กรุณาลองใหม่ภายหลัง',
  unavailable: 'บริการยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง',
  'not-found': 'ไม่พบข้อมูล',
  'validation-error': 'คำขอไม่ถูกต้อง',
};

const conditionBadgeTheme: Record<ProductCondition, { bg: string; text: string }> = {
  NEW: { bg: '#059669', text: '#ffffff' },        // สภาพใหม่ (เขียวมรกต)
  LIKE_NEW: { bg: '#0D9488', text: '#ffffff' },   // สภาพเหมือนใหม่ (เขียวมินต์/ทีล)
  GOOD: { bg: '#0284C7', text: '#ffffff' },       // สภาพดี (ฟ้าคลาสสิก)
  FAIR: { bg: '#D97706', text: '#ffffff' },       // สภาพพอใช้ (อำพัน)
  UNKNOWN: { bg: '#64748B', text: '#ffffff' },    // เทา
};

// ป้ายบนการ์ดใช้คำสั้นตาม design (หน้า detail ยังใช้ conditionLabels เต็ม)
const cardConditionLabels: Record<ProductCondition, string> = {
  NEW: 'ใหม่',
  LIKE_NEW: 'เหมือนใหม่',
  GOOD: 'ดี',
  FAIR: 'พอใช้',
  UNKNOWN: 'ไม่ระบุสภาพ',
};

function CheckmarkMini() {
  return (
    <Svg width={8} height={8} viewBox="0 0 24 24" fill="none">
      <Path
        d="M20 6L9 17L4 12"
        stroke="#ffffff"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ProductCard({ item, onPress }: { item: ProductListItem; onPress(): void }) {
  const theme = useTheme();
  const { scheme } = useThemePreference();
  const isDark = scheme === 'dark';
  const { width, fontScale } = useWindowDimensions();
  const [hovered, setHovered] = useState(false);
  const columns = fontScale >= 1.5 ? 1 : 2;
  const imageSize = (Math.min(width, MaxContentWidth) - 28 - (columns - 1) * 12) / columns;
  const brandText = useProductBrand(item);
  // ชื่อร้านมาจาก API เท่านั้น ไม่มีให้ซ่อน ไม่เติมชื่อร้านอื่นแทน
  const shopName = item.seller?.displayName?.trim() || null;
  const badgeTheme = conditionBadgeTheme[item.condition] ?? conditionBadgeTheme.UNKNOWN;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.productName}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={({ pressed }) => [
        styles.productCard,
        {
          width: columns === 1 ? '100%' : '48%',
          maxWidth: columns === 1 ? '100%' : '50%',
          borderColor: theme.border,
          backgroundColor: theme.surface,
          shadowOpacity: isDark ? 0.25 : 0.04,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
      ]}
    >
      <View style={styles.imageWrapper}>
        <LinearGradient
          colors={isDark ? ['#1e293b', '#0f172a'] : ['#f1f5f9', '#e2e8f0']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <ProductImage
          uri={item.mainImage?.imageUrl}
          width="100%"
          height={imageSize}
          borderRadius={0}
          hovered={hovered}
          accessibilityLabel={`รูปสินค้า ${item.productName}`}
        />
        <View
          accessibilityLabel={conditionLabels[item.condition]}
          style={[styles.conditionBadge, { backgroundColor: badgeTheme.bg }]}
        >
          <ThemedText style={[styles.conditionBadgeText, { color: badgeTheme.text }]}>
            {cardConditionLabels[item.condition]}
          </ThemedText>
        </View>
      </View>
      <View style={styles.productInfo}>
        <ThemedText numberOfLines={1} style={[styles.brandName, { color: isDark ? '#64748b' : '#94a3b8' }]}>
          {brandText}
        </ThemedText>
        <ThemedText numberOfLines={2} style={[styles.productName, { color: theme.text }]}>
          {item.productName}
        </ThemedText>
        <ThemedText style={styles.productPrice}>{formatBaht(item.price)}</ThemedText>
        {shopName ? (
          <View style={styles.shopRow}>
            {item.seller?.verified ? (
              <View style={styles.checkCircle} accessibilityLabel="ผู้ขายยืนยันตัวตนแล้ว">
                <CheckmarkMini />
              </View>
            ) : null}
            <ThemedText numberOfLines={1} style={[styles.shopName, { color: theme.textSecondary }]}>
              {shopName}
            </ThemedText>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function HomeBrandBanner() {
  return (
    <View style={styles.bannerContainer} accessibilityLabel="โฆษณา 2NDHAND">
      <LinearGradient
        colors={['#34d399', '#059669', '#064e3b']}
        locations={[0, 0.45, 1]}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.bannerGlow} />
      <View style={styles.bannerContent}>
        <View style={styles.bannerPill}>
          <Svg width={12} height={12} viewBox="0 0 20 20">
            <Circle cx={10} cy={10} r={8} fill="#ffffff" />
            <Path d="M6.5 10.2l2.2 2.2 4.6-4.6" stroke="#059669" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
          <ThemedText style={styles.bannerPillText}>ผู้ขายทุกคนยืนยันตัวตนแล้ว</ThemedText>
        </View>
        <ThemedText style={styles.bannerTitle}>
          ของมือสองคัดเกรด{'\n'}ตรวจสภาพก่อนถึงมือ
        </ThemedText>
        <ThemedText style={styles.bannerSubtitle}>ส่งต่อของดี ในราคาที่ใช่</ThemedText>
      </View>

      <View style={styles.bannerTilesContainer}>
        <View style={[styles.bannerTile, styles.bannerTile1]}>
          <ThemedText style={styles.bannerTileEmoji}>👟</ThemedText>
        </View>
        <View style={[styles.bannerTile, styles.bannerTile2]}>
          <ThemedText style={styles.bannerTileEmoji}>🧥</ThemedText>
        </View>
        <View style={[styles.bannerTile, styles.bannerTile3]}>
          <ThemedText style={styles.bannerTileEmoji}>👜</ThemedText>
        </View>
        {/* สินค้าตรวจหลังสั่งซื้อ จึงใช้คำว่า "ตรวจก่อนส่ง" ไม่ใช่ "ตรวจแล้ว" (DESIGN-AUDIT D15) */}
        <View style={styles.bannerInspectBadge}>
          <ThemedText style={styles.bannerInspectCheck}>✓</ThemedText>
          <ThemedText style={styles.bannerInspectText}>{'ตรวจ\nก่อนส่ง'}</ThemedText>
        </View>
      </View>

      <ThemedText style={styles.bannerAdLabel}>AD · 2NDHAND</ThemedText>
    </View>
  );
}

function CardSkeleton() {
  const theme = useTheme();
  return (
    <View style={[styles.skeletonCard, { borderColor: theme.border, backgroundColor: theme.surface }]}>
      <Skeleton height={150} label="กำลังโหลดสินค้า" />
      <View style={{ padding: 12, gap: 8 }}>
        <View style={{ width: 64 }}><Skeleton height={12} /></View>
        <Skeleton height={16} />
        <View style={{ width: 80 }}><Skeleton height={20} /></View>
      </View>
    </View>
  );
}

export function ProductListScreen() {
  const { fontScale } = useWindowDimensions();
  const columns = fontScale >= 1.5 ? 1 : 2;
  const theme = useTheme();
  const { scheme } = useThemePreference();
  const isDark = scheme === 'dark';
  const returningFromDetail = useRef(false);
  const [isManualRefresh, setIsManualRefresh] = useState(false);
  const state = useSyncExternalStore(
    productCatalogStore.subscribe,
    productCatalogStore.getSnapshot,
    productCatalogStore.getSnapshot,
  );

  useEffect(() => {
    if (!state.refreshing) {
      setIsManualRefresh(false);
    }
  }, [state.refreshing]);

  useFocusEffect(
    useCallback(() => {
      void productCatalogStore.loadCategories();
      if (returningFromDetail.current) {
        returningFromDetail.current = false;
        return;
      }
      if (productCatalogStore.getSnapshot().loaded) void productCatalogStore.refresh();
      else void productCatalogStore.load();
    }, []),
  );

  useEffect(() => {
    state.items.forEach(item => {
      if (!item.brand?.brandName && !item.brandName) {
        void fetchProductBrand(item.id);
      }
    });
  }, [state.items]);

  const trimmedQuery = state.query.trim();
  const selectedCategoryName =
    state.categoryId === null
      ? null
      : state.categories.find(category => category.id === state.categoryId)?.categoryName ?? null;
  const listTitle = trimmedQuery
    ? `ผลการค้นหา "${trimmedQuery}"`
    : selectedCategoryName ?? 'สินค้าล่าสุด';
  const emptyMessage = trimmedQuery ? 'ไม่พบสินค้าตามคำค้น' : 'ยังไม่มีสินค้า';
  const emptyDetail = trimmedQuery
    ? 'ลองใช้คำอื่น หรือค้นหาด้วยคำที่สั้นลง'
    : selectedCategoryName
      ? 'หมวดนี้ยังไม่มีสินค้าลงขาย ลองดูหมวดอื่นก่อนนะ'
      : 'ยังไม่มีสินค้าลงขายในตอนนี้ ลองกลับมาดูใหม่ภายหลัง';

  const handleManualRefresh = () => {
    setIsManualRefresh(true);
    void productCatalogStore.refresh();
  };

  const pullToRefresh = usePullToRefresh({
    refreshing: state.refreshing,
    onRefresh: handleManualRefresh,
  });

  return (
    <Screen>
      <SafeAreaView
        style={[orderUiStyles.content, styles.page, { backgroundColor: theme.background }]}
      >
        {/* App Top Header Bar */}
        <View
          style={[
            styles.headerArea,
            {
              backgroundColor: isDark ? '#121622' : '#FFFFFF',
              borderBottomColor: theme.border,
            },
          ]}
          {...(Platform.OS === 'web'
            ? {
                onWheel: pullToRefresh.handleWheel,
                onPointerDown: pullToRefresh.handlePointerDown,
                onPointerUp: pullToRefresh.handlePointerUp,
              }
            : {})}
        >
          {/* Row 1: Brand Wordmark + Account Action Button */}
          <View style={styles.brandRow}>
            <BrandHeaderLogo iconSize={30} wordmarkWidth={96} wordmarkHeight={32} />
            <CatalogAccountButton />
          </View>

          {/* Row 2: Search Input with Clear Button */}
          <View
            style={[
              styles.searchBox,
              {
                borderColor: theme.border,
                backgroundColor: theme.backgroundElement,
              },
            ]}
          >
            <MarketplaceIcon name="search" size={16} color={isDark ? '#64748b' : '#94a3b8'} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              value={state.query}
              onChangeText={text => productCatalogStore.setQuery(text)}
              placeholder="ค้นหาชื่อสินค้า"
              placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
              accessibilityLabel="ค้นหาชื่อสินค้า"
              returnKeyType="search"
            />
            {state.query.trim().length > 0 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="ล้างคำค้น"
                onPress={() => productCatalogStore.setQuery('')}
                style={[styles.clearSearchBtn, { backgroundColor: isDark ? '#1e293b' : '#e2e8f0' }]}
              >
                <ThemedText style={[styles.clearSearchText, { color: theme.textSecondary }]}>✕</ThemedText>
              </Pressable>
            )}
          </View>

          {/* Row 3: Horizontal Category Chips */}
          {state.categoriesError ? (
            <View style={styles.categoryErrorRow}>
              <ThemedText style={[styles.categoryErrorText, { color: theme.textSecondary }]}>
                โหลดหมวดหมู่ไม่สำเร็จ
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="ลองโหลดหมวดหมู่ใหม่"
                onPress={() => {
                  void productCatalogStore.loadCategories();
                }}
                hitSlop={8}
              >
                <ThemedText style={styles.categoryErrorAction}>ลองใหม่</ThemedText>
              </Pressable>
            </View>
          ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {[{ id: null, categoryName: 'ทั้งหมด' }, ...state.categories].map(category => {
              const selected = state.categoryId === category.id;
              return (
                <Pressable
                  key={String(category.id)}
                  accessibilityRole="button"
                  accessibilityLabel={category.categoryName}
                  accessibilityState={{ selected }}
                  onPress={() => {
                    void productCatalogStore.setCategory(category.id);
                  }}
                  style={[
                    styles.chip,
                    { backgroundColor: selected ? '#059669' : theme.backgroundElement },
                  ]}
                >
                  <ThemedText
                    type="small"
                    style={[
                      styles.chipText,
                      {
                        color: selected ? '#FFFFFF' : theme.textSecondary,
                        fontWeight: selected ? '700' : '500',
                      },
                    ]}
                  >
                    {category.categoryName}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>
          )}
        </View>

        {/* Product Grid Area */}
        <FlatList
          style={{ flex: 1 }}
          key={columns}
          numColumns={columns}
          columnWrapperStyle={columns === 2 ? { gap: 12 } : undefined}
          data={state.items}
          keyExtractor={item => String(item.id)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            gap: 12,
            paddingHorizontal: 14,
            paddingTop: 14,
            paddingBottom: 24,
            flexGrow: 1,
          }}
          alwaysBounceVertical={true}
          onScroll={pullToRefresh.handleScroll}
          scrollEventThrottle={16}
          {...(Platform.OS === 'web'
            ? {
                onWheel: pullToRefresh.handleWheel,
                onPointerDown: pullToRefresh.handlePointerDown,
                onPointerUp: pullToRefresh.handlePointerUp,
              }
            : {})}
          refreshControl={
            <RefreshControl
              refreshing={isManualRefresh && state.refreshing}
              colors={['#059669']}
              tintColor="#059669"
              onRefresh={handleManualRefresh}
            />
          }
          onEndReachedThreshold={0.3}
          onEndReached={() => {
            void productCatalogStore.loadMore();
          }}
          renderItem={({ item }) => (
            <ProductCard
              item={item}
              onPress={() => {
                returningFromDetail.current = true;
                router.push({ pathname: '/products/[id]', params: { id: String(item.id) } });
              }}
            />
          )}
          ListHeaderComponent={
            <View style={{ gap: 14, marginBottom: -2 }}>
              {/* Brand Promo Banner (shown when not searching) */}
              {!trimmedQuery && <HomeBrandBanner />}

              {/* Section Header */}
              <View style={styles.sectionHeaderRow}>
                <ThemedText numberOfLines={1} style={[styles.sectionTitle, { color: theme.text }]}>
                  {listTitle}
                </ThemedText>
                <ThemedText style={[styles.sectionNotice, { color: theme.textSecondary }]}>
                  ตรวจหลังสั่งซื้อก่อนส่งถึงมือ
                </ThemedText>
              </View>

              {Platform.OS === 'web' && isManualRefresh && state.refreshing ? (
                <View style={{ paddingVertical: 8, alignItems: 'center' }}>
                  <Loading label="กำลังรีเฟรชสินค้า..." />
                </View>
              ) : null}

              {!state.loaded && state.error ? (
                <ErrorState
                  icon={state.error === 'network-error' || state.error === 'timeout' ? 'offline' : 'alert'}
                  title={state.error === 'network-error' ? 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้' : 'โหลดสินค้าไม่สำเร็จ'}
                  detail={
                    state.error === 'network-error'
                      ? 'กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'
                      : catalogErrorMessages[state.error] ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่'
                  }
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="ลองใหม่อีกครั้ง"
                    onPress={() => {
                      void productCatalogStore.retry();
                    }}
                    style={styles.retryButton}
                  >
                    <ThemedText style={styles.retryText}>ลองใหม่อีกครั้ง</ThemedText>
                  </Pressable>
                </ErrorState>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            state.loading ? (
              <View style={{ gap: 12 }}>
                {Array.from({ length: columns === 2 ? 2 : 3 }, (_, row) => (
                  <View key={row} style={{ flexDirection: 'row', gap: 12 }}>
                    {Array.from({ length: columns }, (_, index) => (
                      <CardSkeleton key={index} />
                    ))}
                  </View>
                ))}
                <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
                  กำลังโหลดสินค้า
                </ThemedText>
              </View>
            ) : state.loaded && !state.error ? (
              <EmptyState icon={trimmedQuery ? 'search' : 'bag'} title={emptyMessage} detail={emptyDetail}>
                {trimmedQuery ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="ล้างคำค้น"
                    onPress={() => productCatalogStore.setQuery('')}
                    style={[styles.clearQueryButton, { backgroundColor: theme.backgroundElement }]}
                  >
                    <ThemedText style={[styles.clearQueryText, { color: theme.text }]}>ล้างคำค้น</ThemedText>
                  </Pressable>
                ) : null}
              </EmptyState>
            ) : null
          }
          ListFooterComponent={
            state.loadingMore ? (
              <Loading label="กำลังโหลดเพิ่ม" />
            ) : state.loaded && state.error ? (
              <Card>
                <ThemedText accessibilityLiveRegion="polite">
                  {catalogErrorMessages[state.error] ?? 'โหลดเพิ่มไม่สำเร็จ กรุณาลองใหม่'}
                </ThemedText>
                <Button
                  label="ลองใหม่อีกครั้ง"
                  onPress={() => {
                    void productCatalogStore.retry();
                  }}
                />
              </Card>
            ) : productCatalogStore.hasMore() ? (
              <Button
                label="โหลดเพิ่ม"
                onPress={() => {
                  void productCatalogStore.loadMore();
                }}
              />
            ) : state.items.length === 0 ? null : (
              <View style={styles.listFooter}>
                <ThemedText style={styles.listFooterText}>ดูครบทุกชิ้นแล้ว</ThemedText>
              </View>
            )
          }
        />
        <MarketplaceNav selected="home" />
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignSelf: 'center', gap: 0, width: '100%' },
  headerArea: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, gap: 10, borderBottomWidth: 1 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 36 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingLeft: 12,
    paddingRight: 8,
    height: 40,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    height: 40,
    fontFamily: Fonts.bodyMedium,
    fontSize: 12,
    paddingVertical: 0,
  },
  clearSearchBtn: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  clearSearchText: { fontSize: 11, fontWeight: '800' },
  chips: { gap: 8 },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipText: { fontSize: 12, lineHeight: 16 },
  categoryErrorRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 30 },
  categoryErrorText: { fontSize: 11 },
  categoryErrorAction: { fontSize: 11, fontWeight: '700', color: '#10b981' },

  /* Brand Banner */
  bannerContainer: {
    borderRadius: 16,
    padding: 16,
    paddingBottom: 24,
    position: 'relative',
    overflow: 'hidden',
  },
  bannerGlow: {
    position: 'absolute',
    right: -30,
    bottom: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  bannerContent: { zIndex: 2, paddingRight: 104 },
  bannerPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  bannerPillText: { color: '#FFFFFF', fontSize: 10, lineHeight: 15, fontWeight: '700' },
  bannerTitle: {
    fontFamily: Fonts.extraBold,
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 23,
    marginTop: 8,
  },
  bannerSubtitle: { fontSize: 10.5, lineHeight: 14, color: 'rgba(236, 253, 245, 0.9)', marginTop: 4 },
  bannerTilesContainer: {
    position: 'absolute',
    right: 12,
    top: '50%',
    marginTop: -48,
    width: 96,
    height: 96,
    zIndex: 1,
  },
  bannerTile: {
    position: 'absolute',
    width: 44,
    height: 52,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  bannerTile1: { right: 26, top: 4, backgroundColor: '#FEF3C7', transform: [{ rotate: '-12deg' }] },
  bannerTile2: { right: 0, top: 16, backgroundColor: '#E0E7FF', transform: [{ rotate: '9deg' }] },
  bannerTile3: { right: 14, top: 40, backgroundColor: '#FCE7F3', transform: [{ rotate: '-2deg' }] },
  bannerTileEmoji: { fontSize: 22, lineHeight: 28 },
  bannerInspectBadge: {
    position: 'absolute',
    left: -4,
    bottom: 0,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
    transform: [{ rotate: '-10deg' }],
  },
  bannerInspectCheck: { fontSize: 9, lineHeight: 10, fontWeight: '900', color: '#047857' },
  bannerInspectText: { fontSize: 7, lineHeight: 8, fontWeight: '800', color: '#047857', textAlign: 'center' },
  bannerAdLabel: {
    position: 'absolute',
    left: 16,
    bottom: 6,
    fontSize: 8,
    lineHeight: 10,
    color: 'rgba(255, 255, 255, 0.6)',
    letterSpacing: 1.6,
  },

  /* Section Title */
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 2,
  },
  sectionTitle: { flexShrink: 1, fontFamily: Fonts.displayBold, fontSize: 14, fontWeight: '700' },
  sectionNotice: { fontSize: 10.5 },

  /* Product Card */
  productCard: {
    width: '48%',
    flexGrow: 1,
    maxWidth: '50%',
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  imageWrapper: { position: 'relative', width: '100%', overflow: 'hidden' },
  conditionBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 2,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  conditionBadgeText: { fontSize: 10, fontWeight: '800', lineHeight: 14 },
  productInfo: { padding: 10 },
  brandName: { fontSize: 10, lineHeight: 14 },
  productName: { fontSize: 12, lineHeight: 16.5, fontWeight: '600', minHeight: 33, marginTop: 2 },
  productPrice: {
    fontFamily: Fonts.extraBold,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '800',
    color: '#10B981',
    marginTop: 4,
  },
  shopRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  checkCircle: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shopName: { fontSize: 10, lineHeight: 14, flex: 1 },
  skeletonCard: { flex: 1, borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  retryButton: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, backgroundColor: '#059669' },
  retryText: { fontSize: 12, fontWeight: '700', color: '#ffffff' },
  clearQueryButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  clearQueryText: { fontSize: 12, fontWeight: '700' },
  listFooter: { paddingVertical: 16, alignItems: 'center' },
  listFooterText: { fontSize: 11, color: '#94A3B8' },
});
