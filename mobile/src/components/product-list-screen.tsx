import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useSyncExternalStore } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';
import { MarketplaceHeader } from './marketplace-header';
import { MarketplaceNav } from './marketplace-nav';
import { MarketplaceIcon } from './marketplace-icon';
import { CatalogAccountButton } from './catalog-account-button';
import { ProductImage } from '@/components/product-catalog-ui';
import { Button, Card, Loading, Screen, styles as orderUiStyles } from '@/components/order-ui';
import { ThemedText } from '@/components/themed-text';
import { Fonts, MaxContentWidth } from '@/constants/theme';
import { formatBaht } from '@/orders/order-format';
import { productCatalogStore } from '@/products/product-catalog-instance';
import { conditionLabels, type ProductListItem } from '@/services/product-catalog-service';

const catalogErrorMessages: Record<string, string> = {
  'network-error': 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่',
  timeout: 'เซิร์ฟเวอร์ตอบช้าเกินไป',
  'server-error': 'ระบบขัดข้อง กรุณาลองใหม่ภายหลัง',
  unavailable: 'บริการยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง',
  'not-found': 'ไม่พบข้อมูล',
  'validation-error': 'คำขอไม่ถูกต้อง',
};

function ProductCard({ item, onPress }: { item: ProductListItem; onPress(): void }) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const imageSize = (Math.min(width, MaxContentWidth) - 46) / 2;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={item.productName} onPress={onPress}
      style={({ pressed }) => [styles.productCard, { borderColor: theme.border, backgroundColor: theme.surface, opacity: pressed ? 0.75 : 1 }]}>
      <ProductImage uri={item.mainImage?.imageUrl} width="100%" height={imageSize} borderRadius={0}
        accessibilityLabel={`รูปสินค้า ${item.productName}`} />
      <View style={styles.productInfo}>
        <ThemedText numberOfLines={2} style={styles.productName}>{item.productName}</ThemedText>
        <View style={styles.priceRow}>
          <ThemedText type="smallBold" style={{ fontSize: 17 }}>{formatBaht(item.price)}</ThemedText>
          <View style={[styles.condition, { backgroundColor: theme.backgroundSelected }]}>
            <ThemedText type="small" style={{ color: theme.primary }}>{conditionLabels[item.condition]}</ThemedText>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export function ProductListScreen() {
  const theme = useTheme();
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

  const emptyMessage = state.query.trim() ? 'ไม่พบสินค้าตามคำค้น' : 'ยังไม่มีสินค้า';

  return (
    <Screen>
      <SafeAreaView style={[orderUiStyles.content, styles.page, { backgroundColor: theme.surface }]}>
        <MarketplaceHeader title="ค้นหาสินค้า" trailing={<CatalogAccountButton />} />
        <View style={styles.searchArea}>
          <View style={[styles.searchBox, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
            <MarketplaceIcon name="search" size={19} />
            <TextInput style={[styles.searchInput, { color: theme.text }]} value={state.query}
              onChangeText={text => productCatalogStore.setQuery(text)} placeholder="ค้นหาชื่อสินค้า"
              placeholderTextColor={theme.textSecondary} accessibilityLabel="ค้นหาชื่อสินค้า" returnKeyType="search" />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {[{ id: null, categoryName: 'ทั้งหมด' }, ...state.categories].map(category => {
              const selected = state.categoryId === category.id;
              return <Pressable key={String(category.id)} accessibilityRole="button" accessibilityLabel={category.categoryName}
                accessibilityState={{ selected }} onPress={() => { void productCatalogStore.setCategory(category.id); }}
                style={[styles.chip, { borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? theme.primary : theme.surface }]}>
                <ThemedText type="small" style={{ color: selected ? theme.onPrimary : theme.textSecondary }}>{category.categoryName}</ThemedText>
              </Pressable>;
            })}
          </ScrollView>
          {state.categoriesError && <Button label="โหลดหมวดหมู่ไม่สำเร็จ ลองใหม่" onPress={() => { void productCatalogStore.loadCategories(); }} />}
        </View>
        <FlatList
          style={{ flex: 1 }}
          numColumns={2}
          columnWrapperStyle={{ gap: 12 }}
          data={state.items}
          keyExtractor={item => String(item.id)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 12, paddingHorizontal: 16, paddingBottom: 24 }}
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
            // แสดงเฉพาะกรณียังไม่เคยโหลดสำเร็จเลย (list error) ต่างจาก footer error ของ loadMore ที่แสดงท้ายรายการแทน
            !state.loaded && state.error ? (
              <Card>
                <ThemedText accessibilityLiveRegion="polite">
                  {catalogErrorMessages[state.error] ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่'}
                </ThemedText>
                <Button label="ลองใหม่อีกครั้ง" onPress={() => { void productCatalogStore.retry(); }} />
              </Card>
            ) : null
          }
          ListEmptyComponent={
            state.loading ? <Loading label="กำลังโหลดสินค้า" />
              : state.loaded && !state.error ? <Card><ThemedText>{emptyMessage}</ThemedText></Card>
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
        <Button label="กลับ" onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/'); }} />
        <MarketplaceNav selected="home" />
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignSelf: 'center', gap: 0, width: '100%' },
  searchArea: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, gap: 12 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12 },
  searchInput: { flex: 1, minWidth: 0, minHeight: 46, fontFamily: Fonts.sans, fontSize: 14, paddingVertical: 10 },
  chips: { gap: 8 },
  chip: { borderWidth: 1, borderRadius: 24, paddingHorizontal: 15, minHeight: 40, justifyContent: 'center' },
  productCard: { width: '48%', flexGrow: 1, maxWidth: '50%', borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  productInfo: { padding: 10, gap: 8 },
  productName: { fontSize: 14, lineHeight: 22, minHeight: 44 },
  priceRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  condition: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
});
