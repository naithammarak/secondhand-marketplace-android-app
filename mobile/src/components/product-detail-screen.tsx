import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { useOptionalAuth } from '@/auth/auth-provider';
import { marketplaceReturn } from '@/auth/marketplace-return-instance';

import { useTheme } from '@/hooks/use-theme';
import { useThemePreference } from '@/theme/theme-provider';
import { GeometricMascot } from './wondee/brand';
import { ImageViewer } from './wondee/primitives';
import { ProductImage } from '@/components/product-catalog-ui';
import { Button, Card, Loading, Screen } from '@/components/order-ui';
import { ThemedText } from '@/components/themed-text';
import { Fonts, MaxContentWidth } from '@/constants/theme';
import { SellerReviewsModal } from '@/components/seller-reviews-modal';
import { formatBaht } from '@/orders/order-format';
import { parseRouteId } from '@/orders/route-params';
import { productCatalogService, productCatalogStore } from '@/products/product-catalog-instance';
import { createProductDetailStore } from '@/products/product-detail-store';
import { setCachedProductBrand } from '@/hooks/use-product-brand';
import { conditionLabels } from '@/services/product-catalog-service';
import { isCatalogOnlyMode, isBuyerOrdersMode } from '@/runtime/catalog-capability';

const detailErrorMessages: Record<string, string> = {
  'network-error': 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่',
  timeout: 'เซิร์ฟเวอร์ตอบช้าเกินไป',
  'server-error': 'ระบบขัดข้อง กรุณาลองใหม่ภายหลัง',
  unavailable: 'บริการยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง',
  'validation-error': 'คำขอไม่ถูกต้อง',
};

function ChevronLeftIcon({ color = '#0f172a', size = 20 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15 18L9 12L15 6"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ShareIcon({ color = '#0f172a', size = 18 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M8.59 13.51l6.83 3.98m-.01-10.98l-6.82 3.98M21 5a3 3 0 11-6 0 3 3 0 016 0zM7 12a3 3 0 11-6 0 3 3 0 016 0zM21 19a3 3 0 11-6 0 3 3 0 016 0z"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function HeartIcon({ color = '#0f172a', size = 18, filled = false }: { color?: string; size?: number; filled?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? '#f43f5e' : 'none'}>
      <Path
        d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"
        stroke={filled ? '#f43f5e' : color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function CheckmarkIcon({ size = 12 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
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

function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return 'ลงขายเมื่อ 2 วันที่แล้ว';
  try {
    const created = new Date(dateString);
    const now = new Date();
    const diffHours = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60));
    if (diffHours < 24) return `ลงขายเมื่อ ${Math.max(1, diffHours)} ชั่วโมงที่แล้ว`;
    const diffDays = Math.floor(diffHours / 24);
    return `ลงขายเมื่อ ${diffDays} วันที่แล้ว`;
  } catch {
    return 'ลงขายเมื่อไม่นานมานี้';
  }
}

export function ProductDetailScreen() {
  const theme = useTheme();
  const { scheme } = useThemePreference();
  const isDark = scheme === 'dark';
  const catalogOnly = isCatalogOnlyMode();
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, MaxContentWidth);

  const [zoom, setZoom] = useState<string | null>(null);
  const [selection, setSelection] = useState({ productId: NaN, index: 0 });
  const [isLiked, setIsLiked] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [guestSheetVisible, setGuestSheetVisible] = useState(false);
  const [showSellerReviews, setShowSellerReviews] = useState(false);
  const auth = useOptionalAuth();
  const params = useLocalSearchParams<{ id: string }>();
  const id = parseRouteId(params.id) ?? NaN;

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

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/products');
  };

  const selectedImage = selection.productId === id ? selection.index : 0;
  const product = state.product?.id === id ? state.product : null;
  const images = product?.images.slice().sort((a, b) => a.sortOrder - b.sortOrder) ?? [];

  useEffect(() => {
    if (product?.brand?.brandName) {
      setCachedProductBrand(product.id, product.brand.brandName);
    }
  }, [product]);

  const handleShare = async () => {
    if (!product) return;
    try {
      await Share.share({
        title: product.productName,
        message: `${product.productName} ราคา ${formatBaht(product.price)} ที่ 2NDHAND Marketplace`,
      });
    } catch {
      // ignore user cancel
    }
  };

  const isOwnProduct = Boolean(
    product &&
    auth?.session?.user?.id &&
    (product.seller as any)?.id &&
    String((product.seller as any).id) === String(auth.session.user.id)
  );

  const handleBuy = async () => {
    if (!product || catalogOnly) return;
    if (auth && !auth.session) {
      setGuestSheetVisible(true);
      return;
    }
    router.push({
      pathname: '/checkout/[productId]',
      params: { productId: String(product.id) },
    });
  };

  const handleGuestLogin = async () => {
    if (!product || catalogOnly) return;
    setGuestSheetVisible(false);
    await marketplaceReturn.save({ kind: 'checkout', productId: product.id });
    router.push({
      pathname: '/login',
      params: { reason: 'เข้าสู่ระบบเพื่อซื้อสินค้าชิ้นนี้' },
    });
  };

  return (
    <Screen>
      <SafeAreaView style={[styles.page, { backgroundColor: isDark ? '#090D16' : '#F8FAFC' }]}>
        {/* Top Header Navigation */}
        <View
          style={[
            styles.header,
            {
              backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
              borderBottomColor: isDark ? '#1E293B' : '#F1F5F9',
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="กลับ"
            onPress={handleBack}
            style={({ pressed }) => [
              styles.navCircleButton,
              {
                backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                borderColor: isDark ? '#334155' : '#E2E8F0',
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <ChevronLeftIcon color={theme.text} size={20} />
          </Pressable>

          <ThemedText style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
            รายละเอียดสินค้า
          </ThemedText>

          <View style={styles.headerActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="แชร์สินค้า"
              onPress={() => {
                void handleShare();
              }}
              style={({ pressed }) => [
                styles.navCircleButton,
                {
                  backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                  borderColor: isDark ? '#334155' : '#E2E8F0',
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <ShareIcon color={theme.text} size={18} />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="บันทึกในรายการโปรด"
              onPress={() => setIsLiked(!isLiked)}
              style={({ pressed }) => [
                styles.navCircleButton,
                {
                  backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                  borderColor: isDark ? '#334155' : '#E2E8F0',
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <HeartIcon color={theme.text} size={18} filled={isLiked} />
            </Pressable>
          </View>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.body, { maxWidth: MaxContentWidth, alignSelf: 'center', width: '100%' }]}
          showsVerticalScrollIndicator={false}
        >
          {state.loading && <Loading label="กำลังโหลดข้อมูลสินค้า" />}

          {!state.loading && state.notAvailable && (
            <Card>
              <ThemedText accessibilityLiveRegion="polite">
                สินค้าไม่พร้อมแสดง
              </ThemedText>
              <Button
                label="กลับรายการ"
                onPress={() => {
                  void handleBackToList();
                }}
              />
            </Card>
          )}

          {!state.loading && state.error && (
            <Card>
              <ThemedText accessibilityLiveRegion="polite">
                {detailErrorMessages[state.error] ?? 'โหลดข้อมูลสินค้าไม่สำเร็จ กรุณาลองใหม่'}
              </ThemedText>
              <Button
                label="ลองใหม่อีกครั้ง"
                onPress={() => {
                  void store.retry();
                }}
              />
            </Card>
          )}

          {!state.loading && product && (
            <>
              {/* Image Hero Section with Page Counter Overlay */}
              <View style={styles.imageHeroContainer}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="ขยายรูปสินค้า"
                  onPress={() => setZoom(images[selectedImage]?.imageUrl ?? null)}
                  style={styles.heroPressable}
                >
                  <ProductImage
                    uri={images[selectedImage]?.imageUrl}
                    width="100%"
                    height={contentWidth * 0.85}
                    borderRadius={0}
                    accessibilityLabel={`รูปสินค้า ${product.productName}`}
                  />
                </Pressable>

                {/* Badge 1 / N */}
                <View style={styles.pageBadge}>
                  <ThemedText style={styles.pageBadgeText}>
                    {images.length > 0 ? `${selectedImage + 1} / ${images.length}` : '1 / 1'}
                  </ThemedText>
                </View>
              </View>

              {/* Thumbnails row if multiple images exist */}
              {images.length > 1 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.thumbnails}
                >
                  {images.map((image, index) => (
                    <Pressable
                      key={image.imageId}
                      accessibilityRole="button"
                      accessibilityLabel={`ดูรูปที่ ${index + 1}`}
                      accessibilityState={{ selected: selectedImage === index }}
                      onPress={() => setSelection({ productId: id, index })}
                      style={[
                        styles.thumbnail,
                        {
                          borderColor: selectedImage === index ? '#10B981' : isDark ? '#334155' : '#E2E8F0',
                          backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                        },
                      ]}
                    >
                      <ProductImage uri={image.imageUrl} width={56} height={56} borderRadius={8} />
                    </Pressable>
                  ))}
                </ScrollView>
              )}

              {/* Card 1: Clean Price, Condition Badge, Title & Metadata */}
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: isDark ? '#131D2E' : '#FFFFFF',
                    borderColor: isDark ? '#1E293B' : '#EDF2F7',
                  },
                ]}
              >
                {/* Price & Condition Badge Row */}
                <View style={styles.priceRow}>
                  <ThemedText style={styles.priceText}>
                    {formatBaht(product.price)}
                  </ThemedText>

                  {/* Condition badge */}
                  <View
                    style={[
                      styles.conditionBadge,
                      {
                        backgroundColor: isDark ? '#064E3B40' : '#ECFDF5',
                        borderColor: isDark ? '#05966980' : '#A7F3D0',
                      },
                    ]}
                  >
                    <ThemedText style={styles.conditionBadgeText}>
                      {conditionLabels[product.condition]}
                    </ThemedText>
                  </View>
                </View>

                {/* Product Name Title */}
                <ThemedText style={[styles.productTitle, { color: theme.text }]}>
                  {product.productName}
                </ThemedText>

                {/* Metadata Row */}
                <View style={styles.metaRow}>
                  <ThemedText style={styles.metaText}>
                    {formatRelativeTime(product.createdAt)}
                  </ThemedText>
                </View>
              </View>

              {/* Card 2: Specifications 2x2 Grid */}
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: isDark ? '#131D2E' : '#FFFFFF',
                    borderColor: isDark ? '#1E293B' : '#EDF2F7',
                  },
                ]}
              >
                <View style={styles.specGrid}>
                  {/* Top Left: แบรนด์ */}
                  <View style={styles.specCell}>
                    <ThemedText style={styles.specLabel}>แบรนด์</ThemedText>
                    <ThemedText style={[styles.specValue, { color: theme.text }]} numberOfLines={1}>
                      {product.brand?.brandName || 'ไม่ระบุแบรนด์'}
                    </ThemedText>
                  </View>

                  {/* Top Right: หมวดหมู่ */}
                  <View style={styles.specCell}>
                    <ThemedText style={styles.specLabel}>หมวดหมู่</ThemedText>
                    <ThemedText style={[styles.specValue, { color: theme.text }]} numberOfLines={1}>
                      {product.category?.categoryName || 'อื่น ๆ'}
                    </ThemedText>
                  </View>

                  {/* Bottom Left: ขนาด */}
                  <View style={styles.specCell}>
                    <ThemedText style={styles.specLabel}>ขนาด</ThemedText>
                    <ThemedText style={[styles.specValue, { color: theme.text }]} numberOfLines={1}>
                      {product.size || 'Free Size'}
                    </ThemedText>
                  </View>

                  {/* Bottom Right: สภาพ */}
                  <View style={styles.specCell}>
                    <ThemedText style={styles.specLabel}>สภาพ</ThemedText>
                    <ThemedText style={[styles.specValue, { color: theme.text }]} numberOfLines={1}>
                      {conditionLabels[product.condition]}
                    </ThemedText>
                  </View>
                </View>
              </View>

              {/* Card 3: Seller Shop Card (rendered only when seller info exists) */}
              {product.seller && (
                <View
                  style={[
                    styles.card,
                    styles.sellerCard,
                    {
                      backgroundColor: isDark ? '#131D2E' : '#FFFFFF',
                      borderColor: isDark ? '#1E293B' : '#EDF2F7',
                    },
                  ]}
                >
                  <View style={styles.sellerAvatarWrapper}>
                    <GeometricMascot size={32} seed={product.seller.displayName} />
                  </View>

                  <View style={styles.sellerInfo}>
                    <View style={styles.sellerNameRow}>
                      <ThemedText style={[styles.sellerNameText, { color: theme.text }]} numberOfLines={1}>
                        {product.seller.displayName}
                      </ThemedText>
                      {!catalogOnly && !isBuyerOrdersMode() ? <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="ดูรีวิวผู้ขาย"
                        onPress={() => setShowSellerReviews(true)}
                        hitSlop={8}>
                        <ThemedText style={styles.sellerRatingText}>
                          ★ 4.8 <ThemedText style={styles.sellerReviewsText}>(32 รีวิว) ›</ThemedText>
                        </ThemedText>
                      </Pressable> : null}
                      {product.seller.verified && (
                        <View style={styles.verifiedBadge}>
                          <CheckmarkIcon size={10} />
                        </View>
                      )}
                    </View>
                    <ThemedText style={styles.sellerSubText}>
                      {catalogOnly ? 'ผู้ขายผ่านการอนุมัติแล้ว' : 'ผู้ขายยืนยันตัวตนแล้ว • ตอบกลับเร็วมาก'}
                    </ThemedText>
                  </View>

                  {!catalogOnly && !isBuyerOrdersMode() ? <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="ดูร้านค้า"
                    style={({ pressed }) => [
                      styles.viewShopButton,
                      {
                        borderColor: isDark ? '#334155' : '#E2E8F0',
                        backgroundColor: isDark ? '#1E293B40' : '#F8FAFC',
                        opacity: pressed ? 0.75 : 1,
                      },
                    ]}
                  >
                    <ThemedText style={[styles.viewShopButtonText, { color: theme.text }]}>
                      ดูร้านค้า
                    </ThemedText>
                  </Pressable> : null}
                </View>
              )}

              {/* Card 4: Seller Additional Description Card */}
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: isDark ? '#131D2E' : '#FFFFFF',
                    borderColor: isDark ? '#1E293B' : '#EDF2F7',
                  },
                ]}
              >
                <ThemedText style={[styles.descriptionHeader, { color: theme.text }]}>
                  รายละเอียดจากผู้ขาย
                </ThemedText>
                <ThemedText
                  style={[styles.descriptionBody, { color: theme.textSecondary }]}
                  numberOfLines={descExpanded ? undefined : 3}
                >
                  {product.description || 'ผู้ขายไม่ได้ระบุรายละเอียดเพิ่มเติม'}
                </ThemedText>
                {product.description && product.description.length > 50 && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={descExpanded ? 'ย่อ' : 'อ่านเพิ่ม'}
                    onPress={() => setDescExpanded(!descExpanded)}
                    style={{ marginTop: 6 }}
                  >
                    <ThemedText style={styles.descToggleText}>
                      {descExpanded ? 'ย่อ' : 'อ่านเพิ่ม'}
                    </ThemedText>
                  </Pressable>
                )}
              </View>
            </>
          )}
        </ScrollView>

        {/* Sticky Bottom Action Bar */}
        {!state.loading && product && (
          <View
            style={[
              styles.stickyBottom,
              {
                backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                borderTopColor: isDark ? '#1E293B' : '#EDF2F7',
              },
            ]}
          >
            {isOwnProduct && !catalogOnly ? (
              <View style={styles.bottomBarRow}>
                <View style={styles.bottomPriceGroup}>
                  <ThemedText style={styles.bottomPriceLabel}>สินค้าของคุณ</ThemedText>
                  <ThemedText style={[styles.bottomPriceOwnStatus, { color: theme.textSecondary }]}>
                    กำลังลงขาย · {formatBaht(product.price)}
                  </ThemedText>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="แก้ไขสินค้า"
                  onPress={() => router.push(`/product/${product.id}/edit`)}
                  style={({ pressed }) => [
                    styles.editOwnBtn,
                    { opacity: pressed ? 0.8 : 1 },
                  ]}
                >
                  <ThemedText style={styles.editOwnBtnText}>แก้ไขสินค้า</ThemedText>
                </Pressable>
              </View>
            ) : (
              <View style={styles.bottomBarRow}>
                <View style={styles.bottomPriceGroup}>
                  <ThemedText style={styles.bottomPriceLabel}>ราคาสินค้า</ThemedText>
                  <ThemedText style={styles.bottomPriceValue}>
                    {`฿${Math.round(Number(product.price)).toLocaleString()}`}
                  </ThemedText>
                </View>

                {catalogOnly ? (
                  <ThemedText style={{ color: theme.textSecondary, flex: 1, textAlign: 'right', fontSize: 12 }}>
                    โหมดนี้ดูสินค้าได้ แต่ยังสั่งซื้อไม่ได้
                  </ThemedText>
                ) : <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="ซื้อสินค้า"
                  onPress={() => { void handleBuy(); }}
                  style={({ pressed }) => [
                    styles.buyButton,
                    { opacity: pressed ? 0.9 : 1 },
                  ]}
                >
                  <ThemedText style={styles.buyButtonText}>ซื้อสินค้า</ThemedText>
                </Pressable>}
              </View>
            )}
          </View>
        )}

        {/* Guest Login Required Bottom Sheet Modal */}
        {!catalogOnly ? <Modal
          visible={guestSheetVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setGuestSheetVisible(false)}
        >
          <Pressable
            style={styles.sheetOverlay}
            onPress={() => setGuestSheetVisible(false)}
          >
            <Pressable
              style={[
                styles.sheetPanel,
                {
                  backgroundColor: isDark ? '#131D2E' : '#FFFFFF',
                  borderTopColor: isDark ? '#1E293B' : '#E2E8F0',
                },
              ]}
              onPress={e => e.stopPropagation()}
            >
              <View style={styles.sheetHandle} />
              <ThemedText style={[styles.sheetTitle, { color: theme.text }]}>
                เข้าสู่ระบบเพื่อซื้อสินค้า
              </ThemedText>
              <ThemedText style={[styles.sheetSubtitle, { color: theme.textSecondary }]}>
                เข้าสู่ระบบแล้วจะกลับมาที่สินค้าชิ้นนี้ทันที
              </ThemedText>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="เข้าสู่ระบบด้วย Google"
                onPress={() => { void handleGuestLogin(); }}
                style={({ pressed }) => [
                  styles.sheetLoginBtn,
                  { opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <ThemedText style={styles.sheetLoginBtnText}>
                  เข้าสู่ระบบด้วย Google
                </ThemedText>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="ไว้ทีหลัง"
                onPress={() => setGuestSheetVisible(false)}
                style={styles.sheetCancelBtn}
              >
                <ThemedText style={[styles.sheetCancelBtnText, { color: theme.textSecondary }]}>
                  ไว้ทีหลัง
                </ThemedText>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal> : null}

        <ImageViewer uri={zoom} label="รูปสินค้า" onClose={() => setZoom(null)} />

        {!catalogOnly && !isBuyerOrdersMode() && product ? (
          <SellerReviewsModal
            visible={showSellerReviews}
            onClose={() => setShowSellerReviews(false)}
            sellerName={product.seller?.displayName ?? 'ผู้ขาย'}
          />
        ) : null}
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    alignSelf: 'center',
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  navCircleButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: Fonts.displayBold,
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 12,
  },
  imageHeroContainer: {
    width: '100%',
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#0F172A',
  },
  heroPressable: {
    width: '100%',
  },
  pageBadge: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
  },
  pageBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Fonts.displayBold,
    letterSpacing: 1,
  },
  thumbnails: {
    gap: 8,
    paddingVertical: 4,
  },
  thumbnail: {
    padding: 2,
    borderRadius: 10,
    borderWidth: 2,
  },
  card: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  priceText: {
    color: '#10B981',
    fontFamily: Fonts.displayBold,
    fontSize: 24,
    fontWeight: '800',
  },
  strikethroughPrice: {
    color: '#94A3B8',
    fontSize: 14,
    textDecorationLine: 'line-through',
    fontWeight: '500',
  },
  discountBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  discountBadgeText: {
    color: '#F43F5E',
    fontSize: 11,
    fontWeight: '700',
  },
  conditionBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
  },
  conditionBadgeText: {
    color: '#059669',
    fontSize: 12,
    fontWeight: '700',
  },
  productTitle: {
    fontFamily: Fonts.displayBold,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 24,
    marginTop: 10,
  },
  metaRow: {
    marginTop: 8,
  },
  metaText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '400',
  },
  inspectCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  inspectMascotBox: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  inspectInfo: {
    flex: 1,
  },
  inspectHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  inspectTitle: {
    color: '#059669',
    fontFamily: Fonts.displayBold,
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  legitBadge: {
    backgroundColor: '#A7F3D0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  legitBadgeText: {
    color: '#065F46',
    fontSize: 10,
    fontWeight: '800',
  },
  inspectSubtitle: {
    color: '#047857',
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 3,
  },
  specGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 16,
  },
  specCell: {
    width: '50%',
    paddingRight: 8,
  },
  specLabel: {
    color: '#64748B',
    fontSize: 12,
    marginBottom: 4,
    fontWeight: '500',
  },
  specValue: {
    fontFamily: Fonts.displayBold,
    fontSize: 14,
    fontWeight: '700',
  },
  sellerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sellerAvatarWrapper: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  sellerInfo: {
    flex: 1,
  },
  sellerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sellerNameText: {
    fontFamily: Fonts.displayBold,
    fontSize: 14,
    fontWeight: '700',
  },
  sellerRatingText: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 4,
  },
  sellerReviewsText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '400',
  },
  verifiedBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellerSubText: {
    color: '#64748B',
    fontSize: 11.5,
    marginTop: 2,
  },
  viewShopButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  viewShopButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  descriptionHeader: {
    fontFamily: Fonts.displayBold,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  descriptionBody: {
    fontSize: 13,
    lineHeight: 22,
  },
  descToggleText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '700',
  },
  stickyBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -3 },
    elevation: 6,
  },
  bottomPriceGroup: {
    gap: 2,
  },
  bottomPriceLabel: {
    color: '#64748B',
    fontSize: 11.5,
    fontWeight: '500',
  },
  bottomPriceValue: {
    color: '#059669',
    fontFamily: Fonts.displayBold,
    fontSize: 22,
    fontWeight: '800',
  },
  buyButton: {
    backgroundColor: '#059669',
    borderRadius: 14,
    paddingHorizontal: 28,
    paddingVertical: 13,
    shadowColor: '#059669',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  buyButtonText: {
    color: '#FFFFFF',
    fontFamily: Fonts.displayBold,
    fontSize: 15,
    fontWeight: '700',
  },
  bottomBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  bottomPriceOwnStatus: {
    fontSize: 12,
    fontWeight: '600',
  },
  editOwnBtn: {
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#059669',
    backgroundColor: '#ECFDF5',
  },
  editOwnBtnText: {
    color: '#059669',
    fontFamily: Fonts.displayBold,
    fontSize: 14,
    fontWeight: '700',
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  sheetPanel: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 32,
    alignItems: 'center',
    gap: 10,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(100, 116, 139, 0.4)',
    marginBottom: 8,
  },
  sheetTitle: {
    fontSize: 18,
    fontFamily: Fonts.displayBold,
    fontWeight: '800',
    textAlign: 'center',
  },
  sheetSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 8,
  },
  sheetLoginBtn: {
    width: '100%',
    height: 48,
    borderRadius: 14,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetLoginBtnText: {
    color: '#FFFFFF',
    fontFamily: Fonts.displayBold,
    fontSize: 14,
    fontWeight: '700',
  },
  sheetCancelBtn: {
    paddingVertical: 8,
    width: '100%',
    alignItems: 'center',
  },
  sheetCancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
