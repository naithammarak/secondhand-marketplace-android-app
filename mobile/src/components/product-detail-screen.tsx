import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProductImage } from '@/components/product-catalog-ui';
import { Button, Card, Loading, Row, Screen, styles as orderUiStyles } from '@/components/order-ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { formatBaht } from '@/orders/order-format';
import { parseRouteId } from '@/orders/route-params';
import { productCatalogService, productCatalogStore } from '@/products/product-catalog-instance';
import { createProductDetailStore } from '@/products/product-detail-store';
import { conditionLabels } from '@/services/product-catalog-service';

const detailErrorMessages: Record<string, string> = {
  'network-error': 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่',
  timeout: 'เซิร์ฟเวอร์ตอบช้าเกินไป',
  'server-error': 'ระบบขัดข้อง กรุณาลองใหม่ภายหลัง',
  unavailable: 'บริการยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง',
  'validation-error': 'คำขอไม่ถูกต้อง',
};

export function ProductDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  // id ที่ parse ไม่ได้ส่งเป็น NaN ให้ store เองปฏิเสธเป็น not-available โดยไม่เรียก service (ดู isValidProductId)
  const id = parseRouteId(params.id) ?? NaN;

  // detail store ไม่ใช่ singleton: สร้างใหม่ต่อ instance ของหน้านี้ ผูก lifecycle กับ React เอง
  const [store] = useState(() => createProductDetailStore(productCatalogService));
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  useEffect(() => {
    void store.open(id);
  }, [id, store]);

  async function handleBackToList() {
    await productCatalogStore.refresh();
    if (router.canGoBack()) router.back();
    else router.replace('/products');
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={orderUiStyles.scrollContent}>
        <SafeAreaView style={[orderUiStyles.content, { width: '100%' }]}>
          {state.loading && <Loading label="กำลังโหลดข้อมูลสินค้า" />}

          {!state.loading && state.notAvailable && (
            <Card>
              <ThemedText accessibilityLiveRegion="polite">สินค้าไม่พร้อมแสดง</ThemedText>
              <Button label="กลับรายการ" onPress={() => { void handleBackToList(); }} />
            </Card>
          )}

          {!state.loading && state.error && (
            <Card>
              <ThemedText accessibilityLiveRegion="polite">
                {detailErrorMessages[state.error] ?? 'โหลดข้อมูลสินค้าไม่สำเร็จ กรุณาลองใหม่'}
              </ThemedText>
              <Button label="ลองใหม่อีกครั้ง" onPress={() => { void store.retry(); }} />
            </Card>
          )}

          {!state.loading && state.product && (
            <View style={{ gap: Spacing.three }}>
              <View style={styles.imageRow}>
                {state.product.images.length > 0 ? (
                  state.product.images
                    .slice()
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map(image => (
                      <ProductImage
                        key={image.imageId}
                        uri={image.imageUrl}
                        width={140}
                        height={140}
                        accessibilityLabel={`รูปสินค้า ${state.product?.productName ?? ''}`}
                      />
                    ))
                ) : (
                  <ProductImage
                    uri={null}
                    width={140}
                    height={140}
                    accessibilityLabel={`รูปสินค้า ${state.product?.productName ?? ''}`}
                  />
                )}
              </View>

              <Card>
                <ThemedText type="subtitle">{state.product.productName}</ThemedText>
                <ThemedText type="smallBold">{formatBaht(state.product.price)}</ThemedText>
                <Row label="หมวดหมู่" value={state.product.category.categoryName} />
                <Row label="แบรนด์" value={state.product.brand.brandName} />
                <Row label="ขนาด" value={state.product.size} />
                <Row label="สภาพ" value={conditionLabels[state.product.condition]} />
                <ThemedText type="small" themeColor="textSecondary">{state.product.description}</ThemedText>
              </Card>
            </View>
          )}

          <Button label="กลับ" onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/products'); }} />
        </SafeAreaView>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  imageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
