import { MarketplaceLoginRequired } from '@/components/marketplace-login-required';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-provider';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, errorText, Loading, Row, Screen, StatusBadge, styles } from '@/components/order-ui';
import { useTheme } from '@/hooks/use-theme';
import { MarketplaceHeader } from './marketplace-header';
import { MarketplaceNav } from './marketplace-nav';
import { CONDITION_LABELS } from '@/services/product-service';
import { Spacing } from '@/constants/theme';
import { formatBaht, formatDateTime, orderStatusLabels } from '@/orders/order-format';
import { useOrdersList } from '@/orders/orders-provider';
import type { OrderListItem } from '@/services/order-service';

function OrderRow({ item, onPress }: { item: OrderListItem; onPress(): void }) {
  // หน้ารายการไม่แสดงที่อยู่ แสดงเฉพาะข้อมูลที่ใช้เลือก Order
  const amount = item.viewerRole === 'buyer' ? item.totalAmount : item.sellerPayout;
  const createdAt = formatDateTime(item.createdAt);
  return (
    <View>
      <Card>
        <ThemedText type="small" themeColor="textSecondary">#{item.id}{createdAt ? ` · ${createdAt}` : ''}</ThemedText>
        <StatusBadge status={item.status} label={orderStatusLabels[item.status]} />
        <ThemedText type="smallBold">{item.product.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{CONDITION_LABELS[item.product.condition] ?? item.product.condition} · {item.product.size}</ThemedText>
        <Row label={item.viewerRole === 'buyer' ? 'ยอดชำระ' : 'ยอดที่จะได้รับ'} value={formatBaht(amount)} />
        <Button label={item.viewerRole === 'buyer' && item.paymentStatus === 'UNPAID' ? 'ชำระเงิน' : 'ดูรายละเอียด'}
          variant={item.paymentStatus === 'UNPAID' ? 'primary' : 'secondary'} onPress={onPress} />
      </Card>
    </View>
  );
}

export function OrdersListScreen() {
  const theme = useTheme();
  const auth = useAuth();
  const router = useRouter();
  const { state, store } = useOrdersList();

  useEffect(() => {
    // เข้าหน้านี้ทุกครั้งดึงข้อมูลล่าสุดจาก server
    if (state.owner) void store.load();
  }, [state.owner, store]);

  if (auth.initializing) return <Screen><Loading label="กำลังตรวจสอบบัญชี" /></Screen>;
  if (!auth.session) return <MarketplaceLoginRequired destination={{ kind: 'orders' }} />;

  const title = auth.account?.role === 'SELLER' ? 'คำสั่งซื้อสินค้าของฉัน' : 'คำสั่งซื้อของฉัน';

  return (
    <Screen>
      <SafeAreaView style={[styles.content, { flex: 1, alignSelf: 'center', gap: 0 }]}>
        <MarketplaceHeader title={title} />
        <FlatList
          style={{ flex: 1 }}
          data={state.owner === auth.session.user.id ? state.items : []}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={{ gap: 12, padding: 16 }}
          refreshControl={<RefreshControl refreshing={state.refreshing} onRefresh={() => { void store.refresh(); }} />}
          onEndReachedThreshold={0.3}
          onEndReached={() => { void store.loadMore(); }}
          renderItem={({ item }) => (
            <OrderRow
              item={item}
              onPress={() => router.push({ pathname: '/orders/[orderId]', params: { orderId: String(item.id) } })}
            />
          )}
          ListHeaderComponent={
            <View style={{ gap: Spacing.three }}>
              <Button
                label={state.refreshing ? 'กำลังรีเฟรช' : 'รีเฟรช'}
                busy={state.refreshing}
                disabled={state.loading}
                onPress={() => { void store.refresh(); }}
              />
              {state.error ? (
                <Card>
                  <ThemedText accessibilityLiveRegion="polite">{errorText(state.error)}</ThemedText>
                  <Button label="ลองใหม่อีกครั้ง" onPress={() => { void store.refresh(); }} />
                </Card>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            state.loading ? <Loading label="กำลังโหลดคำสั่งซื้อ" />
              : state.loaded && !state.error ? <Card><ThemedText>ยังไม่มีคำสั่งซื้อ</ThemedText></Card>
                : null
          }
          ListFooterComponent={
            state.loadingMore ? <Loading label="กำลังโหลดเพิ่ม" />
              : store.hasMore() ? <Button label="โหลดเพิ่ม" onPress={() => { void store.loadMore(); }} /> : null
          }
        />
        <View style={{ backgroundColor: theme.surface }}><MarketplaceNav selected="orders" /></View>
      </SafeAreaView>
    </Screen>
  );
}
