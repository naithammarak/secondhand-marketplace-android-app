import { MarketplaceLoginRequired } from '@/components/marketplace-login-required';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { FlatList, Platform, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';

import { useAuth } from '@/auth/auth-provider';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, errorText, Loading, Row, Screen, StatusBadge, styles } from '@/components/order-ui';
import { EmptyState } from './wondee/primitives';
import { useTheme } from '@/hooks/use-theme';
import { MarketplaceHeader } from './marketplace-header';
import { MarketplaceNav } from './marketplace-nav';
import { CONDITION_LABELS } from '@/services/product-service';
import { Spacing } from '@/constants/theme';
import { formatBaht, formatDateTime, orderStatusLabel } from '@/orders/order-format';
import { useOrdersList } from '@/orders/orders-provider';
import type { OrderListItem } from '@/services/order-service';

function OrderRow({ item, onPress }: { item: OrderListItem; onPress(): void }) {
  // หน้ารายการไม่แสดงที่อยู่ แสดงเฉพาะข้อมูลที่ใช้เลือก Order
  const canPay = item.viewerRole === 'buyer' && item.status === 'WAITING_PAYMENT' && item.paymentStatus === 'UNPAID';
  const amount = item.viewerRole === 'buyer' ? item.totalAmount : item.sellerPayout;
  const createdAt = formatDateTime(item.createdAt);
  return (
    <View>
      <Card>
        <ThemedText type="small" themeColor="textSecondary">#{item.id}{createdAt ? ` · ${createdAt}` : ''}</ThemedText>
        <StatusBadge status={item.status} label={orderStatusLabel(item.status)} />
        <ThemedText type="smallBold">{item.product.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{CONDITION_LABELS[item.product.condition] ?? 'ข้อมูลสภาพไม่พร้อมใช้งาน'} · {item.product.size}</ThemedText>
        <Row label={item.viewerRole === 'buyer' ? 'ยอดชำระ' : 'ยอดที่จะได้รับ'} value={formatBaht(amount)} />
        <Button label={canPay ? 'ชำระเงิน' : 'ดูรายละเอียด'}
          variant={canPay ? 'primary' : 'secondary'} onPress={onPress} />
      </Card>
    </View>
  );
}

export function OrdersListScreen() {
  const theme = useTheme();
  const auth = useAuth();
  const router = useRouter();
  const { state, store } = useOrdersList();
  const { view } = useLocalSearchParams<{ view?: string }>();
  const customer = auth.account?.source === 'backend' && (auth.account.role === 'BUYER' || auth.account.role === 'SELLER') && !auth.accountError;

  const pullToRefresh = usePullToRefresh({
    refreshing: state.refreshing,
    onRefresh: () => { void store.refresh(); },
  });

  useEffect(() => {
    if (!customer) return;
    void store.setView(view === 'seller' && auth.account?.role === 'SELLER' ? 'seller' : 'buyer');
  }, [customer, view, auth.account?.role, store]);

  useEffect(() => {
    // เข้าหน้านี้ทุกครั้งดึงข้อมูลล่าสุดจาก server
    if (state.owner && customer) void store.load();
  }, [customer, state.owner, store]);

  if (auth.initializing) return <Screen><Loading label="กำลังตรวจสอบบัญชี" /></Screen>;
  if (!auth.session) return <MarketplaceLoginRequired destination={{ kind: 'orders' }} />;

  const title = 'คำสั่งซื้อ';

  return (
    <Screen>
      <SafeAreaView style={[styles.content, { flex: 1, alignSelf: 'center', gap: 0 }]}>
        <MarketplaceHeader title={title} />
        {auth.account?.role === 'SELLER' && <View style={{ flexDirection: 'row', padding: 16, gap: 12 }}>
          <View style={{ flex: 1 }}><Button label="รายการซื้อ" variant={state.view === 'buyer' ? 'primary' : 'secondary'} onPress={() => { void store.setView('buyer'); }} /></View>
          <View style={{ flex: 1 }}><Button label="รายการขาย" variant={state.view === 'seller' ? 'primary' : 'secondary'} onPress={() => { void store.setView('seller'); }} /></View>
        </View>}
        {!customer && <Card><ThemedText>กำลังตรวจสอบสิทธิ์บัญชี หรือบัญชีนี้ไม่สามารถซื้อขายได้</ThemedText></Card>}
        <FlatList
          testID="orders-flatlist"
          style={{ flex: 1 }}
          data={customer && state.owner === auth.session.user.id ? state.items : []}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={{ gap: 12, padding: 16, flexGrow: 1 }}
          alwaysBounceVertical={true}
          onScroll={pullToRefresh.handleScroll}
          scrollEventThrottle={16}
          {...(Platform.OS === 'web'
            ? {
                onWheel: pullToRefresh.handleWheel,
                onPointerDown: pullToRefresh.handlePointerDown,
                onPointerUp: pullToRefresh.handlePointerUp,
              }
            : {})}
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
              {Platform.OS === 'web' && state.refreshing ? (
                <View style={{ paddingVertical: 8, alignItems: 'center' }}>
                  <Loading label="กำลังรีเฟรชคำสั่งซื้อ..." />
                </View>
              ) : null}
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
              : state.loaded && !state.error ? <EmptyState title="ยังไม่มีคำสั่งซื้อ" detail="รายการซื้อและสถานะการชำระเงินจะแสดงที่นี่" />
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
