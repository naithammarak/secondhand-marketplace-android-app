import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProductForm, type ProductFormValues } from '@/components/product-form';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { createProductService } from '@/services/product-service';

const productService = createProductService();

export default function NewProductScreen() {
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(values: ProductFormValues) {
    setSubmitting(true);
    setError(null);
    try {
      await productService.createProduct(values);
      setSuccess(true);
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch {
      setError('ลงขายสินค้าไม่สำเร็จ กรุณาลองใหม่');
    } finally {
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
