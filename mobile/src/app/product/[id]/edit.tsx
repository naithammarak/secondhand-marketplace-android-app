import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-provider';
import { ProductForm, type ProductFormValues } from '@/components/product-form';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { createProductEditStore } from '@/products/product-edit-store';
import { createProductService } from '@/services/product-service';

const productService = createProductService({
  baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
});

export default function EditProductScreen() {
  const { session } = useAuth();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const [store] = useState(() => createProductEditStore(productService));
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  useEffect(() => {
    if (id) {
      void store.open(id, session?.access_token);
    }
  }, [id, store, session?.access_token]);

  useEffect(() => {
    if (!state.submitSuccess) return;
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [state.submitSuccess]);

  useEffect(() => {
    if (!state.cancelSuccess) return;
    const timer = setTimeout(() => {
      if (router.canGoBack()) router.back();
      else router.replace('/');
    }, 1000);
    return () => clearTimeout(timer);
  }, [state.cancelSuccess]);

  async function handleSubmit(values: ProductFormValues) {
    await store.submit(values, session?.access_token);
  }

  async function handleConfirmCancel() {
    await store.cancel(session?.access_token);
    setConfirmingCancel(false);
  }

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.card}>
            <Text style={styles.title}>แก้ไขสินค้า</Text>
            {state.loading && <ActivityIndicator accessibilityLabel="กำลังโหลดข้อมูลสินค้า" color="#96bde9" />}
            {!state.loading && state.notFound && <Text style={styles.notFoundText}>ไม่พบสินค้านี้</Text>}
            {!state.loading && state.loadError && (
              <View style={styles.loadErrorBox}>
                <Text style={styles.loadErrorText}>โหลดข้อมูลสินค้าไม่สำเร็จ กรุณาลองใหม่</Text>
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={() => { void store.retry(session?.access_token); }}
                >
                  <Text style={styles.retryButtonText}>ลองใหม่อีกครั้ง</Text>
                </TouchableOpacity>
              </View>
            )}
            {!state.loading && state.product && (
              <>
                <ProductForm
                  mode="edit"
                  initialValues={state.product}
                  submitting={state.submitting}
                  submitSuccess={state.submitSuccess}
                  submitError={state.submitErrorMessage ?? (state.submitError ? 'บันทึกการแก้ไขไม่สำเร็จ กรุณาลองใหม่' : null)}
                  serverFieldErrors={state.submitFieldErrors}
                  onSubmit={handleSubmit}
                />
                {state.product.status !== 'CANCELLED' && (
                  <View style={styles.cancelSection}>
                    {state.cancelError && (
                      <Text style={styles.cancelErrorText}>ยกเลิกสินค้าไม่สำเร็จ กรุณาลองใหม่</Text>
                    )}
                    {confirmingCancel ? (
                      <View style={styles.confirmBox}>
                        <Text style={styles.confirmTitle}>ยืนยันการยกเลิกสินค้า</Text>
                        <Text style={styles.confirmDescription}>
                          คุณแน่ใจหรือไม่ว่าต้องการยกเลิกการขายสินค้านี้? เมื่อยกเลิกแล้วจะไม่สามารถนำกลับมาขายใหม่ได้
                        </Text>
                        <View style={styles.confirmButtonRow}>
                          <TouchableOpacity
                            style={styles.backButton}
                            onPress={() => setConfirmingCancel(false)}
                            disabled={state.cancelling}
                            accessibilityRole="button"
                            accessibilityLabel="กลับ"
                          >
                            <Text style={styles.backButtonText}>กลับ</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.confirmCancelButton, state.cancelling && styles.buttonDisabled]}
                            onPress={handleConfirmCancel}
                            disabled={state.cancelling}
                            accessibilityRole="button"
                            accessibilityLabel="ยืนยันยกเลิกสินค้า"
                          >
                            <Text style={styles.confirmCancelButtonText}>
                              {state.cancelling ? 'กำลังยกเลิก...' : 'ยืนยันยกเลิกสินค้า'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={[styles.cancelButton, state.cancelling && styles.buttonDisabled]}
                        disabled={state.cancelling || state.submitting}
                        accessibilityRole="button"
                        accessibilityLabel="ยกเลิกการขายสินค้านี้"
                        onPress={() => setConfirmingCancel(true)}
                      >
                        <Text style={styles.cancelButtonText}>ยกเลิกการขายสินค้านี้</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
                {state.cancelSuccess && (
                  <Text style={styles.cancelSuccessText}>สินค้านี้ถูกยกเลิกการขายแล้ว กำลังกลับ...</Text>
                )}
              </>
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
  loadErrorBox: { alignItems: 'center', gap: Spacing.two },
  loadErrorText: { fontSize: 14, color: '#d9534f', textAlign: 'center' },
  retryButton: {
    backgroundColor: '#96bde9',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  retryButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  cancelSection: {
    marginTop: Spacing.four,
    paddingTop: Spacing.four,
    borderTopWidth: 1,
    borderTopColor: '#f0f3f6',
    alignItems: 'center',
    width: '100%',
  },
  cancelButton: {
    backgroundColor: '#ff4d4f',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    width: '100%',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  confirmBox: {
    width: '100%',
    backgroundColor: '#fff1f0',
    borderColor: '#ffa39e',
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  confirmTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#cf1322',
  },
  confirmDescription: {
    fontSize: 13,
    color: '#4a5568',
    lineHeight: 18,
  },
  confirmButtonRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  backButton: {
    flex: 1,
    backgroundColor: '#e2e8f0',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  backButtonText: {
    color: '#33404f',
    fontSize: 14,
    fontWeight: '600',
  },
  confirmCancelButton: {
    flex: 1,
    backgroundColor: '#ff4d4f',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  confirmCancelButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  cancelErrorText: {
    color: '#d9534f',
    fontSize: 14,
    marginBottom: Spacing.two,
    textAlign: 'center',
  },
  cancelSuccessText: {
    color: '#52c41a',
    fontSize: 14,
    marginTop: Spacing.three,
    textAlign: 'center',
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
