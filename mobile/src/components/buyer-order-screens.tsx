import { router } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView } from 'react-native';
import { useAuth } from '@/auth/auth-provider';
import { useOrderDetail } from '@/orders/orders-provider';
import { formatBaht, formatDateTime, orderStatusLabel } from '@/orders/order-format';
import { Button, Card, errorText, Loading, Row, Screen } from './order-ui';
import { MarketplaceHeader } from './marketplace-header';
import { MarketplaceNav } from './marketplace-nav';
import { MarketplaceLoginRequired } from './marketplace-login-required';
import { ThemedText } from './themed-text';

export function BuyerProfileScreen() {
  const auth = useAuth();
  return <Screen><ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
    <MarketplaceHeader title="บัญชีของฉัน" back />
    <ThemedText>{auth.account?.fullName ?? 'ผู้เยี่ยมชม'}</ThemedText>
    {auth.accountError ? <ThemedText>ยังตรวจสอบบัญชีไม่ได้ กรุณาลองใหม่</ThemedText> : null}
    {auth.session ? <>
      <Button label="คำสั่งซื้อของฉัน" onPress={() => router.push('/orders')} />
      <Button label="ตรวจสอบบัญชีอีกครั้ง" onPress={() => { void auth.retryAccount(); }} />
      <Button label="ออกจากระบบ" onPress={() => { void auth.logout(); }} />
    </> : <Button label="เข้าสู่ระบบ" onPress={() => router.push('/login')} />}
  </ScrollView><MarketplaceNav selected="profile" /></Screen>;
}

export function BuyerOrderScreen({ orderId }: { orderId: number | null }) {
  const auth = useAuth();
  const { state, store } = useOrderDetail();
  const owner = auth.session?.user.id;
  useEffect(() => {
    if (owner && orderId !== null) void store.open(orderId);
  }, [owner, orderId, store]);
  if (auth.initializing) return <Screen><Loading label="กำลังตรวจสอบบัญชี" /></Screen>;
  if (!auth.session) return <MarketplaceLoginRequired destination={{ kind: 'orders' }} />;
  const order = state.owner === auth.session.user.id && state.orderId === orderId ? state.order : null;
  return <Screen><ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
    <MarketplaceHeader title="คำสั่งซื้อ" back />
    {state.loading ? <Loading label="กำลังโหลดคำสั่งซื้อ" /> : null}
    {orderId === null ? <ThemedText>รหัสคำสั่งซื้อไม่ถูกต้อง</ThemedText> : null}
    {state.loadError ? <ThemedText>{errorText(state.loadError)}</ThemedText> : null}
    {order ? <Card>
      <ThemedText>คำสั่งซื้อ #{order.id}</ThemedText>
      <ThemedText>{order.product.name}</ThemedText>
      <ThemedText>{orderStatusLabel(order.status)}</ThemedText>
      <Row label="ยอดรวม" value={formatBaht(order.amounts.totalAmount)} />
      {order.paymentStatus === 'UNPAID' && order.status === 'WAITING_PAYMENT' ? <>
        <ThemedText>สร้างคำสั่งซื้อแล้ว • ยังไม่ชำระเงิน</ThemedText>
        <ThemedText>ยังไม่เปิดรับชำระเงิน สินค้าจองไว้ถึง {formatDateTime(order.expiresAt)} และจะคืนพร้อมขายเมื่อคำสั่งซื้อหมดอายุ</ThemedText>
      </> : null}
      {state.cancelError ? <ThemedText>{errorText(state.cancelError, state.cancelCode)}</ThemedText> : null}
      {order.canCancel ? <Button label="ยกเลิกคำสั่งซื้อ" disabled={state.cancelling}
        onPress={() => { void store.cancel(); }} /> : null}
      {order.receiptNo ? <Button label="ดูใบเสร็จ" onPress={() => router.push({ pathname: '/receipt/[orderId]', params: { orderId: String(order.id) } })} /> : null}
    </Card> : null}
    <Button label="รีเฟรชคำสั่งซื้อ" onPress={() => { void store.refresh(); }} />
  </ScrollView><MarketplaceNav selected="orders" /></Screen>;
}
