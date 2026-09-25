import { MarketplaceHeader } from '@/components/marketplace-header';
import { useTheme } from '@/hooks/use-theme';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-provider';
import { isProductMockModeEnabled } from '@/products/product-runtime';
import { ProductForm, type ProductFormValues } from '@/components/product-form';
import { Fonts, MaxContentWidth, Spacing, type MarketplaceTheme } from '@/constants/theme';
import { createProductService, ProductServiceError } from '@/services/product-service';

const productService = createProductService({
  baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
  mockMode: isProductMockModeEnabled(),
});

export default function NewProductScreen() {
  const styles = makeStyles(useTheme());
  const { session } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverFieldErrors, setServerFieldErrors] = useState<Record<string, string>>({});
  const [uncertain, setUncertain] = useState(false);
  const [checkedInventory, setCheckedInventory] = useState(false);
  const [uploadAbortVersion, setUploadAbortVersion] = useState(0);
  const submittingRef = useRef(false);
  const requestController = useRef<AbortController | null>(null);
  useFocusEffect(useCallback(() => () => {
    requestController.current?.abort();
    setUploadAbortVersion(version => version + 1);
  }, []));

  const accessToken = session?.access_token;
  useEffect(() => () => requestController.current?.abort(), [accessToken]);

  async function handleSubmit(values: ProductFormValues) {
    if (submittingRef.current || success || uncertain) return;
    submittingRef.current = true;
    const controller = new AbortController();
    requestController.current = controller;
    let created = false;
    setSubmitting(true);
    setCheckedInventory(false);
    setError(null);
    setServerFieldErrors({});
    try {
      await productService.createProduct(values, accessToken, controller.signal);
      if (controller.signal.aborted) return;
      created = true;
      setSuccess(true);
      router.replace('/product/mine');
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof ProductServiceError) {
        if (err.kind === 'timeout' || err.kind === 'network-error') {
          setUncertain(true);
          setError('ยังยืนยันไม่ได้ว่าสินค้าถูกลงขายหรือไม่ กรุณาตรวจ “สินค้าของฉัน” ก่อนลงซ้ำ');
        } else setError(err.message);
        setServerFieldErrors(err.fields ?? {});
      } else {
        setError(err instanceof Error ? err.message : 'ลงขายสินค้าไม่สำเร็จ กรุณาลองใหม่');
      }
    } finally {
      if (requestController.current === controller) requestController.current = null;
      if (!created) submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.page}>
      <SafeAreaView style={styles.safeArea}>
        <MarketplaceHeader title="ลงขายสินค้า" back />
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            {uncertain && (
              <TouchableOpacity accessibilityRole="button" onPress={() => { setCheckedInventory(true); router.push('/product/mine'); }} style={styles.checkButton}>
                <Text style={styles.checkButtonText}>ตรวจสินค้าของฉันก่อนลงซ้ำ</Text>
              </TouchableOpacity>
            )}
            {uncertain && checkedInventory && (
              <TouchableOpacity accessibilityRole="button" onPress={() => { setUncertain(false); setError(null); }} style={styles.resumeButton}>
                <Text style={styles.resumeButtonText}>ตรวจแล้วไม่พบสินค้า ใช้แบบร่างนี้ต่อ</Text>
              </TouchableOpacity>
            )}
            <ProductForm
              mode="create"
              submitting={submitting}
              submitSuccess={success}
              submitDisabled={uncertain}
              submitError={error}
              accessToken={accessToken}
              uploadAbortVersion={uploadAbortVersion}
              serverFieldErrors={serverFieldErrors}
              onSubmit={handleSubmit}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const makeStyles = (theme: MarketplaceTheme) => StyleSheet.create({
  page: { flex: 1, backgroundColor: theme.background, alignItems: 'center' },
  scrollContent: { flexGrow: 1 },
  safeArea: { flex: 1, width: '100%', maxWidth: MaxContentWidth, backgroundColor: theme.surface },
  card: {
    backgroundColor: theme.surface,
    padding: Spacing.three,
  },
  title: { fontFamily: Fonts.sans, fontSize: 22, fontWeight: '700', color: theme.text, marginBottom: Spacing.three },
  checkButton: { backgroundColor: theme.primary, padding: Spacing.three, borderRadius: 8, marginBottom: Spacing.three },
  checkButtonText: { color: '#fff', textAlign: 'center', fontWeight: '700' },
  resumeButton: { padding: Spacing.three, borderRadius: 8, marginBottom: Spacing.three, borderWidth: 1, borderColor: theme.primary },
  resumeButtonText: { color: theme.text, textAlign: 'center', fontWeight: '700' },
});
