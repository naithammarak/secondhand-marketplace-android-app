import { TextField } from './wondee/primitives';
import { MarketplaceHeader } from './marketplace-header';
import { MarketplaceLoginRequired } from '@/components/marketplace-login-required';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-provider';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, errorText, Loading, Row, Screen, styles } from '@/components/order-ui';
import { useTheme } from '@/hooks/use-theme';
import { emptyAddressForm, type AddressFormValues } from '@/orders/checkout-form';
import { formatBaht } from '@/orders/order-format';
import { useCheckout } from '@/orders/orders-provider';
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

export function CheckoutScreen({ productId }: { productId: number | null }) {
  const auth = useAuth();
  return <CheckoutContent key={`${auth.session?.user.id ?? 'guest'}:${productId}`} productId={productId} />;
}
function CheckoutContent({ productId }: { productId: number | null }) {
  const auth = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const { state, store } = useCheckout();
  const [values, setValues] = useState<AddressFormValues>(emptyAddressForm);
  const openedFor = useRef<string | null>(null);

  useEffect(() => {
    // เปิดหน้านี้ทุกครั้ง = เริ่ม checkout ใหม่ (key ใหม่ ล้างผลรอบก่อน)
    // แต่ไม่ส่งคำสั่งซื้อจนกว่าผู้ใช้จะกดยืนยันเอง
    if (!state.owner || productId === null) return;
    const session = `${state.owner}:${productId}`;
    if (openedFor.current === session) return;
    openedFor.current = session;
    void store.open(productId);
  }, [productId, state.owner, store]);

  // ออกจากหน้านี้แล้วล้างผลรอบนี้ทิ้ง กลับมาใหม่จะไม่ถูกพาไป Order เก่าหรือส่งคำขอเดิมเอง
  useEffect(() => () => store.close(), [store]);

  useEffect(() => {
    // สร้างสำเร็จแล้วแทนที่หน้านี้ด้วยหน้ารายละเอียด กด Back จะไม่กลับมาหน้ายืนยันซ้ำ
    if (state.owner === auth.session?.user.id && state.productId === productId && state.createdOrderId !== null) {
      router.replace({ pathname: '/orders/[orderId]', params: { orderId: String(state.createdOrderId) } });
    }
  }, [router, state.createdOrderId, state.owner, state.productId, auth.session?.user.id, productId]);

  if (auth.initializing) return <Screen><Loading label="กำลังตรวจสอบบัญชี" /></Screen>;
  if (!auth.session) return productId === null ? <Redirect href="/login" /> : <MarketplaceLoginRequired destination={{ kind: 'checkout', productId }} />;

  const busy = state.submitting;
  const locked = busy || state.uncertain;
  const quote = state.owner === auth.session.user.id ? state.quote : null;

  const update = (field: keyof AddressFormValues, text: string) => {
    setValues(current => ({ ...current, [field]: text }));
    store.clearFieldError(field);
  };

  const openExisting = () => {
    if (state.existingOrderId === null) return;
    router.replace({ pathname: '/orders/[orderId]', params: { orderId: String(state.existingOrderId) } });
  };

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <SafeAreaView style={styles.content}>
          <MarketplaceHeader title="ยืนยันการสั่งซื้อ" back />

          {productId === null ? <ThemedText>รหัสสินค้าไม่ถูกต้อง</ThemedText> : null}
          {state.quoteLoading ? <Loading label="กำลังโหลดราคาสินค้า" /> : null}

          {state.quoteError ? (
            <Card>
              <ThemedText accessibilityLiveRegion="polite">{errorText(state.quoteError, state.quoteCode)}</ThemedText>
              {state.existingOrderId !== null ? (
                <Button label="ดูคำสั่งซื้อเดิม" variant="primary" onPress={openExisting} />
              ) : (
                <Button label="ลองใหม่อีกครั้ง" onPress={() => { void store.reloadQuote(); }} />
              )}
            </Card>
          ) : null}

          {quote ? (
            <>
              <Card>
                <ThemedText type="smallBold">{quote.product.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {CONDITION_LABELS[quote.product.condition] ?? 'ข้อมูลสภาพไม่พร้อมใช้งาน'} • ไซซ์ {quote.product.size}
                </ThemedText>
                <Row label="ราคาสินค้า" value={formatBaht(quote.itemPrice)} />
                <Row label="ค่าจัดส่ง" value={formatBaht(quote.shippingFee)} />
                <Row label="ค่าตรวจสอบสินค้า" value={formatBaht(quote.inspectionFee)} />
                <Row label="ยอดชำระทั้งหมด" value={formatBaht(quote.totalAmount)} bold />
                <ThemedText type="small" themeColor="textSecondary">
                  ยอดสุดท้ายคำนวณโดยระบบเมื่อยืนยันคำสั่งซื้อ
                </ThemedText>
              </Card>

              <Card>
                <ThemedText type="smallBold">ที่อยู่จัดส่ง</ThemedText>
                {FIELDS.map(({ field, label, placeholder, numeric }) => {
                  const error = state.fieldErrors[field];
                  return (
                    <TextField key={field} label={label} error={error} value={values[field]}
                      onChangeText={text => update(field, text)} placeholder={placeholder}
                      editable={!locked} keyboardType={numeric ? 'number-pad' : 'default'} />
                  );
                })}

                {state.submitError ? (
                  <View style={[styles.noticeBox, { borderColor: theme.danger }]}>
                    <ThemedText type="small" style={{ color: theme.danger }} accessibilityLiveRegion="polite">
                      {errorText(state.submitError, state.submitCode)}
                    </ThemedText>
                    {state.uncertain ? (
                      <ThemedText type="small">
                        ยังไม่ทราบว่าคำสั่งซื้อถูกสร้างหรือไม่ กด &quot;ตรวจสอบและลองอีกครั้ง&quot;
                        ระบบจะส่งคำขอเดิม ไม่สร้างคำสั่งซื้อซ้ำ
                      </ThemedText>
                    ) : null}
                  </View>
                ) : null}

                {state.existingOrderId !== null ? (
                  <Button label="ดูคำสั่งซื้อเดิม" onPress={openExisting} />
                ) : (
                  <Button
                    label={busy ? 'กำลังสร้างคำสั่งซื้อ' : state.uncertain ? 'ตรวจสอบและลองอีกครั้ง'
                      : `ยืนยันสั่งซื้อ ${formatBaht(quote.totalAmount)}`}
                    variant="primary"
                    busy={busy}
                    onPress={() => { void store.submit(values); }}
                  />
                )}
              </Card>
            </>
          ) : null}

          <Card><ThemedText type="smallBold">ชำระเงินจำลอง</ThemedText><ThemedText themeColor="textSecondary">หลังยืนยันคำสั่งซื้อ เลือกชำระเงินจำลองในหน้ารายละเอียด เงินจำลองพักไว้ตามขั้นตอนของระบบ ไม่มีการรับเงินจริง</ThemedText></Card>
          <Button label="กลับ" onPress={() => router.back()} disabled={busy} />
        </SafeAreaView>
      </ScrollView></KeyboardAvoidingView>
    </Screen>
  );
}
