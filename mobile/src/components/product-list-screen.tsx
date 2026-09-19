import { router } from 'expo-router';
import { useEffect, useSyncExternalStore } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProductImage } from '@/components/product-catalog-ui';
import { Button, Card, Loading, Screen, styles as orderUiStyles } from '@/components/order-ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
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
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={item.productName} onPress={onPress}>
      <Card>
        <View style={styles.row}>
          <ProductImage uri={item.mainImage?.imageUrl} accessibilityLabel={`รูปสินค้า ${item.productName}`} />
          <View style={styles.info}>
            <ThemedText type="smallBold" numberOfLines={2}>{item.productName}</ThemedText>
            <ThemedText type="smallBold">{formatBaht(item.price)}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{conditionLabels[item.condition]}</ThemedText>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

export function ProductListScreen() {
  const state = useSyncExternalStore(
    productCatalogStore.subscribe, productCatalogStore.getSnapshot, productCatalogStore.getSnapshot,
  );

  useEffect(() => {
    // เข้าหน้านี้ครั้งแรกให้โหลดรายการ ถ้าเคยโหลดไว้แล้ว (กลับจาก detail) ไม่โหลดซ้ำ เพื่อรักษาคำค้น/ตำแหน่งรายการ
    if (!state.loaded) void productCatalogStore.load();
  }, [state.loaded]);

  const emptyMessage = state.query.trim() ? 'ไม่พบสินค้าตามคำค้น' : 'ยังไม่มีสินค้า';

  return (
    <Screen>
      <SafeAreaView style={[orderUiStyles.content, { flex: 1, alignSelf: 'center', padding: Spacing.three, width: '100%' }]}>
        <ThemedText type="subtitle">ค้นหาสินค้า</ThemedText>
        <TextInput
          style={orderUiStyles.input}
          value={state.query}
          onChangeText={text => productCatalogStore.setQuery(text)}
          placeholder="ค้นหาชื่อสินค้า"
          accessibilityLabel="ค้นหาชื่อสินค้า"
          returnKeyType="search"
        />
        <FlatList
          data={state.items}
          keyExtractor={item => String(item.id)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: Spacing.three, paddingBottom: Spacing.four, paddingTop: Spacing.three }}
          refreshControl={
            <RefreshControl refreshing={state.refreshing} onRefresh={() => { void productCatalogStore.refresh(); }} />
          }
          onEndReachedThreshold={0.3}
          onEndReached={() => { void productCatalogStore.loadMore(); }}
          renderItem={({ item }) => (
            <ProductCard
              item={item}
              onPress={() => router.push({ pathname: '/products/[id]', params: { id: String(item.id) } })}
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
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.three, alignItems: 'center' },
  info: { flex: 1, gap: Spacing.one },
});
