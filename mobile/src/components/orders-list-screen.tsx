import { Redirect, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-provider';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, errorText, Loading, Row, Screen, StatusBadge, styles } from '@/components/order-ui';
import { Spacing } from '@/constants/theme';
import { formatBaht, formatDateTime, orderStatusLabel } from '@/orders/order-format';
import { useOrdersList } from '@/orders/orders-provider';
import type { OrderListItem } from '@/services/order-service';

function OrderRow({ item, onPress }: { item: OrderListItem; onPress(): void }) {
  // หน้ารายการไม่แสดงที่อยู่ แสดงเฉพาะข้อมูลที่ใช้เลือก Order
  const amount = item.viewerRole === 'buyer' ? item.totalAmount : item.sellerPayout;
  const createdAt = formatDateTime(item.createdAt);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`คำสั่งซื้อ ${item.id} ${item.product.name}`}
      onPress={onPress}>
      <Card>
        <ThemedText type="smallBold">#{item.id} {item.product.name}</ThemedText>
        <StatusBadge status={item.status} label={orderStatusLabel(item.status)} />
        <Row label={item.viewerRole === 'buyer' ? 'ยอดชำระ' : 'ยอดที่จะได้รับ'} value={formatBaht(amount)} />
        {createdAt ? <ThemedText type="small" themeColor="textSecondary">สั่งซื้อเมื่อ {createdAt}</ThemedText> : null}
      </Card>
    </Pressable>
  );
}

export function OrdersListScreen() {
  const auth = useAuth();
  const router = useRouter();
  const { state, store } = useOrdersList();

  useEffect(() => {
    // เข้าหน้านี้ทุกครั้งดึงข้อมูลล่าสุดจาก server
    if (state.owner) void store.load();
  }, [state.owner, store]);

  if (!auth.session) return <Redirect href="/" />;

  const title = auth.account?.role === 'SELLER' ? 'คำสั่งซื้อสินค้าของฉัน' : 'คำสั่งซื้อของฉัน';

  return (
    <Screen>
      <SafeAreaView style={[styles.content, { flex: 1, alignSelf: 'center', padding: Spacing.three }]}>
        <ThemedText type="subtitle">{title}</ThemedText>
        <FlatList
          data={state.items}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={{ gap: Spacing.three, paddingBottom: Spacing.four }}
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
        <Button label="กลับ" onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/'); }} />
      </SafeAreaView>
    </Screen>
  );
}
