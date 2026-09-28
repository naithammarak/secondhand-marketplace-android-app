import { Redirect, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-provider';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, errorText, Loading, Row, Screen, styles } from '@/components/order-ui';
import { formatBaht, formatDateTime } from '@/orders/order-format';
import { useOrderDetail } from '@/orders/orders-provider';

export function ReceiptScreen({ orderId }: { orderId: number | null }) {
  const auth = useAuth();
  const router = useRouter();
  const { state, store } = useOrderDetail();

  useEffect(() => {
    if (!state.owner || orderId === null) return;
    // ใบเสร็จผูกกับ Order ใน store เดียวกัน เปิดตรงจากลิงก์ให้โหลด Order ก่อน
    if (state.orderId !== orderId) {
      void store.open(orderId).then(() => store.loadReceipt());
      return;
    }
    if (!state.receipt && !state.receiptLoading && !state.receiptError) void store.loadReceipt();
  }, [orderId, state.orderId, state.owner, state.receipt, state.receiptError, state.receiptLoading, store]);

  if (!auth.session) return <Redirect href="/login" />;

  const receipt = state.owner === auth.session?.user.id && state.orderId === orderId ? state.receipt : null;
  const issuedAt = formatDateTime(receipt?.issuedAt);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <SafeAreaView style={styles.content}>
          <ThemedText type="subtitle">ใบเสร็จรับเงิน (จำลอง)</ThemedText>
          {state.receiptLoading && !receipt ? <Loading label="กำลังโหลดใบเสร็จ" /> : null}
          {state.receiptError && !receipt ? (
            <Card>
              <ThemedText accessibilityLiveRegion="polite">{errorText(state.receiptError)}</ThemedText>
            </Card>
          ) : null}
          {receipt ? (
            <Card>
              <Row label="เลขที่ใบเสร็จ" value={receipt.receiptNo} bold />
              <Row label="คำสั่งซื้อ" value={`#${receipt.orderId}`} />
              {issuedAt ? <Row label="ออกเมื่อ" value={issuedAt} /> : null}
              <Row label="วิธีชำระ" value="จ่ายเงินจำลอง" />
              <ThemedText type="smallBold">{receipt.productName}</ThemedText>
              <Row label="ราคาสินค้า" value={formatBaht(receipt.itemPrice)} />
              <Row label="ค่าจัดส่ง" value={formatBaht(receipt.shippingFee)} />
              <Row label="ค่าตรวจสอบสินค้า" value={formatBaht(receipt.inspectionFee)} />
              <Row label="ยอดรวม" value={formatBaht(receipt.totalAmount)} bold />
              <ThemedText type="small" themeColor="textSecondary">
                เอกสารนี้ออกจากระบบจำลองเพื่อการทดสอบ ไม่ใช่ใบเสร็จทางภาษี
              </ThemedText>
            </Card>
          ) : null}
          <Button
            label="กลับ"
            onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/orders'); }}
          />
        </SafeAreaView>
      </ScrollView>
    </Screen>
  );
}
