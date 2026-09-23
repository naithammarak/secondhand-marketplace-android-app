import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-provider';
import { isProductMockModeEnabled } from '@/products/product-runtime';
import { ProductForm, type ProductFormValues } from '@/components/product-form';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { createProductService, ProductServiceError } from '@/services/product-service';

const productService = createProductService({
  baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
  mockMode: isProductMockModeEnabled(),
});

export default function NewProductScreen() {
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
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.card}>
            <Text style={styles.title}>ลงขายสินค้า</Text>
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
        </SafeAreaView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#eaf3fb' },
  scrollContent: { flexGrow: 1, alignItems: 'center' },
  safeArea: { width: '100%', maxWidth: MaxContentWidth, padding: Spacing.four },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: Spacing.four,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  title: { fontSize: 22, fontWeight: '700', color: '#1a1f27', marginBottom: Spacing.three },
  checkButton: { backgroundColor: '#96bde9', padding: Spacing.three, borderRadius: 8, marginBottom: Spacing.three },
  checkButtonText: { color: '#fff', textAlign: 'center', fontWeight: '700' },
  resumeButton: { padding: Spacing.three, borderRadius: 8, marginBottom: Spacing.three, borderWidth: 1, borderColor: '#96bde9' },
  resumeButtonText: { color: '#33404f', textAlign: 'center', fontWeight: '700' },
});
