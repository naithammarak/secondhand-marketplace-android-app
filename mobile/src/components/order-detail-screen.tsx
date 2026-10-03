import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useRouter } from 'expo-router';

import { useAuth } from '@/auth/auth-provider';
import { MarketplaceHeader } from './marketplace-header';
import { ThemedText } from '@/components/themed-text';
import { Button, errorText, Loading, Screen, styles as orderUiStyles } from '@/components/order-ui';
import { WondeeLoader } from './wondee/loader';
import { OrderReviewEntry } from '@/components/review-modal';
import { outcomes } from './inspection/views';
import { useTheme } from '@/hooks/use-theme';
import { useProductImage } from '@/hooks/use-product-image';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useOrderDetail, useOrdersList } from '@/orders/orders-provider';
import { deadlineAt, formatBaht, formatDateTime } from '@/orders/order-format';
import { deriveJourney, deriveMoney, COPY } from '@/orders/order-journey';
import { useJourneyCommand, useOrderJourney } from '@/orders/use-order-journey';
import { routes } from '@/navigation/routes';
import { CONDITION_LABELS } from '@/services/product-service';
import {
  BuyerReceiptPanel, HistoryCard, JourneyBanner, JourneyUnavailable, MoneyCard, SellerReturnPanel, ShipmentCard, TimelineCard, journeyTimeline,
} from './order-journey-sections';
import { ActionNotice, SectionCard, SimulationLabel } from './wondee/status';
import { describeActionError } from '@/orders/action-errors';

/** ถามสถานะจริงซ้ำทุกกี่มิลลิวินาทีหลังเลยเส้นตายชำระเงิน จนกว่า server จะตอบสถานะสุดท้าย */
const DEADLINE_RECHECK_MS = 5000;

export function OrderDetailScreen({ orderId }: { orderId: number | null }) {
  const theme = useTheme();
  const auth = useAuth();
  const router = useRouter();
  const { state, store } = useOrderDetail();
  const list = useOrdersList();
  const openedFor = useRef<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [isManualRefresh, setIsManualRefresh] = useState(false);
  const lastDeadlineCheck = useRef(0);

  // Never render a previous account's order while the store catches up.
  const order = state.owner === auth.session?.user.id && state.orderId === orderId ? state.order : null;
  const productImageUrl = useProductImage(order?.product?.id ?? 0, order?.product?.imageUrl ?? null);
  const data = useOrderJourney(order);
  const paying = state.paying !== null;
  const isBuyer = order?.viewerRole === 'buyer';
  const waitingPayment = order?.status === 'WAITING_PAYMENT';
  const deadline = waitingPayment ? deadlineAt(order?.expiresAt) : null;
  const deadlinePassed = deadline !== null && now >= deadline;

  const reloadJourney = data.reload;
  const refreshAll = useCallback(async () => {
    await store.refresh();
    await reloadJourney();
    void list.store.refresh();
  }, [store, reloadJourney, list.store]);
  const command = useJourneyCommand(refreshAll, undefined, orderId);

  const journey = useMemo(() => order ? deriveJourney({ order, delivery: data.delivery, result: data.result }) : null, [order, data.delivery, data.result]);
  const money = useMemo(() => order ? deriveMoney(order, data.delivery) : null, [order, data.delivery]);

  const handleManualRefresh = useCallback(() => {
    setIsManualRefresh(true);
    void refreshAll().finally(() => setIsManualRefresh(false));
  }, [refreshAll]);
  const pullToRefresh = usePullToRefresh({ refreshing: state.refreshing, onRefresh: handleManualRefresh });

  useEffect(() => {
    // Every open reads persisted state from the server (including after app restart).
    if (!state.owner || orderId === null) return;
    const session = `${state.owner}:${orderId}`;
    if (openedFor.current === session) return;
    openedFor.current = session;
    void store.open(orderId);
  }, [orderId, state.owner, store]);

  useEffect(() => { if (state.lastResult === 'succeeded') void list.store.refresh(); }, [list.store, state.lastResult]);
  useEffect(() => { if (order?.status === 'CANCELLED') void list.store.refresh(); }, [list.store, order?.status]);

  useEffect(() => {
    if (!waitingPayment || deadline === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [deadline, waitingPayment]);

  useEffect(() => {
    // Past the payment deadline but the server still says WAITING_PAYMENT: ask again, never conclude locally.
    if (!deadlinePassed) { lastDeadlineCheck.current = 0; return; }
    if (now - lastDeadlineCheck.current < DEADLINE_RECHECK_MS) return;
    lastDeadlineCheck.current = now;
    void store.refresh();
  }, [deadlinePassed, now, store]);

  if (!auth.session) return <Redirect href="/login" />;

  const timeline = order && journey ? journeyTimeline({ createdAt: order.createdAt, paidAt: order.paidAt, journey, delivery: data.delivery, result: data.result }) : [];
  const paid = order ? order.paymentStatus !== 'UNPAID' && order.status !== 'WAITING_PAYMENT' && order.status !== 'CANCELLED' : false;
  const resultInfo = data.result?.result ? outcomes[data.result.result] : null;

  return (
    <Screen>
      <SafeAreaView style={[orderUiStyles.content, { flex: 1, alignSelf: 'center', gap: 0 }]}>
        <MarketplaceHeader title={`คำสั่งซื้อ${order ? ` #${order.id}` : ''}`} back
          trailing={order ? <Pressable accessibilityRole="button" accessibilityLabel="รีเฟรชสถานะ" onPress={() => { void refreshAll(); }} hitSlop={8} style={styles.headerRefreshBtn}>
            <ThemedText style={{ fontSize: 13, color: theme.textSecondary }}>รีเฟรช</ThemedText></Pressable> : null} />

        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContainer} alwaysBounceVertical
          onScroll={pullToRefresh.handleScroll} scrollEventThrottle={16}
          {...(Platform.OS === 'web' ? { onWheel: pullToRefresh.handleWheel, onPointerDown: pullToRefresh.handlePointerDown, onPointerUp: pullToRefresh.handlePointerUp } : {})}
          refreshControl={<RefreshControl refreshing={isManualRefresh && state.refreshing} colors={[theme.brand]} tintColor={theme.brand} onRefresh={handleManualRefresh} />}>
          {Platform.OS === 'web' && isManualRefresh && state.refreshing ? <Loading label="กำลังรีเฟรชคำสั่งซื้อ..." /> : null}
          {orderId === null ? <ThemedText>รหัสคำสั่งซื้อไม่ถูกต้อง</ThemedText> : null}
          {state.loading && !order ? <Loading label="กำลังโหลดคำสั่งซื้อ" /> : null}
          {state.loadError && !order ? <SectionCard title="โหลดคำสั่งซื้อไม่สำเร็จ">
            <ThemedText accessibilityLiveRegion="polite">{errorText(state.loadError)}</ThemedText>
            {state.loadError === 'unauthorized' ? <Button label="เข้าสู่ระบบอีกครั้ง" onPress={() => router.replace('/login')} />
              : state.loadError !== 'not-found' && state.loadError !== 'forbidden' ? <Button label="ลองใหม่อีกครั้ง" onPress={() => { void store.refresh(); }} /> : null}
          </SectionCard> : null}

          {order && journey && money ? <View style={{ gap: 14 }}>
            {state.lastResult === 'succeeded' ? <StatusNotice tone="success" title="ชำระเงินจำลองสำเร็จ" detail="ระบบบันทึกการชำระและออกใบเสร็จแล้ว เงินจำลองพักไว้ตามขั้นตอน" /> : null}
            {state.lastResult === 'failed' ? <StatusNotice tone="danger" title="ชำระเงินจำลองไม่สำเร็จ" detail="สินค้ายังถูกจองไว้ให้คุณจนถึงเวลาที่แสดง ลองชำระใหม่ได้" /> : null}

            {/* Payment expiry has its own bounded recheck loop above; other server deadlines refetch once when reached. */}
            <JourneyBanner journey={journey} onDeadlineReached={journey.stage === 'AWAITING_PAYMENT' ? undefined : () => { void refreshAll(); }} />
            {data.loading && !data.delivery && paid ? <Loading label="กำลังโหลดสถานะการจัดส่ง" /> : null}
            <ActionNotice failure={data.failure} onRetry={() => { void data.reload(); }} onRefetch={() => { void refreshAll(); }} onLogin={() => router.replace('/login')} />
            {paid && data.unavailable ? <JourneyUnavailable /> : null}

            {/* Buyer inspection result entry: certificate and decision live on the result screen. */}
            {isBuyer && journey.actions.includes('open-result') ? <SectionCard title="ผลการตรวจสินค้า" testID="result-entry">
              {resultInfo ? <ThemedText type="smallBold" style={{ color: theme[resultInfo.tone] }}>{resultInfo.label}</ThemedText> : null}
              {data.result && !['PASS', 'MINOR_ISSUE'].includes(data.result.result ?? '') ? <ThemedText type="small" themeColor="textSecondary">ไม่มีใบรับรองสำหรับผลนี้</ThemedText> : null}
              {data.result?.certificateStatus === 'REVOKED' ? <ThemedText type="small" style={{ color: theme.danger }}>ใบรับรองถูกเพิกถอน ผลตรวจและสถานะคำสั่งซื้อไม่เปลี่ยน</ThemedText> : null}
              <Button label={journey.stage === 'RESULT_DECISION_OPEN' ? `ดูผลตรวจและ${COPY.accept}หรือปฏิเสธ` : 'ดูผลตรวจและใบรับรอง'} variant={journey.stage === 'RESULT_DECISION_OPEN' ? 'primary' : 'secondary'}
                onPress={() => router.push(routes.orderInspection(order.id))} />
            </SectionCard> : null}

            {isBuyer && data.delivery && (journey.stage === 'SHIPPING_TO_BUYER' || journey.stage === 'DELIVERED_PENDING_BUYER' || journey.stage === 'DISPUTED' || !!data.delivery.receiptConfirmedAt)
              ? <BuyerReceiptPanel journey={journey} delivery={data.delivery} command={command} orderId={order.id} /> : null}
            {!isBuyer && data.delivery ? <SellerReturnPanel journey={journey} delivery={data.delivery} command={command} orderId={order.id} /> : null}

            {journey.stage === 'COMPLETED' && isBuyer ? <OrderReviewEntry orderId={order.id} productName={order.product.name}
              onReviewed={() => { void store.refresh(); void list.store.refresh(); }} /> : null}

            {journey.outbound ? <ShipmentCard shipment={journey.outbound} /> : null}
            {journey.returnLeg ? <ShipmentCard shipment={journey.returnLeg} /> : null}
            {journey.inbound ? <ShipmentCard shipment={journey.inbound} /> : null}

            <TimelineCard steps={timeline} current={journey.title} />

            <Pressable accessibilityRole="button" accessibilityLabel={`ดูรายละเอียดสินค้า ${order.product.name}`}
              onPress={() => router.push(routes.product(order.product.id))}
              style={({ pressed }) => [styles.productCard, { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.85 : 1 }]}>
              <View style={[styles.productImageWrapper, { backgroundColor: theme.backgroundElement }]}>
                {productImageUrl ? <Image source={{ uri: productImageUrl }} style={styles.productImage} resizeMode="cover" accessibilityLabel={`รูปสินค้า ${order.product.name}`} />
                  : <ThemedText style={{ fontSize: 26 }}>📦</ThemedText>}
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <ThemedText type="smallBold" numberOfLines={2}>{order.product.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{CONDITION_LABELS[order.product.condition] ?? order.product.condition} · ขนาด {order.product.size}</ThemedText>
              </View>
              <ThemedText style={{ fontSize: 22, color: theme.textSecondary }}>›</ThemedText>
            </Pressable>

            <SectionCard title={isBuyer ? 'ที่อยู่จัดส่ง' : 'ที่อยู่ผู้ซื้อ'}>
              {order.shippingAddress ? <View style={{ gap: 4 }}>
                <ThemedText type="small">{order.shippingAddress.recipientName} · {order.shippingAddress.phone}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{order.shippingAddress.addressLine} {order.shippingAddress.subdistrict} {order.shippingAddress.district} {order.shippingAddress.province} {order.shippingAddress.postalCode}</ThemedText>
              </View> : <ThemedText type="small" themeColor="textSecondary">{isBuyer ? 'ไม่มีข้อมูลที่อยู่' : 'ระบบไม่แสดงที่อยู่ผู้ซื้อในขั้นตอนนี้'}</ThemedText>}
            </SectionCard>

            <MoneyCard summary={money} />
            <HistoryCard history={data.history} />

            <SectionCard title="ข้อมูลคำสั่งซื้อ">
              <MetaRow label="สั่งซื้อเมื่อ" value={formatDateTime(order.createdAt)} />
              <MetaRow label="ชำระเมื่อ" value={formatDateTime(order.paidAt)} />
              <MetaRow label="ยกเลิกเมื่อ" value={formatDateTime(order.cancelledAt)} />
              <MetaRow label="เลขใบเสร็จ" value={isBuyer ? order.receiptNo : null} />
            </SectionCard>

            {isBuyer && (order.canPay || state.uncertain) ? <SectionCard title={COPY.simulatedPayment} trailing={<SimulationLabel />} testID="payment-simulation">
              <ThemedText type="small" themeColor="textSecondary">ไม่มีการตัดเงินจริง ไม่มี QR หรือบัญชีธนาคารให้โอน ยอด {formatBaht(order.amounts.totalAmount)} คำนวณโดยระบบ สำเร็จเมื่อระบบบันทึกแล้วเท่านั้น</ThemedText>
              {state.payError ? <ActionNotice failure={{ ...describeActionError({ kind: state.payError, code: state.payCode }), message: errorText(state.payError, state.payCode) }} /> : null}
              {state.uncertain ? <Button label="ส่งคำขอชำระเดิมอีกครั้ง" variant="primary" busy={paying} onPress={() => { void store.retryUncertain(); }} />
                : <View style={{ gap: 8 }}>
                  <Button label={state.paying === 'SUCCESS' ? 'กำลังบันทึก' : 'ชำระเงินจำลองสำเร็จ'} variant="primary" busy={state.paying === 'SUCCESS'} disabled={paying} onPress={() => { void store.pay('SUCCESS'); }} />
                  <Button label={state.paying === 'FAILED' ? 'กำลังบันทึก' : 'จำลองการชำระไม่สำเร็จ'} busy={state.paying === 'FAILED'} disabled={paying} onPress={() => { void store.pay('FAILED'); }} />
                </View>}
            </SectionCard> : null}

            {isBuyer && order.canCancel ? <Pressable accessibilityRole="button" accessibilityLabel="ยกเลิกคำสั่งซื้อนี้" onPress={() => setConfirmingCancel(true)} style={styles.cancelTriggerBtn}>
              <ThemedText style={{ color: theme.danger, fontSize: 13 }}>ยกเลิกคำสั่งซื้อนี้</ThemedText></Pressable> : null}
            {isBuyer && !order.canCancel && state.cancelError ? <ThemedText type="small" style={{ color: theme.danger, textAlign: 'center' }}>{errorText(state.cancelError, state.cancelCode)}</ThemedText> : null}
          </View> : null}
        </ScrollView>

        {order && journey ? <StickyActions>
          {isBuyer && waitingPayment && order.canPay ? <View style={styles.stickyPayRow}>
            <View style={{ flex: 1 }}>
              <ThemedText type="small" themeColor="textSecondary">ยอดชำระ (จำลอง)</ThemedText>
              <ThemedText type="smallBold" style={{ fontSize: 18 }}>{formatBaht(order.amounts.totalAmount)}</ThemedText>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={COPY.simulatedPayment} disabled={paying} onPress={() => { void store.pay('SUCCESS'); }}
              style={({ pressed }) => [styles.stickyPrimary, { backgroundColor: theme.primary, opacity: pressed || paying ? 0.8 : 1 }]}>
              {state.paying === 'SUCCESS' ? <WondeeLoader size={20} /> : <ThemedText style={{ color: theme.onPrimary, fontWeight: '700' }}>ชำระเงินจำลอง</ThemedText>}
            </Pressable>
          </View>
            : !isBuyer && journey.actions.includes('ship-to-center') ? <Button label="บันทึกที่อยู่รับคืนและแจ้งส่งเข้าศูนย์" variant="primary" onPress={() => router.push(routes.shipToCenter(order.id))} />
              : isBuyer && journey.actions.includes('receipt') && order.receiptNo ? <Button label={`ดูใบเสร็จ ${order.receiptNo}`} onPress={() => router.push(routes.receipt(order.id))} />
                : isBuyer && order.status === 'CANCELLED' ? <Button label="เลือกซื้อสินค้าอื่น" onPress={() => router.replace(routes.home)} /> : null}
        </StickyActions> : null}

        <Modal visible={confirmingCancel} transparent animationType="fade" onRequestClose={() => setConfirmingCancel(false)}>
          <View style={styles.modalBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setConfirmingCancel(false)} />
            <View style={[styles.modalPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <ThemedText type="subtitle">ยกเลิกคำสั่งซื้อ</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">ยกเลิกแล้วกลับมาไม่ได้ และสินค้าจะกลับไปขายต่อ</ThemedText>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}><Button label="ไม่ยกเลิก" disabled={state.cancelling} onPress={() => setConfirmingCancel(false)} /></View>
                <View style={{ flex: 1 }}><Button label="ยืนยันยกเลิก" variant="danger" busy={state.cancelling} onPress={async () => { await store.cancel(); setConfirmingCancel(false); }} /></View>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </Screen>
  );
}

function StatusNotice({ tone, title, detail }: { tone: 'success' | 'danger'; title: string; detail: string }) {
  const theme = useTheme();
  return <View style={[styles.notice, { borderColor: theme[tone], backgroundColor: theme[`${tone}Soft`] }]}>
    <ThemedText type="smallBold" style={{ color: theme[tone] }} accessibilityLiveRegion="polite">{title}</ThemedText>
    <ThemedText type="small" themeColor="textSecondary">{detail}</ThemedText>
  </View>;
}

function MetaRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
    <ThemedText type="small" themeColor="textSecondary">{label}</ThemedText><ThemedText type="small">{value}</ThemedText>
  </View>;
}

function StickyActions({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  if (!children) return null;
  return <View style={[styles.stickyBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>{children}</View>;
}

const styles = StyleSheet.create({
  scrollContainer: { padding: 16, paddingBottom: 40, gap: 14 },
  headerRefreshBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: 'rgba(148, 163, 184, 0.1)' },
  notice: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 4 },
  productCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 16, padding: 12 },
  productImageWrapper: { width: 64, height: 64, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  productImage: { width: 64, height: 64 },
  cancelTriggerBtn: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  stickyBar: { borderTopWidth: 1, padding: 12, gap: 8 },
  stickyPayRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stickyPrimary: { minHeight: 48, borderRadius: 12, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modalPanel: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 20, gap: 12 },
});
