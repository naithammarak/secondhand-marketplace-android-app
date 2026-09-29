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
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

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
import { EmptyState, Skeleton } from './wondee/primitives';
import { WondeeLogo } from './wondee/brand';
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
  const imageSize = (Math.min(width, MaxContentWidth) - 32 - (columns - 1) * 12) / columns;
  const brandText = useProductBrand(item);
  const rawShopName = item.seller?.displayName;
  const shopName =
    !rawShopName || rawShopName === 'ร้านค้าที่ได้รับอนุมัติ' ? 'ร้านวนดีช็อป' : rawShopName;
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
          borderColor: isDark ? '#1E293B' : '#EDF2F7',
          backgroundColor: isDark ? '#131D2E' : '#FFFFFF',
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <View style={styles.imageWrapper}>
        <ProductImage
          uri={item.mainImage?.imageUrl}
          width="100%"
          height={imageSize}
          borderRadius={0}
          hovered={hovered}
          accessibilityLabel={`รูปสินค้า ${item.productName}`}
        />
        <View style={[styles.conditionBadge, { backgroundColor: badgeTheme.bg }]}>
          <ThemedText style={[styles.conditionBadgeText, { color: badgeTheme.text }]}>
            {conditionLabels[item.condition]}
          </ThemedText>
        </View>
      </View>
      <View style={styles.productInfo}>
        <ThemedText
          numberOfLines={1}
          type="small"
          style={[styles.brandName, { color: isDark ? '#94A3B8' : '#64748B' }]}
        >
          {brandText}
        </ThemedText>
        <ThemedText
          numberOfLines={2}
          style={[styles.productName, { color: isDark ? '#F8FAFC' : '#0F172A' }]}
        >
          {item.productName}
        </ThemedText>
        <View style={styles.priceRow}>
          <ThemedText style={styles.productPrice}>
            {formatBaht(item.price)}
          </ThemedText>
        </View>
        {shopName ? (
          <>
            <View
              style={[
                styles.productDivider,
                { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' },
              ]}
            />
            <View style={styles.shopRow}>
              <View style={styles.checkCircle}>
                <CheckmarkMini />
              </View>
              <ThemedText
                numberOfLines={1}
                style={[styles.shopName, { color: isDark ? '#94A3B8' : '#64748B' }]}
              >
                {shopName}
              </ThemedText>
            </View>
          </>
        ) : null}
      </View>
    </Pressable>
  );
}

function HomeBrandBanner() {
  return (
    <View style={styles.bannerContainer}>
      <View style={styles.bannerContent}>
        {/* Verification badge */}
        <View style={styles.bannerPill}>
          <ThemedText style={styles.bannerPillIcon}>✓</ThemedText>
          <ThemedText style={styles.bannerPillText}>ผู้ขายทุกคนยืนยันตัวตนแล้ว</ThemedText>
        </View>

        {/* Heading & Subtitle */}
        <ThemedText style={styles.bannerTitle}>
          ของมือสองคัดเกรด{'\n'}ตรวจสภาพก่อนถึงมือ
        </ThemedText>
        <ThemedText style={styles.bannerSubtitle}>ส่งต่อของดี ในราคาที่ใช่</ThemedText>
      </View>

      {/* Floating preview item tiles on the right */}
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
        <View style={styles.bannerInspectBadge}>
          <ThemedText style={styles.bannerInspectCheck}>✓</ThemedText>
          <ThemedText style={styles.bannerInspectText}>ตรวจแล้ว</ThemedText>
        </View>
      </View>

      <ThemedText style={styles.bannerAdLabel}>AD · WONDEE</ThemedText>
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
  const state = useSyncExternalStore(
    productCatalogStore.subscribe,
    productCatalogStore.getSnapshot,
    productCatalogStore.getSnapshot,
  );

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

  const emptyMessage = state.query.trim() ? 'ไม่พบสินค้าตามคำค้น' : 'ยังไม่มีสินค้า';

  const pullToRefresh = usePullToRefresh({
    refreshing: state.refreshing,
    onRefresh: () => {
      void productCatalogStore.refresh();
    },
  });

  return (
    <Screen>
      <SafeAreaView
        style={[orderUiStyles.content, styles.page, { backgroundColor: isDark ? '#090D16' : '#F8FAFC' }]}
      >
        {/* App Top Header Bar */}
        <View
          style={[
            styles.headerArea,
            {
              backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
              borderBottomColor: isDark ? '#1E293B' : '#F1F5F9',
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
            <View style={styles.brandLeft}>
              <WondeeLogo size={28} />
              <View style={styles.brandWordmarkBox}>
                <ThemedText style={[styles.brandTitle, { color: theme.text }]}>Wondee</ThemedText>
                <ThemedText style={styles.brandSubtitle}>MARKETPLACE</ThemedText>
              </View>
            </View>
            <CatalogAccountButton />
          </View>

          {/* Row 2: Search Input with Clear Button */}
          <View
            style={[
              styles.searchBox,
              {
                borderColor: isDark ? '#334155' : '#E2E8F0',
                backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
              },
            ]}
          >
            <MarketplaceIcon name="search" size={17} color="#10B981" />
            <TextInput
              style={[styles.searchInput, { color: isDark ? '#F8FAFC' : '#0F172A' }]}
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
                style={styles.clearSearchBtn}
              >
                <ThemedText style={styles.clearSearchText}>✕</ThemedText>
              </Pressable>
            )}
          </View>

          {/* Row 3: Horizontal Category Chips */}
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
                    {
                      borderColor: selected ? '#059669' : isDark ? '#334155' : '#E2E8F0',
                      backgroundColor: selected ? '#059669' : isDark ? '#1E293B' : '#FFFFFF',
                    },
                  ]}
                >
                  <ThemedText
                    type="small"
                    style={[
                      styles.chipText,
                      {
                        color: selected ? '#FFFFFF' : isDark ? '#94A3B8' : '#64748B',
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

          {state.categoriesError && (
            <Button
              label="โหลดหมวดหมู่ไม่สำเร็จ ลองใหม่"
              onPress={() => {
                void productCatalogStore.loadCategories();
              }}
            />
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
            paddingHorizontal: 16,
            paddingTop: 12,
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
              refreshing={state.refreshing}
              onRefresh={() => {
                void productCatalogStore.refresh();
              }}
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
            <View style={{ gap: 12, marginBottom: 4 }}>
              {/* Brand Promo Banner (shown when not searching) */}
              {!state.query.trim() && <HomeBrandBanner />}

              {/* Section Header */}
              <View style={styles.sectionHeaderRow}>
                <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>
                  {state.query.trim() ? `ผลการค้นหา "${state.query}"` : 'สินค้าล่าสุด'}
                </ThemedText>
                <ThemedText style={styles.sectionNotice}>ของแท้ตรวจแล้ว</ThemedText>
              </View>

              {Platform.OS === 'web' && state.refreshing ? (
                <View style={{ paddingVertical: 8, alignItems: 'center' }}>
                  <Loading label="กำลังรีเฟรชสินค้า..." />
                </View>
              ) : null}

              {!state.loaded && state.error ? (
                <Card>
                  <ThemedText accessibilityLiveRegion="polite">
                    {catalogErrorMessages[state.error] ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่'}
                  </ThemedText>
                  <Button
                    label="ลองใหม่อีกครั้ง"
                    onPress={() => {
                      void productCatalogStore.retry();
                    }}
                  />
                </Card>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            state.loading ? (
              <View style={{ gap: 12 }}>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  {Array.from({ length: columns }, (_, index) => (
                    <View key={index} style={{ flex: 1, gap: 12 }}>
                      <Skeleton height={210} label="กำลังโหลดสินค้า" />
                      <Skeleton height={40} />
                    </View>
                  ))}
                </View>
                <ThemedText type="small">กำลังโหลดสินค้า</ThemedText>
              </View>
            ) : state.loaded && !state.error ? (
              <EmptyState
                title={emptyMessage}
                detail="ลองเปลี่ยนคำค้นหรือหมวดหมู่ แล้วกลับมาเลือกของที่ใช่อีกครั้ง"
              />
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
            ) : (
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
  headerArea: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, gap: 10, borderBottomWidth: 1 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandWordmarkBox: { justifyContent: 'center' },
  brandTitle: { fontFamily: Fonts.displayBold, fontSize: 16, fontWeight: '800', lineHeight: 20 },
  brandSubtitle: { fontSize: 8.5, fontWeight: '800', color: '#10B981', letterSpacing: 1.5, marginTop: -2 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: { flex: 1, minWidth: 0, height: 40, fontFamily: Fonts.sans, fontSize: 12.5, paddingVertical: 0 },
  clearSearchBtn: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  clearSearchText: { fontSize: 11, color: '#475569', fontWeight: '700' },
  chips: { gap: 8, paddingVertical: 2 },
  chip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 13,
    minHeight: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipText: { fontSize: 12, lineHeight: 16 },

  /* Brand Banner */
  bannerContainer: {
    backgroundColor: '#064E3B',
    borderRadius: 20,
    padding: 16,
    paddingBottom: 22,
    position: 'relative',
    overflow: 'hidden',
  },
  bannerContent: { zIndex: 2, paddingRight: 80 },
  bannerPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 12,
    marginBottom: 8,
  },
  bannerPillIcon: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  bannerPillText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  bannerTitle: {
    fontFamily: Fonts.displayBold,
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 22,
  },
  bannerSubtitle: { fontSize: 11, color: '#A7F3D0', marginTop: 4, fontWeight: '500' },
  bannerTilesContainer: {
    position: 'absolute',
    right: 12,
    top: 14,
    width: 90,
    height: 90,
    zIndex: 1,
  },
  bannerTile: {
    position: 'absolute',
    width: 40,
    height: 46,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  bannerTile1: { right: 26, top: 4, backgroundColor: '#FEF3C7', transform: [{ rotate: '-12deg' }] },
  bannerTile2: { right: 2, top: 14, backgroundColor: '#E0E7FF', transform: [{ rotate: '9deg' }] },
  bannerTile3: { right: 14, top: 38, backgroundColor: '#FCE7F3', transform: [{ rotate: '-2deg' }] },
  bannerTileEmoji: { fontSize: 20 },
  bannerInspectBadge: {
    position: 'absolute',
    left: -4,
    bottom: -2,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
    transform: [{ rotate: '-8deg' }],
  },
  bannerInspectCheck: { fontSize: 11, fontWeight: '900', color: '#047857' },
  bannerInspectText: { fontSize: 7, fontWeight: '800', color: '#047857', marginTop: -2 },
  bannerAdLabel: {
    position: 'absolute',
    left: 16,
    bottom: 6,
    fontSize: 8.5,
    color: 'rgba(255, 255, 255, 0.6)',
    letterSpacing: 1.2,
    fontWeight: '700',
  },

  /* Section Title */
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginTop: 2,
  },
  sectionTitle: { fontFamily: Fonts.displayBold, fontSize: 14, fontWeight: '700' },
  sectionNotice: { fontSize: 11, color: '#10B981', fontWeight: '600' },

  /* Product Card */
  productCard: {
    width: '48%',
    flexGrow: 1,
    maxWidth: '50%',
    borderWidth: 1,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  imageWrapper: { position: 'relative', width: '100%', overflow: 'hidden' },
  conditionBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 2,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
  },
  conditionBadgeText: { fontSize: 10.5, fontWeight: '700', lineHeight: 14 },
  productInfo: { padding: 10, gap: 2 },
  brandName: { fontSize: 10.5, lineHeight: 14, fontWeight: '500' },
  productName: { fontSize: 12.5, lineHeight: 17, fontWeight: '600', marginTop: 1 },
  priceRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  productPrice: {
    fontFamily: Fonts.displayBold,
    fontSize: 15,
    fontWeight: '800',
    color: '#10B981',
  },
  productDivider: { height: 1, marginVertical: 5 },
  shopRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  checkCircle: {
    width: 13,
    height: 13,
    borderRadius: 6.5,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shopName: { fontSize: 10.5, lineHeight: 14, flex: 1 },
  listFooter: { paddingVertical: 12, alignItems: 'center' },
  listFooterText: { fontSize: 11, color: '#94A3B8' },
});
