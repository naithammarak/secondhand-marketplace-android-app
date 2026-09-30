import { isBuyerOrdersMode } from '@/runtime/catalog-capability';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Rect, G } from 'react-native-svg';

import { useAuth } from '@/auth/auth-provider';
import { MarketplaceHeader } from './marketplace-header';
import { MarketplaceLoginRequired } from '@/components/marketplace-login-required';
import { ThemedText } from '@/components/themed-text';
import { Card, errorText, Loading, Row, Screen } from '@/components/order-ui';
import { TextField } from './wondee/primitives';
import { useTheme } from '@/hooks/use-theme';
import { useThemePreference } from '@/theme/theme-provider';
import { useProductImage } from '@/hooks/use-product-image';
import { emptyAddressForm, type AddressFormValues } from '@/orders/checkout-form';
import { formatBaht } from '@/orders/order-format';
import { useCheckout, useOrderDetail } from '@/orders/orders-provider';
import { CONDITION_LABELS } from '@/services/product-service';
import type { OrderDetailState } from '@/orders/order-detail-store';

const FIELDS: { field: keyof AddressFormValues; label: string; placeholder: string; numeric?: boolean }[] = [
  { field: 'recipientName', label: 'ชื่อผู้รับ', placeholder: 'ชื่อ-นามสกุลผู้รับสินค้า' },
  { field: 'phone', label: 'เบอร์โทรศัพท์', placeholder: 'เช่น 0812345678', numeric: true },
  { field: 'addressLine', label: 'ที่อยู่', placeholder: 'บ้านเลขที่ ถนน ซอย' },
  { field: 'subdistrict', label: 'ตำบล/แขวง', placeholder: 'ตำบลหรือแขวง' },
  { field: 'district', label: 'อำเภอ/เขต', placeholder: 'อำเภอหรือเขต' },
  { field: 'province', label: 'จังหวัด', placeholder: 'จังหวัด' },
  { field: 'postalCode', label: 'รหัสไปรษณีย์', placeholder: '5 หลัก', numeric: true },
];

/** Prototype prefill address */
const CO_SAVED: AddressFormValues = {
  recipientName: 'สมชาย ใจดี',
  phone: '0812345678',
  addressLine: '128/9 ซอยสุขุมวิท 39',
  subdistrict: 'คลองตันเหนือ',
  district: 'วัฒนา',
  province: 'กรุงเทพมหานคร',
  postalCode: '10110',
};

/** Decorative QR illustration, intentionally not a valid payment QR. */
function DecorativeQrIllustration({ size = 160 }: { size?: number }) {
  return (
    <View style={[qrStyles.box, { width: size, height: size }]}>
      <Svg width={size - 24} height={size - 24} viewBox="0 0 100 100">
        {/* Top-left position pattern */}
        <Rect x="5" y="5" width="28" height="28" rx="4" fill="#0f172a" />
        <Rect x="9" y="9" width="20" height="20" rx="2" fill="#ffffff" />
        <Rect x="13" y="13" width="12" height="12" rx="1.5" fill="#0f172a" />

        {/* Top-right position pattern */}
        <Rect x="67" y="5" width="28" height="28" rx="4" fill="#0f172a" />
        <Rect x="71" y="9" width="20" height="20" rx="2" fill="#ffffff" />
        <Rect x="75" y="13" width="12" height="12" rx="1.5" fill="#0f172a" />

        {/* Bottom-left position pattern */}
        <Rect x="5" y="67" width="28" height="28" rx="4" fill="#0f172a" />
        <Rect x="9" y="71" width="20" height="20" rx="2" fill="#ffffff" />
        <Rect x="13" y="75" width="12" height="12" rx="1.5" fill="#0f172a" />

        {/* QR Data Grid simulation */}
        <G fill="#0f172a">
          {/* Alignment & timing marks */}
          <Rect x="38" y="7" width="4" height="4" />
          <Rect x="46" y="7" width="4" height="4" />
          <Rect x="54" y="7" width="4" height="4" />
          <Rect x="7" y="38" width="4" height="4" />
          <Rect x="7" y="46" width="4" height="4" />
          <Rect x="7" y="54" width="4" height="4" />

          {/* Random QR Module Matrix */}
          <Rect x="38" y="18" width="4" height="4" />
          <Rect x="46" y="22" width="4" height="4" />
          <Rect x="54" y="18" width="4" height="4" />
          <Rect x="38" y="30" width="8" height="4" />
          <Rect x="50" y="30" width="4" height="4" />

          {/* Center clusters */}
          <Rect x="20" y="38" width="4" height="4" />
          <Rect x="28" y="38" width="4" height="8" />
          <Rect x="36" y="38" width="8" height="8" />
          <Rect x="48" y="42" width="4" height="4" />
          <Rect x="56" y="38" width="8" height="4" />
          <Rect x="68" y="38" width="4" height="8" />
          <Rect x="76" y="38" width="8" height="4" />
          <Rect x="88" y="38" width="4" height="4" />

          <Rect x="20" y="50" width="8" height="4" />
          <Rect x="32" y="50" width="4" height="4" />
          <Rect x="40" y="50" width="8" height="8" />
          <Rect x="52" y="50" width="4" height="4" />
          <Rect x="60" y="50" width="8" height="4" />
          <Rect x="72" y="50" width="4" height="8" />
          <Rect x="80" y="50" width="8" height="4" />

          {/* Bottom right patterns */}
          <Rect x="38" y="66" width="4" height="4" />
          <Rect x="46" y="66" width="8" height="4" />
          <Rect x="58" y="66" width="4" height="8" />
          <Rect x="66" y="66" width="8" height="4" />
          <Rect x="78" y="66" width="4" height="4" />
          <Rect x="86" y="66" width="8" height="8" />

          <Rect x="38" y="78" width="8" height="4" />
          <Rect x="50" y="74" width="4" height="8" />
          <Rect x="66" y="74" width="4" height="4" />
          <Rect x="74" y="78" width="8" height="8" />
          <Rect x="42" y="86" width="4" height="8" />
          <Rect x="50" y="86" width="8" height="4" />
          <Rect x="62" y="86" width="8" height="4" />
          <Rect x="86" y="86" width="8" height="8" />
        </G>
      </Svg>
    </View>
  );
}

function paymentStateMessage(state: OrderDetailState): string {
  if (state.loadError) return errorText(state.loadError);
  if (state.order?.status === 'CANCELLED') {
    return state.order.cancelReason === 'EXPIRED'
      ? 'คำสั่งซื้อนี้หมดอายุตามสถานะจากเซิร์ฟเวอร์แล้ว'
      : 'คำสั่งซื้อนี้ถูกยกเลิกแล้ว';
  }
  if (state.order?.status === 'UNKNOWN') return 'ยังไม่รู้จักสถานะคำสั่งซื้อนี้ กรุณาตรวจสอบในหน้ารายละเอียดคำสั่งซื้อ';
  if (state.uncertain) return 'ยังไม่ทราบผลการชำระ ระบบจะตรวจสอบและลองคำขอเดิมด้วยรหัสเดิม';
  if (state.payError) return errorText(state.payError, state.payCode);
  if (state.lastResult === 'failed') return 'เซิร์ฟเวอร์ยืนยันว่าการจ่ายเงินจำลองไม่สำเร็จ คำสั่งซื้อยังไม่ชำระเงิน';
  if (state.order?.paymentStatus === 'UNPAID') return 'เซิร์ฟเวอร์ยังไม่ยืนยันว่าคำสั่งซื้อนี้ชำระเงินแล้ว';
  return 'ยังยืนยันผลการชำระเงินไม่ได้ กรุณาตรวจสอบสถานะคำสั่งซื้อ';
}

const qrStyles = StyleSheet.create({
  box: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
});

export function CheckoutScreen({ productId }: { productId: number | null }) {
  const auth = useAuth();
  return <CheckoutContent key={`${auth.session?.user.id ?? 'guest'}:${productId}`} productId={productId} />;
}

function CheckoutContent({ productId }: { productId: number | null }) {
  const auth = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const { scheme } = useThemePreference();
  const isDark = scheme === 'dark';

  const { state, store } = useCheckout();
  const { state: detailState, store: detailStore } = useOrderDetail();

  const [values, setValues] = useState<AddressFormValues>(emptyAddressForm);
  const [saveAddressForNextTime, setSaveAddressForNextTime] = useState(true);
  const openedFor = useRef<string | null>(null);
  const mounted = useRef(true);
  const paymentOperation = useRef(0);
  const paymentInFlight = useRef(false);

  // The QR art is illustrative only. Payment results and expiry come from the API.
  const [dismissedOrderId, setDismissedOrderId] = useState<number | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);
  const activeOrderId = state.owner === auth.session?.user.id && state.productId === productId
    ? state.createdOrderId : null;
  const qrModalVisible = !isBuyerOrdersMode() && activeOrderId !== null && dismissedOrderId !== activeOrderId;

  useEffect(() => {
    if (isBuyerOrdersMode() && activeOrderId !== null) {
      router.replace({ pathname: '/orders/[orderId]', params: { orderId: String(activeOrderId) } });
    }
  }, [activeOrderId, router]);

  useEffect(() => {
    if (!state.owner || productId === null) return;
    const session = `${state.owner}:${productId}`;
    if (openedFor.current === session) return;
    openedFor.current = session;
    void store.open(productId);
  }, [productId, state.owner, store]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      paymentOperation.current += 1;
      store.close();
    };
  }, [store]);

  const productImageUrl = useProductImage(
    state.quote?.product?.id ?? productId ?? 0,
    state.quote?.product?.imageUrl ?? null
  );

  if (auth.initializing) return <Screen><Loading label="กำลังตรวจสอบบัญชี" /></Screen>;
  if (!auth.session) return productId === null ? <Redirect href="/login" /> : <MarketplaceLoginRequired destination={{ kind: 'checkout', productId }} />;

  const busy = state.submitting;
  const locked = busy || state.uncertain;
  const quote = state.owner === auth.session.user.id ? state.quote : null;

  const update = (field: keyof AddressFormValues, text: string) => {
    setValues(current => ({ ...current, [field]: text }));
    store.clearFieldError(field);
  };

  const useSavedAddress = () => {
    setValues(CO_SAVED);
    Object.keys(CO_SAVED).forEach(k => store.clearFieldError(k as keyof AddressFormValues));
  };

  const openExisting = () => {
    if (state.existingOrderId === null) return;
    router.replace({ pathname: '/orders/[orderId]', params: { orderId: String(state.existingOrderId) } });
  };

  const handlePayLater = () => {
    paymentOperation.current += 1;
    if (activeOrderId !== null) {
      setDismissedOrderId(activeOrderId);
      router.replace({ pathname: '/orders/[orderId]', params: { orderId: String(activeOrderId) } });
    }
  };

  const runSimulation = async (outcome: 'SUCCESS' | 'FAILED') => {
    const buyerId = auth.session?.user.id ?? null;
    const orderId = activeOrderId;
    const product = productId;
    if (isBuyerOrdersMode() || !buyerId || orderId === null || paymentInFlight.current) return;

    const operation = ++paymentOperation.current;
    paymentInFlight.current = true;
    setIsSimulating(true);
    setPaymentMessage(null);
    const isCurrent = () => mounted.current
      && paymentOperation.current === operation
      && store.getSnapshot().owner === buyerId
      && store.getSnapshot().productId === product
      && store.getSnapshot().createdOrderId === orderId;
    const snapshotBelongsToRequest = (snapshot: OrderDetailState) => snapshot.owner === buyerId
      && snapshot.orderId === orderId;
    const orderMatchesRequest = (snapshot: OrderDetailState) => snapshot.order?.id === orderId
      && snapshot.order.viewerRole === 'buyer';

    try {
      await detailStore.open(orderId);
      if (!isCurrent()) return;

      let snapshot = detailStore.getSnapshot();
      if (!snapshotBelongsToRequest(snapshot)) {
        setPaymentMessage('ไม่สามารถยืนยันบัญชีและคำสั่งซื้อปัจจุบันได้ กรุณาเปิดคำสั่งซื้ออีกครั้ง');
        return;
      }
      if (snapshot.loadError || !snapshot.order) {
        setPaymentMessage(paymentStateMessage(snapshot));
        return;
      }
      if (!orderMatchesRequest(snapshot)) {
        setPaymentMessage('ไม่สามารถยืนยันบัญชีและคำสั่งซื้อปัจจุบันได้ กรุณาเปิดคำสั่งซื้ออีกครั้ง');
        return;
      }

      if (snapshot.order.paymentStatus === 'PAID') {
        setDismissedOrderId(orderId);
        router.replace({ pathname: '/receipt/[orderId]', params: { orderId: String(orderId) } });
        return;
      }
      if (snapshot.order.status === 'CANCELLED' || snapshot.order.status === 'UNKNOWN') {
        setPaymentMessage(paymentStateMessage(snapshot));
        return;
      }
      if (!snapshot.uncertain && !snapshot.order.canPay) {
        setPaymentMessage(paymentStateMessage(snapshot));
        return;
      }

      // An uncertain outcome must reuse the pending idempotency key and original outcome.
      if (snapshot.uncertain) await detailStore.retryUncertain();
      else await detailStore.pay(outcome);
      if (!isCurrent()) return;

      snapshot = detailStore.getSnapshot();
      if (!snapshotBelongsToRequest(snapshot) || !orderMatchesRequest(snapshot)) {
        setPaymentMessage('บัญชีหรือคำสั่งซื้อเปลี่ยนไประหว่างตรวจสอบ จึงไม่ได้เปิดใบเสร็จ');
        return;
      }
      if (snapshot.order?.paymentStatus === 'PAID') {
        setDismissedOrderId(orderId);
        router.replace({ pathname: '/receipt/[orderId]', params: { orderId: String(orderId) } });
        return;
      }
      setPaymentMessage(paymentStateMessage(snapshot));
    } catch {
      if (isCurrent()) setPaymentMessage('ติดต่อระบบจำลองการชำระเงินไม่ได้ กรุณาตรวจสอบสถานะคำสั่งซื้อ');
    } finally {
      paymentInFlight.current = false;
      if (isCurrent()) setIsSimulating(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <SafeAreaView style={styles.content}>
            <MarketplaceHeader title={isBuyerOrdersMode() ? "สร้างคำสั่งซื้อ" : "สั่งซื้อและชำระเงิน"} back />

            {productId === null ? <ThemedText>รหัสสินค้าไม่ถูกต้อง</ThemedText> : null}
            {state.quoteLoading ? <Loading label="กำลังโหลดราคาสินค้า" /> : null}

            {state.quoteError ? (
              <Card>
                <ThemedText accessibilityLiveRegion="polite">{errorText(state.quoteError, state.quoteCode)}</ThemedText>
                {state.existingOrderId !== null ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="ดูคำสั่งซื้อเดิม"
                    onPress={openExisting}
                    style={styles.primaryActionButton}>
                    <ThemedText style={styles.primaryActionButtonText}>ดูคำสั่งซื้อเดิม</ThemedText>
                  </Pressable>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="ลองใหม่อีกครั้ง"
                    onPress={() => { void store.reloadQuote(); }}
                    style={styles.outlineActionButton}>
                    <ThemedText style={[styles.outlineActionButtonText, { color: theme.text }]}>ลองใหม่อีกครั้ง</ThemedText>
                  </Pressable>
                )}
              </Card>
            ) : null}

            {quote ? (
              <>
                {/* 1. Product Summary Card matching prototype screen-checkout */}
                <View style={[styles.cardBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <View style={styles.productRow}>
                    <View style={styles.productImageContainer}>
                      {productImageUrl ? (
                        <Image source={{ uri: productImageUrl }} style={styles.productImage} resizeMode="cover" />
                      ) : (
                        <ThemedText style={{ fontSize: 24 }}>👜</ThemedText>
                      )}
                    </View>
                    <View style={styles.productInfo}>
                      <ThemedText numberOfLines={2} style={styles.productName}>
                        {quote.product.name}
                      </ThemedText>
                      <View style={styles.productMetaRow}>
                        <View style={styles.conditionPill}>
                          <ThemedText style={styles.conditionPillText}>
                            {CONDITION_LABELS[quote.product.condition] ?? 'เหมือนใหม่'}
                          </ThemedText>
                        </View>
                        <ThemedText style={[styles.productSize, { color: theme.textSecondary }]}>
                          ขนาด {quote.product.size}
                        </ThemedText>
                      </View>
                    </View>
                    <ThemedText style={styles.productPrice}>{formatBaht(quote.itemPrice)}</ThemedText>
                  </View>
                </View>

                {/* 2. Shipping Address Card */}
                <View style={[styles.cardBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <ThemedText style={styles.sectionHeaderTitle}>ที่อยู่จัดส่ง</ThemedText>

                  {/* Feature: Use Saved Address Quick-fill */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="ใช้ที่อยู่ล่าสุด"
                    onPress={useSavedAddress}
                    style={[
                      styles.savedAddressBtn,
                      {
                        backgroundColor: isDark ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.06)',
                        borderColor: isDark ? 'rgba(16, 185, 129, 0.4)' : 'rgba(16, 185, 129, 0.3)',
                      },
                    ]}>
                    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" style={{ marginTop: 2 }}>
                      <Path
                        d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11z"
                        stroke="#10b981"
                        strokeWidth={2}
                      />
                      <Path d="M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" stroke="#10b981" strokeWidth={2} />
                    </Svg>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <ThemedText style={styles.savedAddressTitle}>ใช้ที่อยู่ล่าสุด</ThemedText>
                        <ThemedText style={styles.savedAddressTag}>แตะเพื่อใส่ข้อมูล</ThemedText>
                      </View>
                      <ThemedText style={[styles.savedAddressDetail, { color: theme.textSecondary }]}>
                        {CO_SAVED.recipientName} · {CO_SAVED.phone}
                        {'\n'}
                        {CO_SAVED.addressLine} {CO_SAVED.subdistrict} {CO_SAVED.district} {CO_SAVED.province} {CO_SAVED.postalCode}
                      </ThemedText>
                    </View>
                  </Pressable>

                  {/* 7 Address Input Fields */}
                  <View style={styles.fieldsContainer}>
                    {FIELDS.map(({ field, label, placeholder, numeric }) => {
                      const error = state.fieldErrors[field];
                      return (
                        <TextField
                          key={field}
                          label={label}
                          error={error}
                          value={values[field]}
                          onChangeText={text => update(field, text)}
                          placeholder={placeholder}
                          editable={!locked}
                          keyboardType={numeric ? 'number-pad' : 'default'}
                        />
                      );
                    })}
                  </View>

                  {/* Save address checkbox */}
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: saveAddressForNextTime }}
                    onPress={() => setSaveAddressForNextTime(prev => !prev)}
                    style={styles.checkboxRow}>
                    <View
                      style={[
                        styles.checkbox,
                        {
                          backgroundColor: saveAddressForNextTime ? '#10b981' : 'transparent',
                          borderColor: saveAddressForNextTime ? '#10b981' : theme.border,
                        },
                      ]}>
                      {saveAddressForNextTime ? (
                        <ThemedText style={{ color: '#ffffff', fontSize: 11, fontWeight: '700' }}>✓</ThemedText>
                      ) : null}
                    </View>
                    <ThemedText style={[styles.checkboxLabel, { color: theme.textSecondary }]}>
                      บันทึกที่อยู่นี้ไว้ใช้ครั้งถัดไป
                    </ThemedText>
                  </Pressable>

                  {state.submitError ? (
                    <View style={[styles.noticeBox, { borderColor: theme.danger }]}>
                      <ThemedText type="small" style={{ color: theme.danger }} accessibilityLiveRegion="polite">
                        {errorText(state.submitError, state.submitCode)}
                      </ThemedText>
                      {state.uncertain ? (
                        <ThemedText type="small">
                          ยังไม่ทราบว่าคำสั่งซื้อถูกสร้างหรือไม่ กด &quot;ตรวจสอบและลองอีกครั้ง&quot; ระบบจะส่งคำขอเดิม ไม่สร้างคำสั่งซื้อซ้ำ
                        </ThemedText>
                      ) : null}
                    </View>
                  ) : null}
                </View>

                {/* 3. Payment Method Card */}
                <View style={[styles.cardBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <ThemedText style={styles.sectionHeaderTitle}>วิธีชำระเงิน</ThemedText>
                  <View
                    style={[
                      styles.paymentMethodCard,
                      {
                        borderColor: '#10b981',
                        backgroundColor: isDark ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 185, 129, 0.04)',
                      },
                    ]}>
                    {!isBuyerOrdersMode() ? <View style={styles.demoPaymentBadge}>
                      <ThemedText style={styles.demoPaymentBadgeText}>DEMO</ThemedText>
                    </View> : null}
                    <View style={{ flex: 1 }}>
                      <ThemedText style={styles.paymentMethodTitle}>{isBuyerOrdersMode() ? 'ยังไม่เปิดรับชำระเงิน' : 'QR สำหรับการสาธิต'}</ThemedText>
                      <ThemedText style={[styles.paymentMethodSubtitle, { color: theme.textSecondary }]}>
                        {isBuyerOrdersMode() ? 'สร้างคำสั่งซื้อและจองสินค้าโดยยังไม่ชำระเงิน' : 'การชำระเงินในแอปนี้เป็นการจำลอง'}
                      </ThemedText>
                    </View>
                    <View style={styles.paymentCheckedCircle}>
                      <ThemedText style={{ color: '#ffffff', fontSize: 12, fontWeight: '800' }}>✓</ThemedText>
                    </View>
                  </View>
                </View>

                {/* 4. Price Summary Card */}
                <View style={[styles.cardBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <ThemedText style={styles.sectionHeaderTitle}>สรุปยอด</ThemedText>
                  <Row label="ราคาสินค้า" value={formatBaht(quote.itemPrice)} />
                  <Row label="ค่าจัดส่ง" value={formatBaht(quote.shippingFee)} />
                  <Row label="ค่าตรวจสอบสินค้า" value={formatBaht(quote.inspectionFee)} />
                  <View style={styles.inspectionNoticeRow}>
                    <View style={styles.infoBadge}>
                      <ThemedText style={styles.infoBadgeText}>i</ThemedText>
                    </View>
                    <ThemedText style={[styles.inspectionNoticeText, { color: theme.textSecondary }]}>
                      สินค้าจะถูกตรวจสภาพก่อนส่งถึงคุณ
                    </ThemedText>
                  </View>
                  <View style={[styles.summaryDivider, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }]} />
                  <Row label="ยอดชำระทั้งหมด" value={formatBaht(quote.totalAmount)} bold />
                </View>
              </>
            ) : null}

            {/* Back action */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="กลับ"
              onPress={() => router.back()}
              disabled={busy}
              style={styles.backButton}>
              <ThemedText style={[styles.backButtonText, { color: theme.textSecondary }]}>กลับ</ThemedText>
            </Pressable>
          </SafeAreaView>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Sticky Bottom Bar matching prototype co-bar */}
      {quote ? (
        <View
          style={[
            styles.bottomStickyBar,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
          ]}>
          <View style={{ flex: 1 }}>
            <ThemedText style={[styles.bottomBarLabel, { color: theme.textSecondary }]}>ยอดชำระ</ThemedText>
            <ThemedText style={styles.bottomBarAmount}>{formatBaht(quote.totalAmount)}</ThemedText>
          </View>

          {state.existingOrderId !== null ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="ดูคำสั่งซื้อเดิม"
              onPress={openExisting}
              style={styles.payButton}>
              <ThemedText style={styles.payButtonText}>ดูคำสั่งซื้อเดิม</ThemedText>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isBuyerOrdersMode() ? "สร้างคำสั่งซื้อ" : "ชำระเงิน"}
              disabled={busy}
              onPress={() => { void store.submit(values); }}
              style={({ pressed }) => [
                styles.payButton,
                { opacity: pressed || busy ? 0.8 : 1 },
              ]}>
              {busy ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <ThemedText style={styles.payButtonText}>
                  {state.uncertain ? 'ตรวจสอบและลองอีกครั้ง' : isBuyerOrdersMode() ? 'สร้างคำสั่งซื้อ' : 'ชำระเงิน'}
                </ThemedText>
              )}
            </Pressable>
          )}
        </View>
      ) : null}

      {/* Simulated-payment panel. The decorative QR is not a payment credential. */}
      <Modal visible={qrModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.qrPanel,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}>
            <View style={styles.sheetHandle} />

            <View style={styles.qrMainContent}>
                <ThemedText style={styles.qrTitle}>ชำระเงินจำลอง</ThemedText>
                <ThemedText style={styles.qrAmount}>
                  {quote ? formatBaht(quote.totalAmount) : ''}
                </ThemedText>

                {/* QR Code Visual */}
                <View style={styles.qrCodeWrapper}>
                  <DecorativeQrIllustration size={160} />
                </View>

                <ThemedText style={[styles.qrInstructions, { color: theme.textSecondary }]}>
                  ภาพ QR นี้เป็นภาพประกอบเท่านั้นและสแกนไม่ได้
                </ThemedText>

                <ThemedText style={[styles.qrSubnote, { color: theme.textSecondary }]}>
                  ไม่มีการเชื่อมต่อธนาคารและไม่มีเงินจริงถูกตัด สถานะหมดอายุต้องยืนยันจากเซิร์ฟเวอร์
                </ThemedText>

                {paymentMessage ? (
                  <View style={styles.failNotice}>
                    <ThemedText style={styles.failNoticeText} accessibilityLiveRegion="polite">
                      {paymentMessage}
                    </ThemedText>
                  </View>
                ) : null}

                {/* Pay Later Action */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="ชำระภายหลัง"
                  disabled={isSimulating}
                  onPress={handlePayLater}
                  style={[styles.payLaterBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9' }]}>
                  <ThemedText style={styles.payLaterBtnText}>ชำระภายหลัง</ThemedText>
                </Pressable>

                {/* Demo controls call the real simulated-payment endpoint. */}
                <View style={[styles.simToolbar, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]}>
                  <ThemedText style={[styles.simLabel, { color: theme.textSecondary }]}>ผลการสาธิต:</ThemedText>
                  {detailState.owner === auth.session?.user.id
                    && detailState.orderId === activeOrderId
                    && detailState.uncertain ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="ตรวจสอบผลคำขอเดิม ใช้รหัสเดิม"
                        disabled={isSimulating || detailState.paying !== null}
                        onPress={() => { void runSimulation('SUCCESS'); }}
                        style={styles.simBtnSuccess}>
                        {isSimulating ? <ActivityIndicator size="small" color="#10b981" /> : (
                          <ThemedText style={styles.simBtnSuccessText}>ตรวจสอบและลองคำขอเดิม</ThemedText>
                        )}
                      </Pressable>
                    ) : (
                      <>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="จำลองจ่ายสำเร็จ"
                          disabled={isSimulating || detailState.paying !== null}
                          onPress={() => { void runSimulation('SUCCESS'); }}
                          style={styles.simBtnSuccess}>
                          {isSimulating ? <ActivityIndicator size="small" color="#10b981" /> : (
                            <ThemedText style={styles.simBtnSuccessText}>จำลองจ่ายสำเร็จ</ThemedText>
                          )}
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="จำลองจ่ายล้มเหลว"
                          disabled={isSimulating || detailState.paying !== null}
                          onPress={() => { void runSimulation('FAILED'); }}
                          style={styles.simBtnFail}>
                          <ThemedText style={styles.simBtnFailText}>จำลองจ่ายล้มเหลว</ThemedText>
                        </Pressable>
                      </>
                    )}
                </View>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 100,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 12,
  },
  cardBox: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  sectionHeaderTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  productImageContainer: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#fde68a',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  productInfo: {
    flex: 1,
    gap: 2,
  },
  productName: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  productMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  conditionPill: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  conditionPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#10b981',
  },
  productSize: {
    fontSize: 11,
  },
  productPrice: {
    fontSize: 14,
    fontWeight: '800',
  },
  savedAddressBtn: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  savedAddressTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  savedAddressTag: {
    fontSize: 10,
    color: '#10b981',
    fontWeight: '700',
  },
  savedAddressDetail: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  fieldsContainer: {
    gap: 10,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxLabel: {
    fontSize: 12,
  },
  noticeBox: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
  },
  paymentMethodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 2,
  },
  demoPaymentBadge: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#0369a1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoPaymentBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 11,
  },
  paymentMethodTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  paymentMethodSubtitle: {
    fontSize: 11,
  },
  paymentCheckedCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inspectionNoticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  infoBadge: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#94a3b8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94a3b8',
  },
  inspectionNoticeText: {
    fontSize: 11,
  },
  summaryDivider: {
    borderBottomWidth: 1,
    marginVertical: 4,
  },
  bottomStickyBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  bottomBarLabel: {
    fontSize: 11,
  },
  bottomBarAmount: {
    fontSize: 18,
    fontWeight: '800',
    color: '#10b981',
  },
  payButton: {
    backgroundColor: '#059669',
    borderRadius: 14,
    paddingHorizontal: 28,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  payButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  primaryActionButton: {
    backgroundColor: '#059669',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryActionButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  outlineActionButton: {
    borderWidth: 1,
    borderColor: '#94a3b8',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  outlineActionButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  backButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },

  /* Modal Sheet Styles */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  qrPanel: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    alignItems: 'center',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(148, 163, 184, 0.4)',
    marginBottom: 16,
  },
  qrMainContent: {
    width: '100%',
    alignItems: 'center',
  },
  qrTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  qrAmount: {
    fontSize: 24,
    fontWeight: '900',
    color: '#10b981',
    marginTop: 4,
  },
  qrCodeWrapper: {
    marginVertical: 14,
  },
  qrInstructions: {
    fontSize: 12,
    textAlign: 'center',
  },
  qrSubnote: {
    fontSize: 11,
    marginTop: 4,
  },
  failNotice: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(244, 63, 94, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(244, 63, 94, 0.3)',
    width: '100%',
  },
  failNoticeText: {
    color: '#f43f5e',
    fontSize: 11,
    textAlign: 'center',
  },
  payLaterBtn: {
    marginTop: 14,
    width: '100%',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  payLaterBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  simToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    width: '100%',
  },
  simLabel: {
    fontSize: 10,
  },
  simBtnSuccess: {
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.5)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  simBtnSuccessText: {
    color: '#10b981',
    fontSize: 11,
    fontWeight: '600',
  },
  simBtnFail: {
    borderWidth: 1,
    borderColor: 'rgba(244, 63, 94, 0.5)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  simBtnFailText: {
    color: '#f43f5e',
    fontSize: 11,
    fontWeight: '600',
  },
});
