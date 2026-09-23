import { Redirect, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-provider';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, errorText, Loading, Row, Screen, StatusBadge, styles } from '@/components/order-ui';
import {
  cancelReasonLabels,
  formatBaht,
  formatDateTime,
  formatRemaining,
  orderStatusLabels,
  paymentStatusLabels,
} from '@/orders/order-format';
import { useOrderDetail, useOrdersList } from '@/orders/orders-provider';
import { CONDITION_LABELS } from '@/services/product-service';

export function OrderDetailScreen({ orderId }: { orderId: number | null }) {
  const auth = useAuth();
  const router = useRouter();
  const { state, store } = useOrderDetail();
  const list = useOrdersList();
  const openedFor = useRef<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const order = state.orderId === orderId ? state.order : null;
  const paying = state.paying !== null;
  const isBuyer = order?.viewerRole === 'buyer';
  // เส้นตายมาจาก server ฝั่งแอปทำแค่แปลงเป็นเวลาที่เหลือให้ดู ไม่ตัดสินสถานะเอง
  const remaining = order?.status === 'WAITING_PAYMENT' ? formatRemaining(order.expiresAt, now) : null;
  const deadlinePassed = order?.status === 'WAITING_PAYMENT' && !!order.expiresAt && remaining === null;

  useEffect(() => {
    // เปิดหน้าทุกครั้งอ่านสถานะจริงจาก server (รวมถึงหลังเปิดแอปใหม่)
    if (!state.owner || orderId === null) return;
    const session = `${state.owner}:${orderId}`;
    if (openedFor.current === session) return;
    openedFor.current = session;
    void store.open(orderId);
  }, [orderId, state.owner, store]);

  useEffect(() => {
    // หลังจ่ายสำเร็จ รายการคำสั่งซื้อต้องไม่แสดงสถานะเก่า
    if (state.lastResult === 'succeeded') void list.store.refresh();
  }, [list.store, state.lastResult]);

  useEffect(() => {
    // ยกเลิกแล้วรายการคำสั่งซื้อต้องไม่ค้างสถานะ "รอชำระเงิน"
    if (order?.status === 'CANCELLED') void list.store.refresh();
  }, [list.store, order?.status]);

  useEffect(() => {
    // เดินนาฬิกาเฉพาะตอนที่ยังมีเส้นตายให้นับ จะได้ไม่ตั้ง interval ทิ้งไว้เปล่า ๆ
    if (order?.status !== 'WAITING_PAYMENT' || !order.expiresAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [order?.expiresAt, order?.status]);

  useEffect(() => {
    // นาฬิกาหมดแล้วแต่สถานะยังเก่า ให้ถามสถานะจริงจาก server หนึ่งครั้ง ห้ามสรุปผลเอง
    if (deadlinePassed) void store.refresh();
  }, [deadlinePassed, store]);

  if (!auth.session) return <Redirect href="/" />;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <SafeAreaView style={styles.content}>
          <ThemedText type="subtitle">รายละเอียดคำสั่งซื้อ{order ? ` #${order.id}` : ''}</ThemedText>

          {orderId === null ? <ThemedText>รหัสคำสั่งซื้อไม่ถูกต้อง</ThemedText> : null}
          {state.loading && !order ? <Loading label="กำลังโหลดคำสั่งซื้อ" /> : null}

          {state.loadError && !order ? (
            <Card>
              <ThemedText accessibilityLiveRegion="polite">{errorText(state.loadError)}</ThemedText>
              {state.loadError !== 'not-found' ? (
                <Button label="ลองใหม่อีกครั้ง" onPress={() => { void store.refresh(); }} />
              ) : null}
            </Card>
          ) : null}

          {order ? (
            <>
              {state.lastResult === 'succeeded' ? (
                <View style={[styles.noticeBox, { borderColor: '#2F855A' }]}>
                  <ThemedText type="smallBold" accessibilityLiveRegion="polite">ชำระเงินสำเร็จ</ThemedText>
                  <ThemedText type="small">ระบบพักเงินไว้จนกว่าจะได้รับสินค้า</ThemedText>
                </View>
              ) : null}
              {order.status === 'CANCELLED' ? (
                <View style={[styles.noticeBox, { borderColor: '#718096' }]}>
                  <ThemedText type="smallBold" accessibilityLiveRegion="polite">คำสั่งซื้อนี้ถูกยกเลิกแล้ว</ThemedText>
                  {order.cancelReason ? (
                    <ThemedText type="small">{cancelReasonLabels[order.cancelReason]}</ThemedText>
                  ) : null}
                </View>
              ) : null}
              {state.lastResult === 'failed' ? (
                <View style={[styles.noticeBox, { borderColor: '#C53030' }]}>
                  <ThemedText type="smallBold" style={styles.errorText} accessibilityLiveRegion="polite">
                    ชำระเงินไม่สำเร็จ
                  </ThemedText>
                  <ThemedText type="small">สินค้ายังถูกจองไว้ให้คุณ สามารถลองชำระใหม่ได้</ThemedText>
                </View>
              ) : null}

              <Card>
                <StatusBadge status={order.status} label={orderStatusLabels[order.status]} />
                <Row label="การชำระเงิน" value={paymentStatusLabels[order.paymentStatus]} />
                {remaining ? <Row label="เหลือเวลาชำระเงิน" value={remaining} /> : null}
                {deadlinePassed ? (
                  <ThemedText type="small" style={styles.errorText} accessibilityLiveRegion="polite">
                    หมดเวลาชำระเงินแล้ว กำลังตรวจสถานะล่าสุดจากระบบ
                  </ThemedText>
                ) : null}
                {formatDateTime(order.cancelledAt) ? (
                  <Row label="ยกเลิกเมื่อ" value={formatDateTime(order.cancelledAt)!} />
                ) : null}
                {formatDateTime(order.paidAt) ? <Row label="ชำระเมื่อ" value={formatDateTime(order.paidAt)!} /> : null}
                {formatDateTime(order.createdAt) ? <Row label="สั่งซื้อเมื่อ" value={formatDateTime(order.createdAt)!} /> : null}
                <Button
                  label={state.refreshing ? 'กำลังรีเฟรช' : 'รีเฟรชสถานะ'}
                  busy={state.refreshing}
                  disabled={paying}
                  onPress={() => { void store.refresh(); }}
                />
                {state.loadError && order ? (
                  <ThemedText type="small" style={styles.errorText}>{errorText(state.loadError)}</ThemedText>
                ) : null}
              </Card>

              <Card>
                <ThemedText type="smallBold">{order.product.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  สภาพ {CONDITION_LABELS[order.product.condition] ?? order.product.condition} • ไซซ์ {order.product.size}
                </ThemedText>
                <Row label="ราคาสินค้า" value={formatBaht(order.amounts.itemPrice)} />
                {isBuyer ? (
                  <>
                    <Row label="ค่าจัดส่ง" value={formatBaht(order.amounts.shippingFee)} />
                    <Row label="ค่าตรวจสอบสินค้า" value={formatBaht(order.amounts.inspectionFee)} />
                    <Row label="ยอดชำระทั้งหมด" value={formatBaht(order.amounts.totalAmount)} bold />
                  </>
                ) : (
                  <>
                    <Row label="ค่าธรรมเนียมระบบ" value={`-${formatBaht(order.amounts.commissionFee)}`} />
                    <Row label="ยอดที่ผู้ขายจะได้รับ" value={formatBaht(order.amounts.sellerPayout)} bold />
                  </>
                )}
              </Card>

              <Card>
                <ThemedText type="smallBold">ที่อยู่จัดส่ง</ThemedText>
                {order.shippingAddress ? (
                  <>
                    <ThemedText type="small">
                      {order.shippingAddress.recipientName} • {order.shippingAddress.phone}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {order.shippingAddress.addressLine} {order.shippingAddress.subdistrict}{' '}
                      {order.shippingAddress.district} {order.shippingAddress.province}{' '}
                      {order.shippingAddress.postalCode}
                    </ThemedText>
                  </>
                ) : (
                  <ThemedText type="small" themeColor="textSecondary">
                    ที่อยู่ของผู้ซื้อจะแสดงเมื่อผู้ซื้อชำระเงินแล้ว
                  </ThemedText>
                )}
              </Card>

              {isBuyer && (order.canPay || state.uncertain) ? (
                <Card>
                  <ThemedText type="smallBold">ชำระเงิน (จำลอง)</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    ยอดที่ต้องชำระ {formatBaht(order.amounts.totalAmount)} ตามที่ระบบคำนวณ
                  </ThemedText>
                  {order.lastPaymentAttempt?.outcome === 'FAILED' && state.lastResult !== 'failed' ? (
                    <ThemedText type="small" themeColor="textSecondary">การชำระครั้งล่าสุดไม่สำเร็จ</ThemedText>
                  ) : null}

                  {state.payError ? (
                    <View style={[styles.noticeBox, { borderColor: '#C53030' }]}>
                      <ThemedText type="small" style={styles.errorText} accessibilityLiveRegion="polite">
                        {errorText(state.payError, state.payCode)}
                      </ThemedText>
                      {state.uncertain ? (
                        <ThemedText type="small">
                          ยังไม่ทราบผลการชำระเงิน ระบบตรวจสถานะแล้วยังไม่พบการชำระ
                          กด &quot;ส่งคำขอเดิมอีกครั้ง&quot; ระบบจะไม่ตัดเงินซ้ำ
                        </ThemedText>
                      ) : null}
                    </View>
                  ) : null}

                  {state.uncertain ? (
                    <Button
                      label="ส่งคำขอเดิมอีกครั้ง"
                      variant="primary"
                      busy={paying}
                      onPress={() => { void store.retryUncertain(); }}
                    />
                  ) : (
                    <View style={styles.buttonRow}>
                      <Button
                        label={state.paying === 'SUCCESS' ? 'กำลังชำระ' : 'จำลองจ่ายสำเร็จ'}
                        variant="primary"
                        busy={state.paying === 'SUCCESS'}
                        disabled={paying}
                        onPress={() => { void store.pay('SUCCESS'); }}
                      />
                      <Button
                        label={state.paying === 'FAILED' ? 'กำลังส่ง' : 'จำลองจ่ายล้มเหลว'}
                        variant="danger"
                        busy={state.paying === 'FAILED'}
                        disabled={paying}
                        onPress={() => { void store.pay('FAILED'); }}
                      />
                    </View>
                  )}
                </Card>
              ) : null}

              {isBuyer && order.canCancel ? (
                <Card>
                  <ThemedText type="smallBold">ยกเลิกคำสั่งซื้อ</ThemedText>
                  {confirmingCancel ? (
                    <>
                      <ThemedText type="small" themeColor="textSecondary">
                        ยืนยันการยกเลิก? สินค้าจะถูกปล่อยให้ผู้อื่นซื้อได้ และคำสั่งซื้อนี้จะกลับมาชำระเงินไม่ได้อีก
                      </ThemedText>
                      <View style={styles.buttonRow}>
                        <Button
                          label="ไม่ยกเลิก"
                          disabled={state.cancelling}
                          onPress={() => setConfirmingCancel(false)}
                        />
                        <Button
                          label={state.cancelling ? 'กำลังยกเลิก' : 'ยืนยันยกเลิก'}
                          variant="danger"
                          busy={state.cancelling}
                          disabled={paying}
                          onPress={() => { void store.cancel(); }}
                        />
                      </View>
                    </>
                  ) : (
                    <Button
                      label="ยกเลิกคำสั่งซื้อนี้"
                      disabled={paying || state.cancelling}
                      onPress={() => setConfirmingCancel(true)}
                    />
                  )}
                  {state.cancelError ? (
                    <ThemedText type="small" style={styles.errorText} accessibilityLiveRegion="polite">
                      {errorText(state.cancelError, state.cancelCode)}
                    </ThemedText>
                  ) : null}
                </Card>
              ) : null}

              {isBuyer && !order.canPay && state.payError && !state.uncertain ? (
                <ThemedText type="small" style={styles.errorText}>{errorText(state.payError, state.payCode)}</ThemedText>
              ) : null}

              {isBuyer && !order.canCancel && state.cancelError ? (
                <ThemedText type="small" style={styles.errorText}>
                  {errorText(state.cancelError, state.cancelCode)}
                </ThemedText>
              ) : null}

              {isBuyer && order.receiptNo ? (
                <Button
                  label={`ดูใบเสร็จ ${order.receiptNo}`}
                  onPress={() => router.push({ pathname: '/receipt/[orderId]', params: { orderId: String(order.id) } })}
                />
              ) : null}
            </>
          ) : null}

          <Button
            label="กลับ"
            disabled={paying}
            onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/orders'); }}
          />
        </SafeAreaView>
      </ScrollView>
    </Screen>
  );
}
