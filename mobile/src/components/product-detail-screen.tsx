import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';
import { MarketplaceHeader } from './marketplace-header';
import { WondeeMascot } from './wondee/brand';
import { ImageViewer } from './wondee/primitives';
import { ProductImage } from '@/components/product-catalog-ui';
import { Button, Card, Loading, Row, Screen, styles as orderUiStyles } from '@/components/order-ui';
import { ThemedText } from '@/components/themed-text';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { formatBaht } from '@/orders/order-format';
import { parseRouteId } from '@/orders/route-params';
import { productCatalogService, productCatalogStore } from '@/products/product-catalog-instance';
import { createProductDetailStore } from '@/products/product-detail-store';
import { setCachedProductBrand } from '@/hooks/use-product-brand';
import { conditionLabels } from '@/services/product-catalog-service';

const detailErrorMessages: Record<string, string> = {
  'network-error': 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่',
  timeout: 'เซิร์ฟเวอร์ตอบช้าเกินไป',
  'server-error': 'ระบบขัดข้อง กรุณาลองใหม่ภายหลัง',
  unavailable: 'บริการยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง',
  'validation-error': 'คำขอไม่ถูกต้อง',
};

export function ProductDetailScreen() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const imageSize = Math.min(width, MaxContentWidth) - 32;
  const [zoom, setZoom] = useState<string | null>(null);
  const [selection, setSelection] = useState({ productId: NaN, index: 0 });
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

  const selectedImage = selection.productId === id ? selection.index : 0;
  const product = state.product?.id === id ? state.product : null;
  const images = product?.images.slice().sort((a, b) => a.sortOrder - b.sortOrder) ?? [];

  useEffect(() => {
    if (product?.brand?.brandName) {
      setCachedProductBrand(product.id, product.brand.brandName);
    }
  }, [product]);
  return (
    <Screen>
      <SafeAreaView style={[orderUiStyles.content, styles.page, { backgroundColor: theme.surface }]}>
        <MarketplaceHeader title="รายละเอียดสินค้า" back />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body}>
          {state.loading && <Loading label="กำลังโหลดข้อมูลสินค้า" />}
          {!state.loading && state.notAvailable && <Card>
            <ThemedText accessibilityLiveRegion="polite">สินค้าไม่พร้อมแสดง</ThemedText>
            <Button label="กลับรายการ" onPress={() => { void handleBackToList(); }} />
          </Card>}
          {!state.loading && state.error && <Card>
            <ThemedText accessibilityLiveRegion="polite">{detailErrorMessages[state.error] ?? 'โหลดข้อมูลสินค้าไม่สำเร็จ กรุณาลองใหม่'}</ThemedText>
            <Button label="ลองใหม่อีกครั้ง" onPress={() => { void store.retry(); }} />
          </Card>}
          {!state.loading && product && <>
<Pressable accessibilityRole="button" accessibilityLabel="ขยายรูปสินค้า" onPress={() => setZoom(images[selectedImage]?.imageUrl ?? null)}>
            <ProductImage uri={images[selectedImage]?.imageUrl} width="100%" height={imageSize * 3 / 4}
              accessibilityLabel={`รูปสินค้า ${product.productName}`} /></Pressable>
            {images.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbnails}>
              {images.map((image, index) => <Pressable key={image.imageId}
                accessibilityRole="button" accessibilityLabel={`ดูรูปที่ ${index + 1}`} accessibilityState={{ selected: selectedImage === index }}
                onPress={() => setSelection({ productId: id, index })} style={[styles.thumbnail, { borderColor: selectedImage === index ? theme.primary : theme.border }]}>
                <ProductImage uri={image.imageUrl} width={64} height={64} borderRadius={7} />
              </Pressable>)}
            </ScrollView>}
            <ThemedText type="title">{product.productName}</ThemedText>
            <ThemedText style={[styles.price, { color: theme.accent }]}>{formatBaht(product.price)}</ThemedText>
            <View style={[styles.condition, { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText type="small" style={{ color: theme.accent }}>{conditionLabels[product.condition]}</ThemedText>
            </View>
            <View>
              <Row label="หมวดหมู่" value={product.category.categoryName} />
              <Row label="แบรนด์" value={product.brand.brandName} />
              <Row label="ขนาด" value={product.size} />
              <Row label="สภาพ" value={conditionLabels[product.condition]} />
            </View>
            {product.seller && <Card><View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><WondeeMascot size={48} /><View style={{ flex: 1 }}><ThemedText type="smallBold">{product.seller.displayName}</ThemedText>{product.seller.verified && <ThemedText type="small" themeColor="success">ร้านค้าที่ได้รับอนุมัติ</ThemedText>}</View></View></Card>}
            <Card><ThemedText type="subtitle">การตรวจสภาพกับวนดี</ThemedText><ThemedText themeColor="textSecondary">ตรวจหลังชำระเงินตามขั้นตอนของระบบ ดูค่าบริการจากสรุปยอดก่อนยืนยันคำสั่งซื้อ</ThemedText></Card>
            <View style={[styles.description, { borderColor: theme.border }]}>
              <ThemedText type="subtitle">รายละเอียด</ThemedText>
              <ThemedText themeColor="textSecondary">{product.description || 'ผู้ขายไม่ได้ระบุรายละเอียดเพิ่มเติม'}</ThemedText>
            </View>
          </>}
        </ScrollView>
        {!state.loading && product && <View style={[styles.purchase, { borderColor: theme.border }]}>
          <Button label="ซื้อสินค้า" variant="primary" onPress={() => router.push({
            pathname: '/checkout/[productId]', params: { productId: String(product.id) },
          })} />
        </View>}
<ImageViewer uri={zoom} label="รูปสินค้า" onClose={() => setZoom(null)} />
      </SafeAreaView>
    </Screen>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, alignSelf: 'center', gap: 0 },
  body: { padding: 16, gap: Spacing.three },
  thumbnails: { gap: 8 },
  thumbnail: { padding: 2, borderRadius: 10, borderWidth: 2 },
  condition: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  description: { gap: 8, borderTopWidth: 1, paddingTop: 16, paddingBottom: 16 },
  purchase: { borderTopWidth: 1, gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  price: { fontFamily: Fonts.displayBold, fontSize: 24, lineHeight: 34 },
});
