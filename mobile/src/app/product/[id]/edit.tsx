import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProductForm, type ProductFormValues } from '@/components/product-form';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { createProductService, type Product } from '@/services/product-service';

const productService = createProductService();

export default function EditProductScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    productService.getProductById(id).then(result => {
      if (!active) return;
      if (result) setProduct(result);
      else setNotFound(true);
      setLoading(false);
    });
    return () => { active = false; };
  }, [id]);

  async function handleSubmit(values: ProductFormValues) {
    setSubmitting(true);
    setError(null);
    try {
      await productService.updateProduct(id, values);
      setSuccess(true);
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch {
      setError('บันทึกการแก้ไขไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.card}>
            <Text style={styles.title}>แก้ไขสินค้า</Text>
            {loading && <ActivityIndicator accessibilityLabel="กำลังโหลดข้อมูลสินค้า" color="#96bde9" />}
            {!loading && notFound && <Text style={styles.notFoundText}>ไม่พบสินค้านี้</Text>}
            {!loading && product && (
              <ProductForm
                mode="edit"
                initialValues={product}
                submitting={submitting}
                submitSuccess={success}
                submitError={error}
                onSubmit={handleSubmit}
              />
            )}
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
  notFoundText: { fontSize: 16, color: '#4a5568', textAlign: 'center' },
});
