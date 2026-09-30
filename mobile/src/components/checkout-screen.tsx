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

/** Realistic PromptPay QR Code Visual */
function PromptPayQrCode({ size = 160 }: { size?: number }) {
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
  const { store: detailStore } = useOrderDetail();

  const [values, setValues] = useState<AddressFormValues>(emptyAddressForm);
  const [saveAddressForNextTime, setSaveAddressForNextTime] = useState(true);
  const openedFor = useRef<string | null>(null);

  // PromptPay QR Modal state
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [activeOrderId, setActiveOrderId] = useState<number | null>(null);
  const [remainingSecs, setRemainingSecs] = useState(30 * 60); // 30 minutes
  const [qrExpired, setQrExpired] = useState(false);
  const [simFailed, setSimFailed] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);

  useEffect(() => {
    if (!state.owner || productId === null) return;
    const session = `${state.owner}:${productId}`;
    if (openedFor.current === session) return;
    openedFor.current = session;
    void store.open(productId);
  }, [productId, state.owner, store]);

  useEffect(() => () => store.close(), [store]);

  // When order is created, open the PromptPay QR Modal instead of immediately routing away
  useEffect(() => {
    if (state.owner === auth.session?.user.id && state.productId === productId && state.createdOrderId !== null) {
      setActiveOrderId(state.createdOrderId);
      setQrModalVisible(true);
      setRemainingSecs(30 * 60);
      setQrExpired(false);
      setSimFailed(false);
    }
  }, [auth.session?.user.id, productId, state.createdOrderId, state.owner, state.productId]);

  // 30-min countdown timer for QR Modal
  useEffect(() => {
    if (!qrModalVisible || qrExpired) return;
    const timer = setInterval(() => {
      setRemainingSecs(prev => {
        if (prev <= 1) {
          setQrExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [qrModalVisible, qrExpired]);

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

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
    setQrModalVisible(false);
    if (activeOrderId) {
      router.replace({ pathname: '/orders/[orderId]', params: { orderId: String(activeOrderId) } });
    }
  };

  const handleSimulateSuccess = async () => {
    if (!activeOrderId) return;
    setIsSimulating(true);
    setSimFailed(false);
    try {
      await detailStore.open(activeOrderId);
      await detailStore.pay('SUCCESS');
      setQrModalVisible(false);
      router.replace({ pathname: '/receipt/[orderId]', params: { orderId: String(activeOrderId) } });
    } catch {
      setSimFailed(true);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleSimulateFailure = () => {
    setSimFailed(true);
  };

  const handleSimulateExpire = () => {
    setQrExpired(true);
  };

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <SafeAreaView style={styles.content}>
            <MarketplaceHeader title="สั่งซื้อและชำระเงิน" back />

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
                    <View style={styles.promptPayLogo}>
                      <ThemedText style={styles.promptPayLogoText}>Prompt{'\n'}Pay</ThemedText>
                    </View>
                    <View style={{ flex: 1 }}>
                      <ThemedText style={styles.paymentMethodTitle}>พร้อมเพย์ QR</ThemedText>
                      <ThemedText style={[styles.paymentMethodSubtitle, { color: theme.textSecondary }]}>
                        สแกนจ่ายด้วยแอปธนาคารใดก็ได้
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
              accessibilityLabel="ชำระเงิน"
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
                  {state.uncertain ? 'ตรวจสอบและลองอีกครั้ง' : 'ชำระเงิน'}
                </ThemedText>
              )}
            </Pressable>
          )}
        </View>
      ) : null}

      {/* PromptPay QR Modal Sheet matching prototype co-qr */}
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

            {qrExpired ? (
              /* Expired View */
              <View style={styles.qrExpiredContent}>
                <View style={[styles.expiredCircle, { backgroundColor: isDark ? 'rgba(245,158,11,0.15)' : '#fef3c7' }]}>
                  <ThemedText style={{ fontSize: 32 }}>⏰</ThemedText>
                </View>
                <ThemedText style={styles.expiredTitle}>หมดเวลาชำระเงิน</ThemedText>
                <ThemedText style={[styles.expiredDetail, { color: theme.textSecondary }]}>
                  คำสั่งซื้อนี้ถูกยกเลิกอัตโนมัติ และสินค้ากลับไปขายต่อแล้ว
                </ThemedText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="กลับไปดูสินค้า"
                  onPress={() => {
                    setQrModalVisible(false);
                    router.replace('/');
                  }}
                  style={styles.backToShopBtn}>
                  <ThemedText style={styles.backToShopBtnText}>กลับไปดูสินค้า</ThemedText>
                </Pressable>
              </View>
            ) : (
              /* Main QR View */
              <View style={styles.qrMainContent}>
                <ThemedText style={styles.qrTitle}>สแกนเพื่อชำระเงิน</ThemedText>
                <ThemedText style={styles.qrAmount}>
                  {quote ? formatBaht(quote.totalAmount) : ''}
                </ThemedText>

                {/* QR Code Visual */}
                <View style={styles.qrCodeWrapper}>
                  <PromptPayQrCode size={160} />
                </View>

                <ThemedText style={[styles.qrInstructions, { color: theme.textSecondary }]}>
                  สแกนด้วยแอปธนาคารใดก็ได้ · ชำระภายใน{' '}
                  <ThemedText style={[styles.timerBold, { color: theme.text }]}>
                    {formatTimer(remainingSecs)}
                  </ThemedText>
                </ThemedText>

                <ThemedText style={[styles.qrSubnote, { color: theme.textSecondary }]}>
                  หากเลยเวลา ระบบจะยกเลิกคำสั่งซื้อให้อัตโนมัติ
                </ThemedText>

                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color="#10b981" />
                  <ThemedText style={[styles.loadingText, { color: theme.textSecondary }]}>
                    รอการชำระเงิน…
                  </ThemedText>
                </View>

                {simFailed ? (
                  <View style={styles.failNotice}>
                    <ThemedText style={styles.failNoticeText}>
                      ชำระเงินไม่สำเร็จ สินค้ายังถูกจองไว้ให้คุณ ลองใหม่ได้
                    </ThemedText>
                  </View>
                ) : null}

                {/* Pay Later Action */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="ชำระภายหลัง"
                  onPress={handlePayLater}
                  style={[styles.payLaterBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9' }]}>
                  <ThemedText style={styles.payLaterBtnText}>ชำระภายหลัง</ThemedText>
                </Pressable>

                {/* Simulation Toolbar for Testing */}
                <View style={[styles.simToolbar, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]}>
                  <ThemedText style={[styles.simLabel, { color: theme.textSecondary }]}>ทดสอบ:</ThemedText>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="จำลองจ่ายสำเร็จ"
                    disabled={isSimulating}
                    onPress={handleSimulateSuccess}
                    style={styles.simBtnSuccess}>
                    {isSimulating ? (
                      <ActivityIndicator size="small" color="#10b981" />
                    ) : (
                      <ThemedText style={styles.simBtnSuccessText}>จำลองจ่ายสำเร็จ</ThemedText>
                    )}
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="จำลองจ่ายล้มเหลว"
                    onPress={handleSimulateFailure}
                    style={styles.simBtnFail}>
                    <ThemedText style={styles.simBtnFailText}>จำลองจ่ายล้มเหลว</ThemedText>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="จำลองหมดเวลา"
                    onPress={handleSimulateExpire}
                    style={styles.simBtnExpire}>
                    <ThemedText style={styles.simBtnExpireText}>จำลองหมดเวลา</ThemedText>
                  </Pressable>
                </View>
              </View>
            )}
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
  promptPayLogo: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#0369a1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  promptPayLogoText: {
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
  timerBold: {
    fontWeight: '800',
  },
  qrSubnote: {
    fontSize: 11,
    marginTop: 4,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  loadingText: {
    fontSize: 12,
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
  simBtnExpire: {
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.5)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  simBtnExpireText: {
    color: '#f59e0b',
    fontSize: 11,
    fontWeight: '600',
  },
  qrExpiredContent: {
    alignItems: 'center',
    paddingVertical: 16,
    width: '100%',
  },
  expiredCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  expiredTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  expiredDetail: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
    maxWidth: 260,
  },
  backToShopBtn: {
    marginTop: 16,
    width: '100%',
    backgroundColor: '#059669',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  backToShopBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});
