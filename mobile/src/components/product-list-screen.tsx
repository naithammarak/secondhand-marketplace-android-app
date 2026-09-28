import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { FlatList, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useProductBrand, fetchProductBrand } from '@/hooks/use-product-brand';

import { useTheme } from '@/hooks/use-theme';
import { MarketplaceNav } from './marketplace-nav';
import { MarketplaceIcon } from './marketplace-icon';
import { CatalogAccountButton } from './catalog-account-button';
import { ProductImage } from '@/components/product-catalog-ui';
import { Button, Card, Loading, Screen, styles as orderUiStyles } from '@/components/order-ui';
import { ThemedText } from '@/components/themed-text';
import { EmptyState, Skeleton } from './wondee/primitives';
import { Colors, Fonts, MaxContentWidth } from '@/constants/theme';
import { formatBaht } from '@/orders/order-format';
import { productCatalogStore } from '@/products/product-catalog-instance';
import { conditionLabels, type ProductListItem, type ProductCondition } from '@/services/product-catalog-service';

const catalogErrorMessages: Record<string, string> = {
  'network-error': 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่',
  timeout: 'เซิร์ฟเวอร์ตอบช้าเกินไป',
  'server-error': 'ระบบขัดข้อง กรุณาลองใหม่ภายหลัง',
  unavailable: 'บริการยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง',
  'not-found': 'ไม่พบข้อมูล',
  'validation-error': 'คำขอไม่ถูกต้อง',
};

const conditionBadgeTheme: Record<ProductCondition, { bg: string; text: string }> = {
  NEW: { bg: '#0d9569', text: '#ffffff' },        // เขียวสดใส (ตาม image_00 Card 1, 4)
  LIKE_NEW: { bg: '#0d9569', text: '#ffffff' },   // เขียวเหมือนใหม่ (ตาม image_00 Card 1, 4)
  GOOD: { bg: '#364356', text: '#ffffff' },       // สีเนวี่เข้ม "สภาพดี" (ตาม image_00 Card 3)
  FAIR: { bg: '#eaa131', text: '#161d2e' },       // สีเหลืองส้มอำพัน (ตาม image_00 Card 2)
  UNKNOWN: { bg: '#6b7280', text: '#ffffff' },    // เทา
};

function ProductCard({ item, onPress }: { item: ProductListItem; onPress(): void }) {
  const theme = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const [hovered, setHovered] = useState(false);
  const columns = fontScale >= 1.5 ? 1 : 2;
  const imageSize = (Math.min(width, MaxContentWidth) - 32 - (columns - 1) * 12) / columns;
  const brandText = useProductBrand(item);
  const rawShopName = item.seller?.displayName;
  const shopName = (!rawShopName || rawShopName === 'ร้านค้าที่ได้รับอนุมัติ') ? 'ร้านวนดีช็อป' : rawShopName;
  const badgeTheme = conditionBadgeTheme[item.condition] ?? conditionBadgeTheme.UNKNOWN;

  const isDark = theme.background === Colors.dark.background;

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
          borderColor: isDark ? theme.border : '#e1e7ef',
          backgroundColor: isDark ? theme.surface : '#ffffff',
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
        <ThemedText numberOfLines={1} type="small" style={[styles.brandName, { color: isDark ? theme.textSecondary : '#8fa0b5' }]}>
          {brandText}
        </ThemedText>
        <ThemedText numberOfLines={2} style={[styles.productName, { color: isDark ? theme.text : '#161d2e' }]}>
          {item.productName}
        </ThemedText>
        <View style={styles.priceRow}>
          <ThemedText type="smallBold" style={styles.productPrice}>
            {formatBaht(item.price)}
          </ThemedText>
        </View>
        {shopName ? (
          <>
            <View style={[styles.productDivider, { backgroundColor: isDark ? theme.border : '#e1e7ef' }]} />
            <View style={styles.shopRow}>
              <View style={styles.checkCircle}>
                <MarketplaceIcon name="check" size={7} color="#ffffff" />
              </View>
              <ThemedText numberOfLines={1} style={[styles.shopName, { color: isDark ? theme.textSecondary : '#64748b' }]}>
                {shopName}
              </ThemedText>
            </View>
          </>
        ) : null}
      </View>
    </Pressable>
  );
}

export function ProductListScreen() {
  const { fontScale } = useWindowDimensions();
  const columns = fontScale >= 1.5 ? 1 : 2;
  const theme = useTheme();
  const isDark = theme.background === Colors.dark.background;
  const returningFromDetail = useRef(false);
  const state = useSyncExternalStore(
    productCatalogStore.subscribe, productCatalogStore.getSnapshot, productCatalogStore.getSnapshot,
  );

  useFocusEffect(useCallback(() => {
    void productCatalogStore.loadCategories();
    if (returningFromDetail.current) {
      returningFromDetail.current = false;
      return;
    }
    // The shared store survives navigation; a new catalog visit must read page 1 again.
    if (productCatalogStore.getSnapshot().loaded) void productCatalogStore.refresh();
    else void productCatalogStore.load();
  }, []));

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
    onRefresh: () => { void productCatalogStore.refresh(); },
  });

  return (
    <Screen>
      <SafeAreaView style={[orderUiStyles.content, styles.page, { backgroundColor: theme.background }]}>
        <View
          style={styles.searchArea}
          {...(Platform.OS === 'web'
            ? {
                onWheel: pullToRefresh.handleWheel,
                onPointerDown: pullToRefresh.handlePointerDown,
                onPointerUp: pullToRefresh.handlePointerUp,
              }
            : {})}
        >
          <View style={styles.searchRow}>
            <View
              style={[
                styles.searchBox,
                {
                  borderColor: isDark ? theme.border : '#e1e7ef',
                  backgroundColor: isDark ? theme.surface : '#ffffff',
                },
              ]}
            >
              <MarketplaceIcon name="search" size={18} color="#10b981" />
              <TextInput
                style={[styles.searchInput, { color: isDark ? theme.text : '#161d2e' }]}
                value={state.query}
                onChangeText={text => productCatalogStore.setQuery(text)}
                placeholder="ค้นหาชื่อสินค้า"
                placeholderTextColor={isDark ? theme.textSecondary : '#94a3b8'}
                accessibilityLabel="ค้นหาชื่อสินค้า"
                returnKeyType="search"
              />
            </View>
            <CatalogAccountButton />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {[{ id: null, categoryName: 'ทั้งหมด' }, ...state.categories].map(category => {
              const selected = state.categoryId === category.id;
              return <Pressable key={String(category.id)} accessibilityRole="button" accessibilityLabel={category.categoryName}
                accessibilityState={{ selected }} onPress={() => { void productCatalogStore.setCategory(category.id); }}
                style={[
                  styles.chip,
                  {
                    borderColor: selected ? '#0d9569' : (isDark ? theme.border : '#e1e7ef'),
                    backgroundColor: selected ? '#0d9569' : (isDark ? theme.surface : '#ffffff'),
                  },
                ]}>
                <ThemedText
                  type="small"
                  style={[
                    styles.chipText,
                    {
                      color: selected ? '#ffffff' : (isDark ? theme.textSecondary : '#64748b'),
                      fontWeight: selected ? '600' : '400',
                    },
                  ]}
                >
                  {category.categoryName}
                </ThemedText>
              </Pressable>;
            })}
          </ScrollView>
          {state.categoriesError && <Button label="โหลดหมวดหมู่ไม่สำเร็จ ลองใหม่" onPress={() => { void productCatalogStore.loadCategories(); }} />}
        </View>
        <FlatList
          style={{ flex: 1 }}
          key={columns}
          numColumns={columns}
          columnWrapperStyle={columns === 2 ? { gap: 12 } : undefined}
          data={state.items}
          keyExtractor={item => String(item.id)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 12, paddingHorizontal: 16, paddingBottom: 24, flexGrow: 1 }}
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
            <RefreshControl refreshing={state.refreshing} onRefresh={() => { void productCatalogStore.refresh(); }} />
          }
          onEndReachedThreshold={0.3}
          onEndReached={() => { void productCatalogStore.loadMore(); }}
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
            <View style={{ gap: 12 }}>
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
                  <Button label="ลองใหม่อีกครั้ง" onPress={() => { void productCatalogStore.retry(); }} />
                </Card>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            state.loading ? <View style={{ gap: 12 }}><View style={{ flexDirection: 'row', gap: 12 }}>{Array.from({ length: columns }, (_, index) => <View key={index} style={{ flex: 1, gap: 12 }}><Skeleton height={210} label="กำลังโหลดสินค้า" /><Skeleton height={40} /></View>)}</View><ThemedText type="small">กำลังโหลดสินค้า</ThemedText></View>
              : state.loaded && !state.error ? <EmptyState title={emptyMessage} detail="ลองเปลี่ยนคำค้นหรือหมวดหมู่ แล้วกลับมาเลือกของที่ใช่อีกครั้ง" />
                : null
          }
          ListFooterComponent={
            state.loadingMore ? <Loading label="กำลังโหลดเพิ่ม" />
              : state.loaded && state.error ? (
                <Card>
                  <ThemedText accessibilityLiveRegion="polite">
                    {catalogErrorMessages[state.error] ?? 'โหลดเพิ่มไม่สำเร็จ กรุณาลองใหม่'}
                  </ThemedText>
                  <Button label="ลองใหม่อีกครั้ง" onPress={() => { void productCatalogStore.retry(); }} />
                </Card>
              ) : productCatalogStore.hasMore() ? (
                <Button label="โหลดเพิ่ม" onPress={() => { void productCatalogStore.loadMore(); }} />
              ) : null
          }
        />
        <MarketplaceNav selected="home" />
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignSelf: 'center', gap: 0, width: '100%' },
  searchArea: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, gap: 10 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 21, paddingHorizontal: 14, height: 42 },
  searchInput: { flex: 1, minWidth: 0, height: 42, fontFamily: Fonts.sans, fontSize: 13, paddingVertical: 0 },
  chips: { gap: 8 },
  chip: { borderWidth: 1, borderRadius: 17, paddingHorizontal: 14, minHeight: 34, height: 34, justifyContent: 'center', alignItems: 'center' },
  chipText: { fontSize: 13, lineHeight: 18 },
  productCard: { width: '48%', flexGrow: 1, maxWidth: '50%', borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  imageWrapper: { position: 'relative', width: '100%', overflow: 'hidden' },
  conditionBadge: { position: 'absolute', top: 8, left: 8, zIndex: 2, backgroundColor: '#059669', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  conditionBadgeText: { color: '#ffffff', fontSize: 11, fontWeight: '700', lineHeight: 15 },
  productInfo: { padding: 10, gap: 2 },
  brandName: { fontSize: 11, lineHeight: 15, fontWeight: '500' },
  productName: { fontSize: 13, lineHeight: 18, fontWeight: '600', marginTop: 1 },
  priceRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  productPrice: { fontSize: 16, fontWeight: '700', color: '#37d298' },
  productDivider: { height: 1, marginVertical: 6 },
  shopRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  checkCircle: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#37d298', alignItems: 'center', justifyContent: 'center' },
  shopName: { fontSize: 11, lineHeight: 15, flex: 1 },
});
