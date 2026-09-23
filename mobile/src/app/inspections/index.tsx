import { Redirect, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-provider';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Loading, Row, Screen, styles } from '@/components/order-ui';
import { orderStatusLabels } from '@/orders/order-format';
import { createInspectionService, type WorkDetail } from '@/services/inspection-service';

export default function InspectionQueueRoute() {
  const auth = useAuth();
  const router = useRouter();
  const service = useMemo(() => createInspectionService({ baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL }), []);
  const [items, setItems] = useState<WorkDetail[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const token = auth.session?.access_token;
  const owner = auth.session?.user.id;

  useEffect(() => {
    let active = true;
    if (auth.account?.role !== 'INSPECTOR' || !token) return;
    void Promise.resolve().then(() => {
      if (!active) return;
      setItems([]); setTotal(0); setError(null); setLoading(true);
    });
    void service.list(token).then(page => { if (active) { setItems(page.items); setTotal(page.total); } })
      .catch(() => { if (active) setError('โหลดคิวตรวจไม่สำเร็จ กรุณาลองใหม่'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [auth.account?.role, owner, service, token]);

  const refresh = async () => {
    if (!token || loading) return;
    setLoading(true);
    setError(null);
    try { const page = await service.list(token); setItems(page.items); setTotal(page.total); }
    catch { setError('โหลดคิวตรวจไม่สำเร็จ กรุณาลองใหม่'); }
    finally { setLoading(false); }
  };

  const loadMore = async () => {
    if (!token || loading || items.length >= total) return;
    setLoading(true);
    setError(null);
    try {
      const page = await service.list(token, items.length);
      setItems(current => [...current, ...page.items.filter(item => !current.some(existing => existing.id === item.id))]);
      setTotal(page.total);
    } catch { setError('โหลดคิวหน้าถัดไปไม่สำเร็จ กรุณาลองใหม่'); }
    finally { setLoading(false); }
  };

  if (!auth.session) return <Redirect href="/" />;
  if (auth.account?.role !== 'INSPECTOR') return <Redirect href="/" />;
  return <Screen><ScrollView contentContainerStyle={styles.scrollContent}><SafeAreaView style={styles.content}>
    <ThemedText type="subtitle">คิวตรวจสินค้า</ThemedText>
    <Button label="รีเฟรชคิว" busy={loading} onPress={() => { void refresh(); }} />
    {loading && !items.length ? <Loading label="กำลังโหลดคิวตรวจ" /> : null}
    {error ? <ThemedText style={styles.errorText}>{error}</ThemedText> : null}
    {!loading && !items.length && !error ? <ThemedText>ไม่มีงานตรวจที่คุณเข้าถึงได้</ThemedText> : null}
    {items.map(item => <Card key={item.id}>
      <ThemedText type="smallBold">{item.product.name}</ThemedText>
      <Row label="Order" value={`#${item.order_id}`} />
      <Row label="สถานะ" value={orderStatusLabels[item.order_status]} />
      <Button label="เปิดงานตรวจ" onPress={() => router.push({ pathname: '/inspections/[inspectionId]', params: { inspectionId: String(item.id) } })} />
    </Card>)}
    {items.length < total ? <Button label="โหลดงานเพิ่มเติม" busy={loading} onPress={() => { void loadMore(); }} /> : null}
    <Button label="กลับ" onPress={() => router.back()} />
  </SafeAreaView></ScrollView></Screen>;
}
