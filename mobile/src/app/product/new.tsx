import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
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
  const submittingRef = useRef(false);

  async function handleSubmit(values: ProductFormValues) {
    if (submittingRef.current || success) return;
    submittingRef.current = true;
    let created = false;
    setSubmitting(true);
    setError(null);
    setServerFieldErrors({});
    try {
      await productService.createProduct(values, session?.access_token);
      created = true;
      setSuccess(true);
      router.replace('/product/mine');
    } catch (err) {
      if (err instanceof ProductServiceError) {
        setError(err.message);
        setServerFieldErrors(err.fields ?? {});
      } else {
        setError(err instanceof Error ? err.message : 'ลงขายสินค้าไม่สำเร็จ กรุณาลองใหม่');
      }
    } finally {
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
            <ProductForm
              mode="create"
              submitting={submitting}
              submitSuccess={success}
              submitError={error}
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
});
