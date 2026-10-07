import { Redirect, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { useAuth } from '@/auth/auth-provider';
import { MarketplaceLoginRequired } from '@/components/marketplace-login-required';
import { ThemedText } from '@/components/themed-text';
import { errorText, Loading, Screen } from '@/components/order-ui';
import { ProductImage, cardConditionLabels, conditionBadgeTheme } from '@/components/product-catalog-ui';
import { EmptyState, ErrorState, Skeleton } from './wondee/primitives';
import { Fonts, MaxContentWidth } from '@/constants/theme';
import type { ProductCondition } from '@/services/product-catalog-service';
import { SimulationLabel } from './wondee/status';
import { useTheme } from '@/hooks/use-theme';
import { useThemePreference } from '@/theme/theme-provider';
import { useProductImage } from '@/hooks/use-product-image';
import { emptyAddressForm, type AddressFormValues } from '@/orders/checkout-form';
import { formatBaht } from '@/orders/order-format';
import { useCheckout, useOrderDetail } from '@/orders/orders-provider';
import { CONDITION_LABELS } from '@/services/product-service';
import type { OrderDetailState } from '@/orders/order-detail-store';

const FIELDS: { field: keyof AddressFormValues; label: string; placeholder: string; numeric?: boolean; full?: boolean }[] = [
  { field: 'recipientName', label: 'ชื่อผู้รับ', placeholder: 'ชื่อ-นามสกุลผู้รับสินค้า' },
  { field: 'phone', label: 'เบอร์โทรศัพท์', placeholder: 'เช่น 0812345678', numeric: true },
  { field: 'addressLine', label: 'ที่อยู่', placeholder: 'บ้านเลขที่ ถนน ซอย', full: true },
  { field: 'subdistrict', label: 'ตำบล/แขวง', placeholder: 'ตำบลหรือแขวง' },
  { field: 'district', label: 'อำเภอ/เขต', placeholder: 'อำเภอหรือเขต' },
  { field: 'province', label: 'จังหวัด', placeholder: 'จังหวัด' },
  { field: 'postalCode', label: 'รหัสไปรษณีย์', placeholder: '5 หลัก', numeric: true },
];

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
  const qrModalVisible = activeOrderId !== null && dismissedOrderId !== activeOrderId;

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
  const mutedText = isDark ? '#64748b' : '#94a3b8';

  const update = (field: keyof AddressFormValues, text: string) => {
    setValues(current => ({ ...current, [field]: text }));
    store.clearFieldError(field);
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
    if (!buyerId || orderId === null || paymentInFlight.current) return;

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

  const conditionKey = (quote?.product.condition ?? 'UNKNOWN') as ProductCondition;
  const badge = conditionBadgeTheme[conditionKey];
  const productSize = quote?.product.size?.trim();
  const barColor = isDark ? '#121622' : '#ffffff';

  return (
    <Screen>
      <SafeAreaView style={[styles.page, { backgroundColor: theme.background }]}>
        {/* หัวจอแบบ design: ปุ่มกลับ + ชื่อหน้า */}
        <View style={[styles.header, { backgroundColor: barColor, borderBottomColor: theme.border }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="กลับ"
            hitSlop={8}
            disabled={busy}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            style={styles.headerBack}>
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
              <Path d="M15 19l-7-7 7-7" stroke={theme.text} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </Pressable>
          <ThemedText accessibilityRole="header" style={[styles.headerTitle, { color: theme.text }]}>
            สั่งซื้อและชำระเงิน
          </ThemedText>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {productId === null ? (
              <EmptyState title="รหัสสินค้าไม่ถูกต้อง" detail="กรุณากลับไปเลือกสินค้าจากหน้ารายการ" />
            ) : null}

            {state.quoteLoading ? (
              <View style={{ gap: 14 }}>
                <Skeleton height={80} label="กำลังโหลดราคาสินค้า" />
                <Skeleton height={224} />
                <Skeleton height={128} />
              </View>
            ) : null}

            {state.quoteError ? (
              <ErrorState
                icon={state.quoteError === 'network-error' ? 'offline' : 'alert'}
                title={state.existingOrderId !== null ? 'มีคำสั่งซื้อสินค้านี้อยู่แล้ว' : 'โหลดข้อมูลการสั่งซื้อไม่สำเร็จ'}
                detail={errorText(state.quoteError, state.quoteCode)}>
                {state.existingOrderId !== null ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="ดูคำสั่งซื้อเดิม"
                    onPress={openExisting}
                    style={styles.stateButton}>
                    <ThemedText style={styles.stateButtonText}>ดูคำสั่งซื้อเดิม</ThemedText>
                  </Pressable>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="ลองใหม่อีกครั้ง"
                    onPress={() => { void store.reloadQuote(); }}
                    style={styles.stateButton}>
                    <ThemedText style={styles.stateButtonText}>ลองใหม่อีกครั้ง</ThemedText>
                  </Pressable>
                )}
              </ErrorState>
            ) : null}

            {quote ? (
              <>
                {/* สินค้า */}
                <View style={[styles.card, styles.productCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <View style={styles.productImage}>
                    <ProductImage
                      uri={productImageUrl}
                      width={56}
                      height={56}
                      borderRadius={12}
                      accessibilityLabel={`รูปสินค้า ${quote.product.name}`}
                    />
                  </View>
                  <View style={styles.productInfo}>
                    <ThemedText numberOfLines={2} style={[styles.productName, { color: theme.text }]}>
                      {quote.product.name}
                    </ThemedText>
                    <View style={styles.productMetaRow}>
                      {badge && CONDITION_LABELS[quote.product.condition] ? (
                        <View
                          accessibilityLabel={CONDITION_LABELS[quote.product.condition]}
                          style={[styles.conditionBadge, { backgroundColor: badge.bg }]}>
                          <ThemedText style={[styles.conditionBadgeText, { color: badge.text }]}>
                            {cardConditionLabels[conditionKey]}
                          </ThemedText>
                        </View>
                      ) : null}
                      {productSize ? (
                        <ThemedText style={[styles.productSize, { color: mutedText }]}>ขนาด {productSize}</ThemedText>
                      ) : null}
                    </View>
                  </View>
                  <ThemedText style={[styles.productPrice, { color: theme.text }]}>{formatBaht(quote.itemPrice)}</ThemedText>
                </View>

                {/* ที่อยู่จัดส่ง: กรอกใหม่ทุกครั้ง (สมุดที่อยู่ไม่อยู่ใน release นี้) */}
                <View style={[styles.card, styles.cardPadded, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>ที่อยู่จัดส่ง</ThemedText>
                  <View style={styles.fieldGrid}>
                    {FIELDS.map(({ field, label, placeholder, numeric, full }) => (
                      <AddressField
                        key={field}
                        label={label}
                        placeholder={placeholder}
                        numeric={numeric}
                        full={full}
                        error={state.fieldErrors[field]}
                        value={values[field]}
                        editable={!locked}
                        maxLength={field === 'postalCode' ? 5 : undefined}
                        onChangeText={text => update(field, text)}
                      />
                    ))}
                  </View>

                  {state.submitError ? (
                    <View style={styles.errorNotice}>
                      <ThemedText style={styles.errorNoticeText} accessibilityLiveRegion="polite">
                        {errorText(state.submitError, state.submitCode)}
                      </ThemedText>
                      {state.uncertain ? (
                        <ThemedText style={[styles.errorNoticeHint, { color: theme.textSecondary }]}>
                          ยังไม่ทราบว่าคำสั่งซื้อถูกสร้างหรือไม่ กด &quot;ตรวจสอบและลองอีกครั้ง&quot; ระบบจะส่งคำขอเดิม ไม่สร้างคำสั่งซื้อซ้ำ
                        </ThemedText>
                      ) : null}
                    </View>
                  ) : null}
                </View>

                {/* วิธีชำระเงิน: จำลองเท่านั้น ไม่มี QR/บัญชีธนาคาร */}
                <View style={[styles.card, styles.cardPadded, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>วิธีชำระเงิน</ThemedText>
                  <View style={styles.paymentMethod}>
                    <View style={styles.paymentBadge}>
                      <ThemedText style={styles.paymentBadgeText}>DEMO</ThemedText>
                    </View>
                    <View style={{ flex: 1 }}>
                      <ThemedText style={[styles.paymentTitle, { color: theme.text }]}>ชำระเงินจำลองสำหรับต้นแบบ</ThemedText>
                      <ThemedText style={[styles.paymentSubtitle, { color: mutedText }]}>
                        ไม่มีการตัดเงินจริง ไม่มี QR หรือบัญชีธนาคารให้โอน
                      </ThemedText>
                    </View>
                    <View style={styles.paymentCheck}>
                      <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
                        <Path d="M5 13l4 4L19 7" stroke="#ffffff" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
                      </Svg>
                    </View>
                  </View>
                </View>

                {/* สรุปยอด: ตัวเลขจาก quote ของเซิร์ฟเวอร์ */}
                <View style={[styles.card, styles.cardPadded, { backgroundColor: theme.surface, borderColor: theme.border, gap: 8 }]}>
                  <ThemedText style={[styles.sectionTitle, { color: theme.text, marginBottom: 2 }]}>สรุปยอด</ThemedText>
                  {[
                    ['ราคาสินค้า', quote.itemPrice],
                    ['ค่าจัดส่ง', quote.shippingFee],
                    ['ค่าตรวจสอบสินค้า', quote.inspectionFee],
                  ].map(([label, amount]) => (
                    <View key={label} style={styles.summaryRow}>
                      <ThemedText style={[styles.summaryLabel, { color: theme.textSecondary }]}>{label}</ThemedText>
                      <ThemedText style={[styles.summaryValue, { color: theme.text }]}>{formatBaht(amount)}</ThemedText>
                    </View>
                  ))}
                  <View style={styles.inspectionNote}>
                    <View style={[styles.infoDot, { borderColor: mutedText }]}>
                      <ThemedText style={[styles.infoDotText, { color: mutedText }]}>i</ThemedText>
                    </View>
                    <ThemedText style={[styles.inspectionNoteText, { color: mutedText }]}>
                      สินค้าจะถูกตรวจสภาพก่อนส่งถึงคุณ
                    </ThemedText>
                  </View>
                  <View style={[styles.summaryRow, styles.summaryTotal]}>
                    <ThemedText style={[styles.totalLabel, { color: theme.text }]}>ยอดชำระทั้งหมด</ThemedText>
                    <ThemedText style={styles.totalValue}>{formatBaht(quote.totalAmount)}</ThemedText>
                  </View>
                </View>
              </>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>

        {/* แถบล่าง */}
        {quote ? (
          <View style={[styles.bottomBar, { backgroundColor: barColor, borderTopColor: theme.border }]}>
            <View style={{ flex: 1 }}>
              <ThemedText style={[styles.bottomLabel, { color: mutedText }]}>ยอดชำระ</ThemedText>
              <ThemedText style={styles.bottomAmount}>{formatBaht(quote.totalAmount)}</ThemedText>
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
                accessibilityLabel="ชำระเงิน"
                disabled={busy}
                onPress={() => { void store.submit(values); }}
                style={({ pressed }) => [
                  styles.payButton,
                  { backgroundColor: pressed ? '#10b981' : '#059669', opacity: busy ? 0.8 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] },
                ]}>
                {busy ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <ThemedText style={styles.payButtonText}>
                    {state.uncertain ? 'ตรวจสอบและลองอีกครั้ง' : 'ชำระเงิน'}
                  </ThemedText>
                )}
              </Pressable>
            )}
          </View>
        ) : null}
      </SafeAreaView>

      {/* แผงชำระเงินจำลอง: มีแต่ปุ่มจำลองผลที่เรียก API จริง ไม่มี QR หรือข้อมูลธนาคาร */}
      <Modal visible={qrModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.sheet, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
            <View style={styles.sheetHandle} />
            <ThemedText style={[styles.sheetTitle, { color: theme.text }]}>ชำระเงินจำลอง</ThemedText>
            <ThemedText style={styles.sheetAmount}>{quote ? formatBaht(quote.totalAmount) : ''}</ThemedText>
            <View style={{ alignSelf: 'center', marginTop: 8 }}>
              <SimulationLabel text="ชำระเงินจำลองสำหรับต้นแบบ" />
            </View>
            <ThemedText style={[styles.sheetText, { color: theme.textSecondary }]}>
              เลือกผลการชำระจำลองด้านล่าง ระบบบันทึกการชำระและออกใบเสร็จเมื่อเซิร์ฟเวอร์ยืนยันเท่านั้น
            </ThemedText>
            <ThemedText style={[styles.sheetNote, { color: mutedText }]}>
              ไม่มีการเชื่อมต่อธนาคารและไม่มีเงินจริงถูกตัด สถานะหมดอายุต้องยืนยันจากเซิร์ฟเวอร์
            </ThemedText>

            {paymentMessage ? (
              <View style={styles.failNotice}>
                <ThemedText style={styles.failNoticeText} accessibilityLiveRegion="polite">
                  {paymentMessage}
                </ThemedText>
              </View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="ชำระภายหลัง"
              disabled={isSimulating}
              onPress={handlePayLater}
              style={[styles.payLaterButton, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText style={[styles.payLaterText, { color: theme.text }]}>ชำระภายหลัง</ThemedText>
            </Pressable>

            <View style={[styles.simToolbar, { borderTopColor: 'rgba(100, 116, 139, 0.3)' }]}>
              <ThemedText style={[styles.simLabel, { color: mutedText }]}>ผลการสาธิต:</ThemedText>
              {detailState.owner === auth.session?.user.id
                && detailState.orderId === activeOrderId
                && detailState.uncertain ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="ตรวจสอบผลคำขอเดิม ใช้รหัสเดิม"
                    disabled={isSimulating || detailState.paying !== null}
                    onPress={() => { void runSimulation('SUCCESS'); }}
                    style={[styles.simButton, styles.simSuccess]}>
                    {isSimulating ? <ActivityIndicator size="small" color="#10b981" /> : (
                      <ThemedText style={[styles.simButtonText, { color: '#10b981' }]}>ตรวจสอบและลองคำขอเดิม</ThemedText>
                    )}
                  </Pressable>
                ) : (
                  <>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="จำลองจ่ายสำเร็จ"
                      disabled={isSimulating || detailState.paying !== null}
                      onPress={() => { void runSimulation('SUCCESS'); }}
                      style={[styles.simButton, styles.simSuccess]}>
                      {isSimulating ? <ActivityIndicator size="small" color="#10b981" /> : (
                        <ThemedText style={[styles.simButtonText, { color: '#10b981' }]}>จำลองจ่ายสำเร็จ</ThemedText>
                      )}
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="จำลองจ่ายล้มเหลว"
                      disabled={isSimulating || detailState.paying !== null}
                      onPress={() => { void runSimulation('FAILED'); }}
                      style={[styles.simButton, styles.simFail]}>
                      <ThemedText style={[styles.simButtonText, { color: '#f43f5e' }]}>จำลองจ่ายล้มเหลว</ThemedText>
                    </Pressable>
                  </>
                )}
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function AddressField({
  label, placeholder, value, error, numeric, full, editable, maxLength, onChangeText,
}: {
  label: string; placeholder: string; value: string; error?: string; numeric?: boolean; full?: boolean;
  editable: boolean; maxLength?: number; onChangeText(text: string): void;
}) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.field, full && styles.fieldFull]}>
      <ThemedText style={[styles.fieldLabel, { color: theme.textSecondary }]}>{label}</ThemedText>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        editable={editable}
        maxLength={maxLength}
        keyboardType={numeric ? 'number-pad' : 'default'}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.fieldInput,
          {
            color: theme.text,
            backgroundColor: theme.backgroundElement,
            borderColor: error ? '#f43f5e' : focused ? '#10b981' : theme.border,
          },
        ]}
      />
      {error ? (
        <ThemedText accessibilityRole="alert" style={styles.fieldError}>{error}</ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, width: '100%', alignSelf: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  headerBack: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  content: {
    padding: 16,
    paddingBottom: 24,
    gap: 14,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  card: { borderRadius: 16, borderWidth: 1 },
  cardPadded: { padding: 16, gap: 12 },
  sectionTitle: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  stateButton: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, backgroundColor: '#059669' },
  stateButtonText: { fontSize: 12, fontWeight: '700', color: '#ffffff' },

  productCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  productImage: { width: 56, height: 56, borderRadius: 12, overflow: 'hidden' },
  productInfo: { flex: 1, minWidth: 0 },
  productName: { fontSize: 12, lineHeight: 17, fontWeight: '600' },
  productMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  conditionBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  conditionBadgeText: { fontSize: 10, lineHeight: 14, fontWeight: '800' },
  productSize: { fontSize: 11, lineHeight: 16 },
  productPrice: { fontSize: 14, lineHeight: 20, fontWeight: '800' },

  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 10, rowGap: 10 },
  field: { flexBasis: '45%', flexGrow: 1, minWidth: 0 },
  fieldFull: { flexBasis: '100%' },
  fieldLabel: { fontSize: 11, lineHeight: 16, fontWeight: '600', marginBottom: 4 },
  fieldInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 12,
    minHeight: 42,
  },
  fieldError: { fontSize: 10, lineHeight: 14, color: '#f43f5e', marginTop: 4 },
  errorNotice: {
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(244, 63, 94, 0.3)',
    backgroundColor: 'rgba(244, 63, 94, 0.1)',
    gap: 4,
  },
  errorNoticeText: { fontSize: 11, lineHeight: 16, color: '#f43f5e' },
  errorNoticeHint: { fontSize: 11, lineHeight: 16 },

  paymentMethod: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#10b981',
  },
  paymentBadge: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#0c4a6e', alignItems: 'center', justifyContent: 'center' },
  paymentBadgeText: { color: '#ffffff', fontSize: 9, lineHeight: 11, fontWeight: '800' },
  paymentTitle: { fontSize: 12, lineHeight: 17, fontWeight: '600' },
  paymentSubtitle: { fontSize: 10, lineHeight: 14 },
  paymentCheck: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#10b981', alignItems: 'center', justifyContent: 'center' },

  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  summaryLabel: { fontSize: 12, lineHeight: 17 },
  summaryValue: { fontSize: 12, lineHeight: 17 },
  inspectionNote: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  infoDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  infoDotText: { fontSize: 8, lineHeight: 10, fontWeight: '700' },
  inspectionNoteText: { fontSize: 10, lineHeight: 14 },
  summaryTotal: { paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(100, 116, 139, 0.2)' },
  totalLabel: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  totalValue: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: '#10b981' },

  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  bottomLabel: { fontSize: 10, lineHeight: 14 },
  bottomAmount: { fontFamily: Fonts.extraBold, fontSize: 18, lineHeight: 24, fontWeight: '800', color: '#10b981' },
  payButton: {
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingHorizontal: 36,
    paddingVertical: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#064e3b',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  payButtonText: { color: '#ffffff', fontSize: 14, lineHeight: 20, fontWeight: '700' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.55)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    alignItems: 'center',
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(100, 116, 139, 0.4)', marginBottom: 12 },
  sheetTitle: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  sheetAmount: { fontFamily: Fonts.extraBold, fontSize: 24, lineHeight: 32, fontWeight: '800', color: '#10b981', marginTop: 4 },
  sheetText: { fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 12 },
  sheetNote: { fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 4 },
  failNotice: {
    marginTop: 12,
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(244, 63, 94, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(244, 63, 94, 0.3)',
    width: '100%',
  },
  failNoticeText: { color: '#f43f5e', fontSize: 11, lineHeight: 16, textAlign: 'center' },
  payLaterButton: { marginTop: 12, width: '100%', paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  payLaterText: { fontSize: 12, fontWeight: '600' },
  simToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    width: '100%',
  },
  simLabel: { fontSize: 9, lineHeight: 12 },
  simButton: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  simSuccess: { borderColor: 'rgba(16, 185, 129, 0.5)' },
  simFail: { borderColor: 'rgba(244, 63, 94, 0.5)' },
  simButtonText: { fontSize: 10, lineHeight: 14, fontWeight: '600' },
});
