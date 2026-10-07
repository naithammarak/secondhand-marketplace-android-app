import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { useOptionalAuth } from '@/auth/auth-provider';
import { marketplaceReturn } from '@/auth/marketplace-return-instance';

import { useTheme } from '@/hooks/use-theme';
import { useThemePreference } from '@/theme/theme-provider';
import { EmptyState, ErrorState, ImageViewer, Skeleton } from './wondee/primitives';
import { ProductImage, cardConditionLabels, conditionBadgeTheme } from '@/components/product-catalog-ui';
import { Screen } from '@/components/order-ui';
import { ThemedText } from '@/components/themed-text';
import { Fonts, MaxContentWidth } from '@/constants/theme';
import { SellerReviewsModal } from '@/components/seller-reviews-modal';
import { formatBaht } from '@/orders/order-format';
import { parseRouteId } from '@/orders/route-params';
import { productCatalogService, productCatalogStore } from '@/products/product-catalog-instance';
import { createProductDetailStore } from '@/products/product-detail-store';
import { setCachedProductBrand } from '@/hooks/use-product-brand';
import { useSellerReviews } from '@/reviews/use-seller-reviews';
import {
  conditionLabels,
  type ProductDetail,
  type PublicSeller,
} from '@/services/product-catalog-service';

const detailErrorMessages: Record<string, string> = {
  'network-error': 'กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่',
  timeout: 'เซิร์ฟเวอร์ตอบช้าเกินไป',
  'server-error': 'ระบบขัดข้อง กรุณาลองใหม่ภายหลัง',
  unavailable: 'บริการยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง',
  'validation-error': 'คำขอไม่ถูกต้อง',
};

const productStatusLabels: Record<string, string> = {
  AVAILABLE: 'กำลังลงขาย',
  RESERVED: 'มีผู้จองแล้ว',
  SOLD: 'ขายแล้ว',
  CANCELLED: 'ยกเลิกการขาย',
};

function ChevronLeftIcon({ color, size = 20 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M15 19l-7-7 7-7" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function VerifiedIcon({ size = 14 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Circle cx={10} cy={10} r={8} fill="#10b981" />
      <Path d="M6.5 10.2l2.2 2.2 4.6-4.6" stroke="#ffffff" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** เวลาลงขายจาก created_at จริงเท่านั้น ไม่มีค่าให้ซ่อน */
export function formatListedAgo(dateString: string | null, now: Date = new Date()): string | null {
  if (!dateString) return null;
  const created = new Date(dateString);
  if (Number.isNaN(created.getTime())) return null;
  const diffMinutes = Math.floor((now.getTime() - created.getTime()) / 60000);
  if (diffMinutes < 60) return 'ลงขายเมื่อไม่นานมานี้';
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `ลงขายเมื่อ ${diffHours} ชั่วโมงที่แล้ว`;
  return `ลงขายเมื่อ ${Math.floor(diffHours / 24)} วันที่แล้ว`;
}

/** "หมวดแม่ › หมวดย่อย" เมื่อรู้ชื่อหมวดแม่จาก GET /categories; ไม่รู้ให้แสดงชื่อหมวดอย่างเดียว */
function categoryPath(product: ProductDetail): string | null {
  const name = product.category?.categoryName?.trim();
  if (!name) return null;
  const parentId = product.category.parentCategoryId;
  const parent = parentId == null
    ? null
    : productCatalogStore.getSnapshot().categories.find(category => category.id === parentId);
  return parent ? `${parent.categoryName} › ${name}` : name;
}

/** ตัวอักษรแรกของชื่อร้านแบบ design (ตัดคำว่า "ร้าน" นำหน้า ไม่งั้นทุกร้านได้ "ร") */
export function sellerInitial(displayName: string): string {
  const name = displayName.trim().replace(/^ร้าน\s*/, '') || displayName.trim();
  return Array.from(name)[0]?.toUpperCase() ?? '?';
}

function SellerCard({ seller, onOpenReviews }: { seller: PublicSeller; onOpenReviews(): void }) {
  const theme = useTheme();
  const { page, busy, error } = useSellerReviews(seller.id ?? null);
  const initial = sellerInitial(seller.displayName);
  const rating = page?.summary.average_rating ?? null;
  const reviewText = busy
    ? 'กำลังโหลดรีวิว'
    : error || !page
      ? 'ดูรีวิว ›'
      : rating === null
        ? 'ยังไม่มีรีวิว ›'
        : null;

  return (
    <View style={[styles.card, styles.sellerCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.sellerAvatar}>
        <ThemedText style={styles.sellerInitial}>{initial}</ThemedText>
      </View>
      <View style={styles.sellerInfo}>
        <View style={styles.sellerNameRow}>
          <ThemedText numberOfLines={1} style={[styles.sellerName, { color: theme.text }]}>
            {seller.displayName}
          </ThemedText>
          {seller.id ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="ดูรีวิวผู้ขาย"
              onPress={onOpenReviews}
              hitSlop={8}
              style={styles.ratingButton}
            >
              {reviewText ? (
                <ThemedText style={[styles.ratingMuted, { color: theme.textSecondary }]}>{reviewText}</ThemedText>
              ) : (
                <ThemedText style={styles.ratingValue}>
                  {`★ ${rating!.toFixed(1)} `}
                  <ThemedText style={[styles.ratingMuted, { color: theme.textSecondary }]}>
                    {`(${page!.summary.count} รีวิว) ›`}
                  </ThemedText>
                </ThemedText>
              )}
            </Pressable>
          ) : null}
        </View>
        {seller.verified ? (
          <View style={styles.verifiedRow}>
            <VerifiedIcon />
            <ThemedText style={styles.verifiedText}>ผู้ขายยืนยันตัวตนแล้ว</ThemedText>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function DetailSkeleton({ size }: { size: number }) {
  return (
    <View>
      <View style={{ height: size, overflow: 'hidden' }}>
        <Skeleton height={size} label="กำลังโหลดข้อมูลสินค้า" />
      </View>
      <View style={{ padding: 16, gap: 12 }}>
        <View style={{ width: 112 }}><Skeleton height={28} /></View>
        <Skeleton height={16} />
        <View style={{ width: '66%' }}><Skeleton height={16} /></View>
        <Skeleton height={96} />
      </View>
    </View>
  );
}

export function ProductDetailScreen() {
  const theme = useTheme();
  const { scheme } = useThemePreference();
  const isDark = scheme === 'dark';
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, MaxContentWidth);

  const [zoom, setZoom] = useState<string | null>(null);
  const [selection, setSelection] = useState({ productId: NaN, index: 0 });
  const [descExpanded, setDescExpanded] = useState(false);
  const [guestSheetVisible, setGuestSheetVisible] = useState(false);
  const [showSellerReviews, setShowSellerReviews] = useState(false);
  const [solidTopbar, setSolidTopbar] = useState(false);
  const galleryRef = useRef<ScrollView>(null);
  // ระหว่างเลื่อนไปรูปที่กดจาก thumbnail ไม่อัปเดต state จาก onScroll (re-render กลางทางทำให้ web หยุดเลื่อนค้าง)
  const galleryTarget = useRef<{ index: number; timer: ReturnType<typeof setTimeout> } | null>(null);
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

  useEffect(() => () => {
    if (galleryTarget.current) clearTimeout(galleryTarget.current.timer);
  }, []);

  useEffect(() => {
    if (product?.brand?.brandName) {
      setCachedProductBrand(product.id, product.brand.brandName);
    }
  }, [product]);

  // เทียบ users.id ของบัญชีที่ login กับ seller.id ของสินค้า (backend ก็กันซื้อของตัวเองอยู่แล้ว)
  const ownerId = auth?.account?.source === 'backend' ? auth.account.userId : undefined;
  const isOwnProduct = Boolean(product?.seller?.id && ownerId && product.seller.id === ownerId);

  const handleBuy = async () => {
    if (!product) return;
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
    if (!product) return;
    setGuestSheetVisible(false);
    await marketplaceReturn.save({ kind: 'checkout', productId: product.id });
    router.push({
      pathname: '/login',
      params: { reason: 'เข้าสู่ระบบเพื่อซื้อสินค้าชิ้นนี้' },
    });
  };

  const onPageScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const solid = event.nativeEvent.contentOffset.y > contentWidth * 0.75;
    if (solid !== solidTopbar) setSolidTopbar(solid);
  };

  const onGalleryScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = event.nativeEvent.contentOffset.x;
    const target = galleryTarget.current;
    if (target) {
      if (Math.abs(x - target.index * contentWidth) > 2) return;
      clearTimeout(target.timer);
      galleryTarget.current = null;
    }
    const index = Math.round(x / contentWidth);
    if (index !== selectedImage && index >= 0 && index < images.length) {
      setSelection({ productId: id, index });
    }
  };

  const goToImage = (index: number) => {
    if (galleryTarget.current) clearTimeout(galleryTarget.current.timer);
    galleryTarget.current = {
      index,
      timer: setTimeout(() => {
        galleryTarget.current = null;
      }, 800),
    };
    setSelection({ productId: id, index });
    // กระโดดทันที: smooth scroll ร่วมกับ scroll-snap บนเว็บหยุดกลางทางเมื่อเลื่อนข้ามหลายรูป
    galleryRef.current?.scrollTo({ x: index * contentWidth, animated: false });
  };

  const showContent = !state.loading && product;
  // แถบบนทึบเมื่อเลื่อนพ้นรูป หรือเมื่อไม่มีรูปให้ซ้อน (โหลด/ไม่พบ/ผิดพลาด)
  const topbarSolid = solidTopbar || !showContent;
  const description = product?.description?.trim() ?? '';
  const descriptionIsLong = description.length > 160 || description.split('\n').length > 4;
  const listedAgo = product ? formatListedAgo(product.createdAt) : null;
  const category = product ? categoryPath(product) : null;
  const badgeTheme = product ? conditionBadgeTheme[product.condition] ?? conditionBadgeTheme.UNKNOWN : null;
  const barColor = isDark ? '#121622' : '#ffffff';

  return (
    <Screen>
      <SafeAreaView style={[styles.page, { backgroundColor: theme.background }]}>
        <View style={{ flex: 1 }}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[
              styles.body,
              { maxWidth: MaxContentWidth, alignSelf: 'center', width: '100%' },
              !showContent && { paddingTop: 56 },
            ]}
            showsVerticalScrollIndicator={false}
            onScroll={onPageScroll}
            scrollEventThrottle={16}
          >
            {state.loading && <DetailSkeleton size={contentWidth} />}

            {!state.loading && state.notAvailable && (
              <View style={styles.stateWrap}>
                <EmptyState title="สินค้าไม่พร้อมแสดง" detail="สินค้านี้อาจถูกขายหรือยกเลิกการขายแล้ว">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="กลับรายการ"
                    onPress={() => {
                      void handleBackToList();
                    }}
                    style={styles.primaryStateButton}
                  >
                    <ThemedText style={styles.primaryStateText}>กลับรายการ</ThemedText>
                  </Pressable>
                </EmptyState>
              </View>
            )}

            {!state.loading && state.error && (
              <View style={styles.stateWrap}>
                <ErrorState
                  icon={state.error === 'network-error' || state.error === 'timeout' ? 'offline' : 'alert'}
                  title={state.error === 'network-error' ? 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้' : 'โหลดข้อมูลสินค้าไม่สำเร็จ'}
                  detail={detailErrorMessages[state.error] ?? 'โหลดข้อมูลสินค้าไม่สำเร็จ กรุณาลองใหม่'}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="ลองใหม่อีกครั้ง"
                    onPress={() => {
                      void store.retry();
                    }}
                    style={styles.primaryStateButton}
                  >
                    <ThemedText style={styles.primaryStateText}>ลองใหม่อีกครั้ง</ThemedText>
                  </Pressable>
                </ErrorState>
              </View>
            )}

            {showContent && (
              <>
                {/* แกลเลอรี: ปัดซ้าย-ขวา แตะเพื่อขยาย */}
                <View style={{ width: contentWidth, height: contentWidth }}>
                  {images.length > 0 ? (
                    <ScrollView
                      ref={galleryRef}
                      horizontal
                      pagingEnabled
                      showsHorizontalScrollIndicator={false}
                      onScroll={onGalleryScroll}
                      scrollEventThrottle={32}
                    >
                      {images.map((image, index) => (
                        <Pressable
                          key={image.imageId}
                          accessibilityRole="button"
                          accessibilityLabel={`ขยายรูปที่ ${index + 1}`}
                          onPress={() => setZoom(image.imageUrl)}
                          style={{ width: contentWidth, height: contentWidth }}
                        >
                          <ProductImage
                            uri={image.imageUrl}
                            width={contentWidth}
                            height={contentWidth}
                            borderRadius={0}
                            accessibilityLabel={`รูปสินค้า ${product.productName}`}
                          />
                        </Pressable>
                      ))}
                    </ScrollView>
                  ) : (
                    <ProductImage
                      uri={null}
                      width={contentWidth}
                      height={contentWidth}
                      borderRadius={0}
                      accessibilityLabel={`รูปสินค้า ${product.productName}`}
                    />
                  )}
                  {images.length > 1 && (
                    <View style={styles.pageBadge}>
                      <ThemedText style={styles.pageBadgeText}>
                        {`${selectedImage + 1} / ${images.length}`}
                      </ThemedText>
                    </View>
                  )}
                </View>

                {images.length > 1 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.thumbnails}
                  >
                    {images.map((image, index) => {
                      const selected = selectedImage === index;
                      return (
                        <Pressable
                          key={image.imageId}
                          accessibilityRole="button"
                          accessibilityLabel={`ดูรูปที่ ${index + 1}`}
                          accessibilityState={{ selected }}
                          onPress={() => goToImage(index)}
                          style={[
                            styles.thumbnail,
                            { borderColor: selected ? '#10b981' : 'transparent', opacity: selected ? 1 : 0.6 },
                          ]}
                        >
                          <ProductImage uri={image.imageUrl} width={48} height={48} borderRadius={8} />
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}

                <View style={styles.details}>
                  {/* ราคา + ชื่อ + สภาพ */}
                  <View>
                    <ThemedText style={styles.priceText}>{formatBaht(product.price)}</ThemedText>
                    <ThemedText style={[styles.productTitle, { color: theme.text }]}>
                      {product.productName}
                    </ThemedText>
                    {badgeTheme && (
                      <View style={styles.conditionRow}>
                        <View
                          accessibilityLabel={conditionLabels[product.condition]}
                          style={[styles.conditionBadge, { backgroundColor: badgeTheme.bg }]}
                        >
                          <ThemedText style={[styles.conditionBadgeText, { color: badgeTheme.text }]}>
                            {cardConditionLabels[product.condition]}
                          </ThemedText>
                        </View>
                      </View>
                    )}
                    {listedAgo && (
                      <ThemedText style={[styles.metaText, { color: isDark ? '#64748b' : '#94a3b8' }]}>
                        {listedAgo}
                      </ThemedText>
                    )}
                  </View>

                  {/* ข้อมูลสินค้า: แสดงเฉพาะค่าที่ API ส่งมา */}
                  <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    {[
                      { label: 'แบรนด์', value: product.brand?.brandName?.trim() || null },
                      { label: 'หมวดหมู่', value: category },
                      { label: 'ขนาด', value: product.size?.trim() || null },
                    ]
                      .filter(row => row.value)
                      .map((row, index) => (
                        <View
                          key={row.label}
                          style={[
                            styles.specRow,
                            index > 0 && { borderTopWidth: 1, borderTopColor: 'rgba(100, 116, 139, 0.15)' },
                          ]}
                        >
                          <ThemedText style={[styles.specLabel, { color: theme.textSecondary }]}>{row.label}</ThemedText>
                          <ThemedText numberOfLines={2} style={[styles.specValue, { color: theme.text }]}>
                            {row.value}
                          </ThemedText>
                        </View>
                      ))}
                  </View>

                  {product.seller && (
                    <SellerCard seller={product.seller} onOpenReviews={() => setShowSellerReviews(true)} />
                  )}

                  {/* คำอธิบายจากผู้ขาย */}
                  <View>
                    <ThemedText style={[styles.descriptionHeader, { color: theme.text }]}>
                      รายละเอียดจากผู้ขาย
                    </ThemedText>
                    <ThemedText
                      style={[styles.descriptionBody, { color: theme.textSecondary }]}
                      numberOfLines={descExpanded || !descriptionIsLong ? undefined : 4}
                    >
                      {description || 'ผู้ขายไม่ได้ระบุรายละเอียดเพิ่มเติม'}
                    </ThemedText>
                    {descriptionIsLong && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={descExpanded ? 'ย่อ' : 'อ่านเพิ่ม'}
                        onPress={() => setDescExpanded(!descExpanded)}
                        style={{ marginTop: 4, alignSelf: 'flex-start' }}
                      >
                        <ThemedText style={styles.descToggleText}>{descExpanded ? 'ย่อ' : 'อ่านเพิ่ม'}</ThemedText>
                      </Pressable>
                    )}
                  </View>
                </View>
              </>
            )}
          </ScrollView>

          {/* หัวจอ: โปร่งบนรูป → ทึบ + ชื่อสินค้าเมื่อเลื่อนพ้นรูป */}
          <View
            style={[
              styles.topbar,
              topbarSolid && {
                backgroundColor: barColor,
                borderBottomColor: 'rgba(100, 116, 139, 0.2)',
                borderBottomWidth: 1,
              },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="กลับ"
              onPress={handleBack}
              style={({ pressed }) => [
                styles.roundButton,
                { backgroundColor: topbarSolid ? 'transparent' : 'rgba(15, 23, 42, 0.55)' },
                { transform: [{ scale: pressed ? 0.94 : 1 }] },
              ]}
            >
              <ChevronLeftIcon color={topbarSolid ? theme.text : '#ffffff'} />
            </Pressable>
            {product && solidTopbar ? (
              <ThemedText numberOfLines={1} style={[styles.topbarTitle, { color: theme.text }]}>
                {product.productName}
              </ThemedText>
            ) : null}
          </View>
        </View>

        {/* แถบล่าง */}
        {showContent && (
          <View style={[styles.bottomBar, { backgroundColor: barColor, borderTopColor: theme.border }]}>
            {isOwnProduct ? (
              <>
                <View style={styles.bottomPriceGroup}>
                  <ThemedText style={[styles.bottomLabel, { color: isDark ? '#64748b' : '#94a3b8' }]}>
                    สินค้าของคุณ
                  </ThemedText>
                  <ThemedText style={[styles.bottomOwnStatus, { color: theme.textSecondary }]}>
                    {`${productStatusLabels[product.status] ?? product.status} · ${formatBaht(product.price)}`}
                  </ThemedText>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="แก้ไขสินค้า"
                  onPress={() => router.push({ pathname: '/product/[id]/edit', params: { id: String(product.id) } })}
                  style={({ pressed }) => [
                    styles.editOwnButton,
                    { backgroundColor: theme.backgroundElement, transform: [{ scale: pressed ? 0.97 : 1 }] },
                  ]}
                >
                  <ThemedText style={styles.editOwnText}>แก้ไขสินค้า</ThemedText>
                </Pressable>
              </>
            ) : (
              <>
                <View style={styles.bottomPriceGroup}>
                  <ThemedText style={[styles.bottomLabel, { color: isDark ? '#64748b' : '#94a3b8' }]}>
                    ราคาสินค้า
                  </ThemedText>
                  <ThemedText style={styles.bottomPrice}>{formatBaht(product.price)}</ThemedText>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="ซื้อสินค้า"
                  onPress={() => {
                    void handleBuy();
                  }}
                  style={({ pressed }) => [
                    styles.buyButton,
                    { backgroundColor: pressed ? '#10b981' : '#059669', transform: [{ scale: pressed ? 0.97 : 1 }] },
                  ]}
                >
                  <ThemedText style={styles.buyButtonText}>ซื้อสินค้า</ThemedText>
                </Pressable>
              </>
            )}
          </View>
        )}

        {/* Bottom sheet: guest กดซื้อ */}
        <Modal
          visible={guestSheetVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setGuestSheetVisible(false)}
        >
          <Pressable style={styles.sheetOverlay} onPress={() => setGuestSheetVisible(false)}>
            <Pressable
              style={[styles.sheetPanel, { backgroundColor: theme.surface, borderTopColor: theme.border }]}
              onPress={e => e.stopPropagation()}
            >
              <View style={styles.sheetHandle} />
              <ThemedText style={[styles.sheetTitle, { color: theme.text }]}>เข้าสู่ระบบเพื่อซื้อสินค้า</ThemedText>
              <ThemedText style={[styles.sheetSubtitle, { color: theme.textSecondary }]}>
                เข้าสู่ระบบแล้วจะกลับมาที่สินค้าชิ้นนี้ทันที
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="เข้าสู่ระบบด้วย Google"
                onPress={() => {
                  void handleGuestLogin();
                }}
                style={({ pressed }) => [styles.sheetLoginBtn, { opacity: pressed ? 0.85 : 1 }]}
              >
                <ThemedText style={styles.sheetLoginBtnText}>เข้าสู่ระบบด้วย Google</ThemedText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="ไว้ทีหลัง"
                onPress={() => setGuestSheetVisible(false)}
                style={styles.sheetCancelBtn}
              >
                <ThemedText style={[styles.sheetCancelBtnText, { color: theme.textSecondary }]}>ไว้ทีหลัง</ThemedText>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

        <ImageViewer uri={zoom} label="รูปสินค้า" onClose={() => setZoom(null)} />

        {product ? (
          <SellerReviewsModal
            sellerId={product.seller?.id ?? null}
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
  page: { flex: 1, alignSelf: 'center', width: '100%' },
  body: { paddingBottom: 24 },
  stateWrap: { paddingTop: 48 },
  primaryStateButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#059669',
  },
  primaryStateText: { fontSize: 12, fontWeight: '700', color: '#ffffff' },

  topbar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  roundButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  topbarTitle: { flex: 1, fontSize: 14, fontWeight: '700' },

  pageBadge: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  pageBadgeText: { color: '#ffffff', fontSize: 10, lineHeight: 15, fontWeight: '700' },
  thumbnails: { gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  thumbnail: { width: 52, height: 52, borderRadius: 10, borderWidth: 2, overflow: 'hidden' },

  details: { paddingHorizontal: 16, paddingTop: 16, gap: 16 },
  priceText: { fontFamily: Fonts.extraBold, fontSize: 26, lineHeight: 34, fontWeight: '800', color: '#10b981' },
  productTitle: { fontFamily: Fonts.displayBold, fontSize: 16, lineHeight: 23, fontWeight: '700', marginTop: 6 },
  conditionRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  conditionBadge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  conditionBadgeText: { fontSize: 10, lineHeight: 14, fontWeight: '800' },
  metaText: { fontSize: 11, lineHeight: 16, marginTop: 8 },

  card: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  specLabel: { fontSize: 12, lineHeight: 17 },
  specValue: { flexShrink: 1, fontSize: 12, lineHeight: 17, fontWeight: '600', textAlign: 'right' },

  sellerCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  sellerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(5, 150, 105, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellerInitial: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: '#10b981' },
  sellerInfo: { flex: 1, minWidth: 0, gap: 2 },
  sellerNameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 6 },
  sellerName: { flexShrink: 1, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  ratingButton: { flexShrink: 0 },
  ratingValue: { fontSize: 12, lineHeight: 18, fontWeight: '700', color: '#f59e0b' },
  ratingMuted: { fontSize: 12, lineHeight: 18, fontWeight: '400' },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  verifiedText: { fontSize: 11, lineHeight: 16, fontWeight: '600', color: '#10b981' },

  descriptionHeader: { fontFamily: Fonts.displayBold, fontSize: 14, lineHeight: 20, fontWeight: '700', marginBottom: 6 },
  descriptionBody: { fontSize: 12, lineHeight: 20 },
  descToggleText: { fontSize: 12, fontWeight: '700', color: '#10b981' },

  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  bottomPriceGroup: { flex: 1, minWidth: 0 },
  bottomLabel: { fontSize: 10, lineHeight: 14 },
  bottomPrice: { fontFamily: Fonts.extraBold, fontSize: 18, lineHeight: 24, fontWeight: '800', color: '#10b981' },
  bottomOwnStatus: { fontSize: 12, lineHeight: 17, fontWeight: '600' },
  buyButton: {
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#064e3b',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  buyButtonText: { color: '#ffffff', fontSize: 14, lineHeight: 20, fontWeight: '700' },
  editOwnButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.5)',
  },
  editOwnText: { color: '#10b981', fontSize: 14, lineHeight: 20, fontWeight: '700' },

  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
  sheetPanel: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
    alignItems: 'center',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(100, 116, 139, 0.4)',
    marginBottom: 16,
  },
  sheetTitle: { fontSize: 16, lineHeight: 24, fontWeight: '700', textAlign: 'center' },
  sheetSubtitle: { fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 4 },
  sheetLoginBtn: {
    width: '100%',
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetLoginBtnText: { color: '#ffffff', fontSize: 14, lineHeight: 20, fontWeight: '700' },
  sheetCancelBtn: { marginTop: 8, paddingVertical: 10, width: '100%', alignItems: 'center' },
  sheetCancelBtnText: { fontSize: 12, fontWeight: '600' },
});
