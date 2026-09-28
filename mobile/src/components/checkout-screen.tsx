import { MarketplaceLoginRequired } from '@/components/marketplace-login-required';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
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
    if (state.createdOrderId !== null) {
      router.replace({ pathname: '/orders/[orderId]', params: { orderId: String(state.createdOrderId) } });
    }
  }, [router, state.createdOrderId]);

  if (auth.initializing) return <Screen><Loading label="กำลังตรวจสอบบัญชี" /></Screen>;
  if (!auth.session) return productId === null ? <Redirect href="/login" /> : <MarketplaceLoginRequired destination={{ kind: 'checkout', productId }} />;

  const busy = state.submitting;
  const locked = busy || state.uncertain;
  const quote = state.quote;

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
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <SafeAreaView style={styles.content}>
          <ThemedText type="subtitle">ยืนยันการสั่งซื้อ</ThemedText>

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
                  สภาพ {CONDITION_LABELS[quote.product.condition] ?? quote.product.condition} • ไซซ์ {quote.product.size}
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
                    <View key={field} style={styles.field}>
                      <ThemedText type="smallBold">{label}</ThemedText>
                      <TextInput
                        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: error ? theme.danger : theme.border }]}
                        value={values[field]}
                        onChangeText={text => update(field, text)}
                        placeholder={placeholder}
                        placeholderTextColor={theme.textSecondary}
                        editable={!locked}
                        keyboardType={numeric ? 'number-pad' : 'default'}
                        accessibilityLabel={label}
                        accessibilityHint={error}
                      />
                      {error ? (
                        <ThemedText type="small" style={styles.errorText} accessibilityLiveRegion="polite">{error}</ThemedText>
                      ) : null}
                    </View>
                  );
                })}

                {state.submitError ? (
                  <View style={[styles.noticeBox, { borderColor: '#C53030' }]}>
                    <ThemedText type="small" style={styles.errorText} accessibilityLiveRegion="polite">
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

          <Button label="กลับ" onPress={() => router.back()} disabled={busy} />
        </SafeAreaView>
      </ScrollView>
    </Screen>
  );
}
