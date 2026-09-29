import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useRouter } from 'expo-router';

import { useAuth } from '@/auth/auth-provider';
import { InspectionOrderPanel } from './inspection/connected-screens';
import { MarketplaceHeader } from './marketplace-header';
import { ThemedText } from '@/components/themed-text';
import {
  Button,
  Card,
  errorText,
  Loading,
  Row,
  Screen,
  styles as orderUiStyles,
} from '@/components/order-ui';
import { WondeeLoader } from './wondee/loader';
import { useTheme } from '@/hooks/use-theme';
import { useThemePreference } from '@/theme/theme-provider';
import { useProductImage } from '@/hooks/use-product-image';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useOrderDetail, useOrdersList } from '@/orders/orders-provider';
import { CONDITION_LABELS } from '@/services/product-service';
import {
  cancelReasonLabels,
  deadlineAt,
  formatBaht,
  formatDateTime,
  formatRemaining,
  orderStatusLabel,
  paymentStatusLabels,
} from '@/orders/order-format';

/** ถามสถานะจริงซ้ำทุกกี่มิลลิวินาทีหลังเลยเส้นตาย จนกว่า server จะตอบสถานะสุดท้าย */
const DEADLINE_RECHECK_MS = 5000;

export function OrderDetailScreen({ orderId }: { orderId: number | null }) {
  const theme = useTheme();
  const { scheme } = useThemePreference();
  const isDark = scheme === 'dark';
  const auth = useAuth();
  const router = useRouter();
  const { state, store } = useOrderDetail();
  const list = useOrdersList();
  const openedFor = useRef<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [isManualRefresh, setIsManualRefresh] = useState(false);
  const lastDeadlineCheck = useRef(0);

  const order = state.owner === auth.session?.user.id && state.orderId === orderId ? state.order : null;
  const productImageUrl = useProductImage(order?.product?.id ?? 0, order?.product?.imageUrl ?? null);
  const paying = state.paying !== null;
  const isBuyer = order?.viewerRole === 'buyer';
  // เส้นตายมาจาก server ฝั่งแอปทำแค่แปลงเป็นเวลาที่เหลือให้ดู ไม่ตัดสินสถานะเอง
  const waitingPayment = order?.status === 'WAITING_PAYMENT';
  const deadline = waitingPayment ? deadlineAt(order?.expiresAt) : null;
  const remaining = waitingPayment ? formatRemaining(order?.expiresAt, now) : null;
  // ตัดสินจากเวลาดิบ ไม่ใช่จากการที่ข้อความนับถอยหลังกลายเป็นค่าว่าง
  const deadlinePassed = deadline !== null && now >= deadline;

  useEffect(() => {
    if (!state.refreshing) {
      setIsManualRefresh(false);
    }
  }, [state.refreshing]);

  const handleManualRefresh = useCallback(() => {
    setIsManualRefresh(true);
    void store.refresh();
  }, [store]);

  const pullToRefresh = usePullToRefresh({
    refreshing: state.refreshing,
    onRefresh: handleManualRefresh,
  });

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
    if (!waitingPayment || deadline === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [deadline, waitingPayment]);

  useEffect(() => {
    // นาฬิกาหมดแล้วแต่สถานะยังเก่า ให้ถามสถานะจริงจาก server ห้ามสรุปผลเอง
    // ถามซ้ำเป็นระยะจนกว่า server จะตอบสถานะสุดท้าย เพราะคำตอบครั้งแรกอาจมาถึงก่อนเส้นตายจริง
    // (เช่น นาฬิกาเครื่องเร็วกว่า server เล็กน้อย) ถ้าถามครั้งเดียวหน้าจอจะค้างที่ "กำลังตรวจสถานะล่าสุด"
    if (!deadlinePassed) {
      lastDeadlineCheck.current = 0;
      return;
    }
    if (now - lastDeadlineCheck.current < DEADLINE_RECHECK_MS) return;
    lastDeadlineCheck.current = now;
    void store.refresh();
  }, [deadlinePassed, now, store]);

  if (!auth.session) return <Redirect href="/login" />;

  const isCancelled = order?.status === 'CANCELLED';
  const isPaid =
    order?.status === 'WAITING_SELLER_SHIP' ||
    order?.status === 'SHIPPING_TO_CENTER' ||
    order?.status === 'RECEIVED_AT_CENTER' ||
    order?.status === 'INSPECTING' ||
    order?.status === 'RESULT_NOTIFIED' ||
    order?.paymentStatus === 'PAID';

  // 7-step timeline structure matching prototype index.html
  const timelineSteps = [
    {
      label: 'สั่งซื้อ',
      time: order?.createdAt ? formatDateTime(order.createdAt) : '',
    },
    {
      label: 'ชำระเงิน',
      time: order?.paidAt ? formatDateTime(order.paidAt) : '',
    },
    {
      label: 'ผู้ขายส่งเข้าศูนย์ตรวจ',
      time: isPaid ? (order?.status === 'WAITING_SELLER_SHIP' ? 'ภายใน 3 วัน' : 'จัดส่งแล้ว') : '',
    },
    {
      label: 'ศูนย์รับของและตรวจสอบ',
      time:
        order?.status === 'RECEIVED_AT_CENTER' || order?.status === 'INSPECTING'
          ? 'กำลังตรวจสอบ'
          : '',
    },
    {
      label: `แจ้งผลตรวจ / ${isBuyer ? 'คุณยืนยันรับ' : 'ผู้ซื้อยืนยัน'}`,
      time: order?.status === 'RESULT_NOTIFIED' ? 'แจ้งผลแล้ว' : '',
    },
    {
      label: `ส่งถึง${isBuyer ? 'คุณ' : 'ผู้ซื้อ'}`,
      time: '',
    },
    {
      label: 'สำเร็จ',
      time: '',
    },
  ];

  let currentTimelineIndex = 1;
  if (isCancelled) {
    currentTimelineIndex = order?.paidAt ? 2 : 1;
  } else if (order?.status === 'WAITING_PAYMENT') {
    currentTimelineIndex = 1;
  } else if (order?.status === 'WAITING_SELLER_SHIP') {
    currentTimelineIndex = 2;
  } else if (order?.status === 'SHIPPING_TO_CENTER') {
    currentTimelineIndex = 3;
  } else if (order?.status === 'RECEIVED_AT_CENTER' || order?.status === 'INSPECTING') {
    currentTimelineIndex = 3;
  } else if (order?.status === 'RESULT_NOTIFIED') {
    currentTimelineIndex = 4;
  }

  const categoryEmoji = order?.product?.name?.includes('กระเป๋า')
    ? '👜'
    : order?.product?.name?.includes('เสื้อ') || order?.product?.name?.includes('Jacket')
      ? '🧥'
      : order?.product?.name?.includes('หูฟัง')
        ? '🎧'
        : '📦';

  return (
    <Screen>
      <SafeAreaView style={[orderUiStyles.content, { flex: 1, alignSelf: 'center', gap: 0 }]}>
        <MarketplaceHeader
          title={`คำสั่งซื้อ${order ? ` #${order.id}` : ''}`}
          back
          trailing={
            order ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="รีเฟรชสถานะ"
                onPress={() => {
                  void store.refresh();
                }}
                hitSlop={8}
                style={styles.headerRefreshBtn}>
                <ThemedText style={{ fontSize: 13, color: theme.textSecondary }}>รีเฟรช</ThemedText>
              </Pressable>
            ) : null
          }
        />

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContainer}
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
          refreshControl={
            <RefreshControl
              refreshing={isManualRefresh && state.refreshing}
              colors={['#059669']}
              tintColor="#059669"
              onRefresh={handleManualRefresh}
            />
          }>
          {Platform.OS === 'web' && isManualRefresh && state.refreshing ? (
            <View style={{ paddingVertical: 8, alignItems: 'center' }}>
              <Loading label="กำลังรีเฟรชคำสั่งซื้อ..." />
            </View>
          ) : null}

          {orderId === null ? <ThemedText>รหัสคำสั่งซื้อไม่ถูกต้อง</ThemedText> : null}
          {state.loading && !order ? <Loading label="กำลังโหลดคำสั่งซื้อ" /> : null}

          {state.loadError && !order ? (
            <Card>
              <ThemedText accessibilityLiveRegion="polite">{errorText(state.loadError)}</ThemedText>
              {state.loadError !== 'not-found' ? (
                <Button
                  label="ลองใหม่อีกครั้ง"
                  onPress={() => {
                    void store.refresh();
                  }}
                />
              ) : null}
            </Card>
          ) : null}

          {order ? (
            <View style={{ gap: 14 }}>
              {/* Notice Banners for Payment Simulation Results */}
              {state.lastResult === 'succeeded' ? (
                <View
                  style={[
                    styles.resultNoticeBox,
                    {
                      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : '#ECFDF5',
                      borderColor: '#10B981',
                    },
                  ]}>
                  <ThemedText
                    type="smallBold"
                    style={{ color: '#059669', fontSize: 14 }}
                    accessibilityLiveRegion="polite">
                    ชำระเงินสำเร็จ
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    เงินจำลองพักไว้ตามขั้นตอนของระบบ
                  </ThemedText>
                </View>
              ) : null}

              {state.lastResult === 'failed' ? (
                <View
                  style={[
                    styles.resultNoticeBox,
                    {
                      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEF2F2',
                      borderColor: '#EF4444',
                    },
                  ]}>
                  <ThemedText
                    type="smallBold"
                    style={{ color: '#DC2626', fontSize: 14 }}
                    accessibilityLiveRegion="polite">
                    ชำระเงินไม่สำเร็จ
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    สินค้ายังถูกจองไว้ให้คุณ สามารถลองชำระใหม่ได้
                  </ThemedText>
                </View>
              ) : null}

              {/* Top Contextual Status Banner */}
              {waitingPayment ? (
                <View
                  style={[
                    styles.statusBannerAmber,
                    {
                      backgroundColor: isDark ? '#2E1E05' : '#FFFBEB',
                      borderColor: isDark ? '#78350F' : '#FDE68A',
                    },
                  ]}>
                  <View style={styles.bannerHeaderRow}>
                    <View style={styles.statusPillAmber}>
                      <ThemedText style={styles.statusPillAmberText}>รอชำระเงิน</ThemedText>
                    </View>
                    <ThemedText style={styles.bannerSubLabel}>เหลือเวลาชำระเงิน</ThemedText>
                  </View>

                  <View style={styles.bannerBodyRow}>
                    <ThemedText style={styles.bannerDescText}>
                      {isBuyer
                        ? 'สินค้าถูกจองไว้ให้คุณ ถ้าเลยเวลาระบบจะยกเลิกให้อัตโนมัติ'
                        : 'รอผู้ซื้อชำระเงิน ถ้าเลยเวลาระบบจะยกเลิกและสินค้ากลับไปขายต่อ'}
                    </ThemedText>
                    <ThemedText style={styles.bannerCountdownText}>
                      {remaining ?? '00:00'}
                    </ThemedText>
                  </View>

                  {deadlinePassed ? (
                    <ThemedText
                      type="small"
                      style={{ color: '#EF4444', fontWeight: 'bold', marginTop: 8 }}
                      accessibilityLiveRegion="polite">
                      หมดเวลาชำระเงินแล้ว กำลังตรวจสถานะล่าสุดจากระบบ
                    </ThemedText>
                  ) : null}
                </View>
              ) : order.status === 'WAITING_SELLER_SHIP' ? (
                <View
                  style={[
                    styles.statusBannerEmerald,
                    {
                      backgroundColor: isDark ? '#052E20' : '#ECFDF5',
                      borderColor: isDark ? '#065F46' : '#A7F3D0',
                    },
                  ]}>
                  <View style={styles.bannerIconCircle}>
                    <ThemedText style={styles.bannerCheckmark}>✓</ThemedText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.bannerTitleText}>
                      {isBuyer ? 'ชำระเงินสำเร็จ' : 'ผู้ซื้อชำระเงินแล้ว'}
                    </ThemedText>
                    <ThemedText style={styles.bannerSubtitleText}>
                      {isBuyer
                        ? 'รอผู้ขายจัดส่งสินค้า'
                        : 'กรุณาจัดส่งสินค้าเข้าศูนย์ตรวจสภาพ'}
                    </ThemedText>
                  </View>
                </View>
              ) : isCancelled ? (
                <View
                  style={[
                    styles.statusBannerCancelled,
                    {
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                    },
                  ]}>
                  <View style={styles.statusPillCancelled}>
                    <ThemedText style={styles.statusPillCancelledText}>ยกเลิกแล้ว</ThemedText>
                  </View>
                  <ThemedText
                    type="smallBold"
                    style={{ fontSize: 15, marginTop: 8 }}
                    accessibilityLiveRegion="polite">
                    คำสั่งซื้อนี้ถูกยกเลิกแล้ว
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: 2 }}>
                    {order.cancelReason
                      ? cancelReasonLabels[order.cancelReason]
                      : 'คำสั่งซื้อนี้ถูกยกเลิกแล้ว'}
                  </ThemedText>
                  {formatDateTime(order.cancelledAt) ? (
                    <ThemedText style={{ fontSize: 11, color: theme.textSecondary, marginTop: 4 }}>
                      ยกเลิกเมื่อ {formatDateTime(order.cancelledAt)}
                    </ThemedText>
                  ) : null}
                  {!isBuyer ? (
                    <ThemedText style={styles.sellerCancelledNote}>
                      ✓ สินค้ากลับมาขายอยู่แล้ว
                    </ThemedText>
                  ) : null}
                </View>
              ) : (
                <View
                  style={[
                    styles.statusBannerGeneric,
                    { backgroundColor: theme.surface, borderColor: theme.border },
                  ]}>
                  <ThemedText type="smallBold" style={{ fontSize: 15 }}>
                    {orderStatusLabel(order.status)}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    การชำระเงิน: {paymentStatusLabels[order.paymentStatus]}
                  </ThemedText>
                </View>
              )}

              {/* 7-Step Visual Order Progress Timeline */}
              <View
                style={[
                  styles.cardBox,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                ]}>
                <ThemedText type="smallBold" style={styles.sectionHeaderTitle}>
                  สถานะคำสั่งซื้อ
                </ThemedText>

                <View style={styles.timelineList}>
                  {timelineSteps.map((s, i) => {
                    const isDone = i < currentTimelineIndex;
                    const isNow = i === currentTimelineIndex;
                    const isStepCancelled = isCancelled && isNow;
                    const isLast = i === timelineSteps.length - 1;

                    return (
                      <View key={s.label} style={styles.timelineRow}>
                        <View style={styles.timelineCol}>
                          <View
                            style={[
                              styles.timelineDot,
                              isDone
                                ? styles.timelineDotDone
                                : isStepCancelled
                                  ? styles.timelineDotCancelled
                                  : isNow
                                    ? styles.timelineDotNow
                                    : [
                                        styles.timelineDotTodo,
                                        {
                                          borderColor: isDark ? '#475569' : '#CBD5E1',
                                          backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                                        },
                                      ],
                            ]}>
                            {isDone ? (
                              <ThemedText style={styles.timelineDotMark}>✓</ThemedText>
                            ) : isStepCancelled ? (
                              <ThemedText style={styles.timelineDotMark}>✕</ThemedText>
                            ) : (
                              <ThemedText
                                style={[
                                  styles.timelineDotNumber,
                                  isNow
                                    ? styles.timelineDotNumberNow
                                    : { color: theme.textSecondary },
                                ]}>
                                {i + 1}
                              </ThemedText>
                            )}
                          </View>

                          {!isLast ? (
                            <View
                              style={[
                                styles.timelineLine,
                                isDone
                                  ? styles.timelineLineDone
                                  : { backgroundColor: isDark ? '#334155' : '#E2E8F0' },
                              ]}
                            />
                          ) : null}
                        </View>

                        <View style={styles.timelineContent}>
                          <ThemedText
                            style={[
                              styles.timelineStepLabel,
                              isStepCancelled
                                ? { color: '#EF4444' }
                                : isDone || isNow
                                  ? { color: theme.text, fontWeight: '700' }
                                  : { color: theme.textSecondary },
                            ]}>
                            {isStepCancelled ? 'ยกเลิกแล้ว' : s.label}
                          </ThemedText>
                          {s.time && !isStepCancelled ? (
                            <ThemedText style={styles.timelineStepTime}>{s.time}</ThemedText>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                </View>

                <InspectionOrderPanel order={order} />
              </View>

              {/* Clickable Product Summary Card */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`ดูรายละเอียดสินค้า ${order.product.name}`}
                onPress={() => {
                  router.push({
                    pathname: '/products/[id]',
                    params: { id: String(order.product.id) },
                  });
                }}
                style={({ pressed }) => [
                  styles.cardBox,
                  styles.productCardRow,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}>
                <View
                  style={[
                    styles.productImageWrapper,
                    { backgroundColor: theme.backgroundElement ?? '#F1F5F9' },
                  ]}>
                  {productImageUrl ? (
                    <Image
                      source={{ uri: productImageUrl }}
                      style={styles.productImage}
                      resizeMode="cover"
                      accessibilityLabel={`รูปสินค้า ${order.product.name}`}
                    />
                  ) : (
                    <ThemedText style={{ fontSize: 26 }}>{categoryEmoji}</ThemedText>
                  )}
                </View>

                <View style={styles.productDetails}>
                  <ThemedText type="smallBold" numberOfLines={2} style={styles.productName}>
                    {order.product.name}
                  </ThemedText>
                  <View style={styles.productBadgeRow}>
                    <View style={styles.condBadge}>
                      <ThemedText style={styles.condBadgeText}>
                        {CONDITION_LABELS[order.product.condition] ?? 'สภาพดี'}
                      </ThemedText>
                    </View>
                    <ThemedText style={styles.productSizeText}>
                      ขนาด {order.product.size}
                    </ThemedText>
                  </View>
                </View>

                <ThemedText style={styles.chevronArrow}>›</ThemedText>
              </Pressable>

              {/* Shipping Address Card */}
              <View
                style={[
                  styles.cardBox,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                ]}>
                <ThemedText type="smallBold" style={styles.sectionHeaderTitle}>
                  ที่อยู่จัดส่ง
                </ThemedText>
                {order.shippingAddress ? (
                  <View style={{ gap: 4 }}>
                    <ThemedText style={styles.addressRecipient}>
                      {order.shippingAddress.recipientName} · {order.shippingAddress.phone}
                    </ThemedText>
                    <ThemedText style={styles.addressFull}>
                      {order.shippingAddress.addressLine} {order.shippingAddress.subdistrict}{' '}
                      {order.shippingAddress.district} {order.shippingAddress.province}{' '}
                      {order.shippingAddress.postalCode}
                    </ThemedText>
                  </View>
                ) : (
                  <ThemedText type="small" themeColor="textSecondary">
                    ที่อยู่ของผู้ซื้อจะแสดงเมื่อผู้ซื้อชำระเงินแล้ว
                  </ThemedText>
                )}
              </View>

              {/* Payment Summary / Breakdown Card */}
              <View
                style={[
                  styles.cardBox,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                ]}>
                <ThemedText type="smallBold" style={styles.sectionHeaderTitle}>
                  {isBuyer ? 'สรุปการชำระเงิน' : 'รายได้จากคำสั่งซื้อนี้'}
                </ThemedText>

                <View style={styles.breakdownRow}>
                  <ThemedText style={styles.breakdownLabel}>ราคาสินค้า</ThemedText>
                  <ThemedText style={styles.breakdownValue}>
                    {formatBaht(order.amounts.itemPrice)}
                  </ThemedText>
                </View>

                {isBuyer ? (
                  <>
                    <View style={styles.breakdownRow}>
                      <ThemedText style={styles.breakdownLabel}>ค่าจัดส่ง</ThemedText>
                      <ThemedText style={styles.breakdownValue}>
                        {formatBaht(order.amounts.shippingFee)}
                      </ThemedText>
                    </View>
                    <View style={styles.breakdownRow}>
                      <ThemedText style={styles.breakdownLabel}>ค่าตรวจสอบสินค้า</ThemedText>
                      <ThemedText style={styles.breakdownValue}>
                        {formatBaht(order.amounts.inspectionFee)}
                      </ThemedText>
                    </View>
                    <View
                      style={[
                        styles.breakdownTotalRow,
                        { borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E2E8F0' },
                      ]}>
                      <ThemedText style={styles.breakdownTotalLabel}>ยอดชำระทั้งหมด</ThemedText>
                      <ThemedText
                        style={[
                          styles.breakdownTotalValue,
                          isCancelled && styles.breakdownCancelledValue,
                        ]}>
                        {formatBaht(order.amounts.totalAmount)}
                      </ThemedText>
                    </View>
                  </>
                ) : (
                  <>
                    <View style={styles.breakdownRow}>
                      <ThemedText style={styles.breakdownLabel}>ค่าธรรมเนียมระบบ (5%)</ThemedText>
                      <ThemedText style={[styles.breakdownValue, { color: '#EF4444' }]}>
                        -{formatBaht(order.amounts.commissionFee)}
                      </ThemedText>
                    </View>
                    <View
                      style={[
                        styles.breakdownTotalRow,
                        { borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E2E8F0' },
                      ]}>
                      <ThemedText style={styles.breakdownTotalLabel}>
                        ยอดที่ผู้ขายจะได้รับ
                      </ThemedText>
                      <ThemedText
                        style={[
                          styles.breakdownTotalValue,
                          isCancelled && styles.breakdownCancelledValue,
                        ]}>
                        {formatBaht(order.amounts.sellerPayout)}
                      </ThemedText>
                    </View>
                  </>
                )}
              </View>

              {/* Order Metadata Card */}
              <View
                style={[
                  styles.cardBox,
                  styles.metadataCard,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                ]}>
                <View style={styles.metadataRow}>
                  <ThemedText style={styles.metadataLabel}>สั่งซื้อเมื่อ</ThemedText>
                  <ThemedText style={styles.metadataValue}>
                    {formatDateTime(order.createdAt) ?? '-'}
                  </ThemedText>
                </View>
                {formatDateTime(order.paidAt) ? (
                  <View style={styles.metadataRow}>
                    <ThemedText style={styles.metadataLabel}>ชำระเมื่อ</ThemedText>
                    <ThemedText style={styles.metadataValue}>
                      {formatDateTime(order.paidAt)!}
                    </ThemedText>
                  </View>
                ) : null}
                {formatDateTime(order.cancelledAt) ? (
                  <View style={styles.metadataRow}>
                    <ThemedText style={styles.metadataLabel}>ยกเลิกเมื่อ</ThemedText>
                    <ThemedText style={styles.metadataValue}>
                      {formatDateTime(order.cancelledAt)!}
                    </ThemedText>
                  </View>
                ) : null}
              </View>

              {/* Payment Simulation Section (Accessible for Testing & Dev) */}
              {isBuyer && (order.canPay || state.uncertain) ? (
                <View
                  style={[
                    styles.cardBox,
                    { backgroundColor: theme.surface, borderColor: theme.border },
                  ]}>
                  <ThemedText type="smallBold" style={styles.sectionHeaderTitle}>
                    ชำระเงิน (จำลอง)
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    ยอดที่ต้องชำระ {formatBaht(order.amounts.totalAmount)} ตามที่ระบบคำนวณ
                  </ThemedText>

                  {state.payError ? (
                    <View style={[styles.resultNoticeBox, { borderColor: theme.danger }]}>
                      <ThemedText
                        type="small"
                        style={{ color: theme.danger }}
                        accessibilityLiveRegion="polite">
                        {errorText(state.payError, state.payCode)}
                      </ThemedText>
                    </View>
                  ) : null}

                  {state.uncertain ? (
                    <Button
                      label="ส่งคำขอเดิมอีกครั้ง"
                      variant="primary"
                      busy={paying}
                      onPress={() => {
                        void store.retryUncertain();
                      }}
                    />
                  ) : (
                    <View style={styles.simButtonRow}>
                      <Button
                        label={state.paying === 'SUCCESS' ? 'กำลังชำระ' : 'จำลองจ่ายสำเร็จ'}
                        variant="primary"
                        busy={state.paying === 'SUCCESS'}
                        disabled={paying}
                        onPress={() => {
                          void store.pay('SUCCESS');
                        }}
                      />
                      <Button
                        label={state.paying === 'FAILED' ? 'กำลังส่ง' : 'จำลองจ่ายล้มเหลว'}
                        variant="danger"
                        busy={state.paying === 'FAILED'}
                        disabled={paying}
                        onPress={() => {
                          void store.pay('FAILED');
                        }}
                      />
                    </View>
                  )}
                </View>
              ) : null}

              {/* Cancel Order Link Trigger (Below Cards) */}
              {isBuyer && order.canCancel ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="ยกเลิกคำสั่งซื้อนี้"
                  onPress={() => setConfirmingCancel(true)}
                  style={styles.cancelTriggerBtn}>
                  <ThemedText style={styles.cancelTriggerText}>ยกเลิกคำสั่งซื้อนี้</ThemedText>
                </Pressable>
              ) : null}

              {isBuyer && !order.canCancel && state.cancelError ? (
                <ThemedText type="small" style={{ color: theme.danger, textAlign: 'center' }}>
                  {errorText(state.cancelError, state.cancelCode)}
                </ThemedText>
              ) : null}

              {/* Secondary Actions for Buyer / Seller */}
              {isBuyer && order.receiptNo && !waitingPayment ? (
                <Button
                  label={`ดูใบเสร็จ ${order.receiptNo}`}
                  variant="secondary"
                  onPress={() =>
                    router.push({
                      pathname: '/receipt/[orderId]',
                      params: { orderId: String(order.id) },
                    })
                  }
                />
              ) : null}
            </View>
          ) : null}
        </ScrollView>

        {/* Sticky Bottom Action Bar matching prototype od-bar */}
        {order ? (
          <View
            style={[
              styles.stickyBottomBar,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}>
            {isBuyer && waitingPayment ? (
              <View style={styles.stickyPayRow}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.stickyPayLabel}>ยอดชำระ</ThemedText>
                  <ThemedText style={styles.stickyPayAmount}>
                    {formatBaht(order.amounts.totalAmount)}
                  </ThemedText>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="ชำระเงิน"
                  disabled={paying}
                  onPress={() => {
                    void store.pay('SUCCESS');
                  }}
                  style={({ pressed }) => [
                    styles.stickyPayBtn,
                    { opacity: pressed || paying ? 0.8 : 1 },
                  ]}>
                  {state.paying === 'SUCCESS' ? (
                    <WondeeLoader size={20} />
                  ) : (
                    <ThemedText style={styles.stickyPayBtnText}>ชำระเงิน</ThemedText>
                  )}
                </Pressable>
              </View>
            ) : isBuyer && order.status === 'WAITING_SELLER_SHIP' && order.receiptNo ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`ดูใบเสร็จ ${order.receiptNo}`}
                onPress={() =>
                  router.push({
                    pathname: '/receipt/[orderId]',
                    params: { orderId: String(order.id) },
                  })
                }
                style={styles.stickyReceiptBtn}>
                <ThemedText style={styles.stickyReceiptBtnText}>
                  ดูใบเสร็จ {order.receiptNo}
                </ThemedText>
              </Pressable>
            ) : !isBuyer && order.status === 'WAITING_SELLER_SHIP' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="จัดส่งสินค้า"
                onPress={() =>
                  router.push({
                    pathname: '/orders/[orderId]/ship-to-center',
                    params: { orderId: String(order.id) },
                  })
                }
                style={styles.stickyShipBtn}>
                <ThemedText style={styles.stickyShipBtnText}>จัดส่งสินค้า</ThemedText>
              </Pressable>
            ) : isBuyer && isCancelled ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="เลือกซื้อสินค้าอื่น"
                onPress={() => router.replace('/')}
                style={styles.stickyShopMoreBtn}>
                <ThemedText style={styles.stickyShopMoreBtnText}>เลือกซื้อสินค้าอื่น</ThemedText>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* Prototype-accurate Cancel Confirmation Modal Bottom Sheet (od-modal) */}
        <Modal
          visible={confirmingCancel}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setConfirmingCancel(false)}>
          <View style={styles.modalBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setConfirmingCancel(false)} />
            <View
              style={[
                styles.modalPanel,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}>
              <View style={styles.modalHandle} />
              <View style={styles.modalAlertIconBox}>
                <ThemedText style={styles.modalAlertExclamation}>!</ThemedText>
              </View>
              <ThemedText style={styles.modalTitle}>ยกเลิกคำสั่งซื้อ</ThemedText>
              <ThemedText style={styles.modalSubtitle}>
                ยกเลิกแล้วกลับมาไม่ได้ และสินค้าจะกลับไปขายต่อทันที
              </ThemedText>

              <View style={styles.modalButtonRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="ไม่ยกเลิก"
                  disabled={state.cancelling}
                  onPress={() => setConfirmingCancel(false)}
                  style={[
                    styles.modalCancelBtn,
                    {
                      backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
                      borderColor: theme.border,
                    },
                  ]}>
                  <ThemedText style={[styles.modalCancelBtnText, { color: theme.text }]}>
                    ไม่ยกเลิก
                  </ThemedText>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="ยืนยันยกเลิก"
                  disabled={state.cancelling}
                  onPress={async () => {
                    await store.cancel();
                    setConfirmingCancel(false);
                  }}
                  style={[styles.modalConfirmBtn, { opacity: state.cancelling ? 0.7 : 1 }]}>
                  {state.cancelling ? (
                    <WondeeLoader size={18} />
                  ) : (
                    <ThemedText style={styles.modalConfirmBtnText}>ยืนยันยกเลิก</ThemedText>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    padding: 16,
    paddingBottom: 40,
    gap: 14,
  },
  headerRefreshBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(148, 163, 184, 0.1)',
  },
  cardBox: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  sectionHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 10,
  },
  resultNoticeBox: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 2,
  },

  /* Amber Banner (Waiting Payment) */
  statusBannerAmber: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  bannerHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusPillAmber: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 99,
  },
  statusPillAmberText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  bannerSubLabel: {
    fontSize: 11,
    color: '#D97706',
    fontWeight: '500',
  },
  bannerBodyRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 2,
  },
  bannerDescText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    color: '#92400E',
  },
  bannerCountdownText: {
    fontSize: 26,
    fontWeight: '900',
    color: '#D97706',
    fontVariant: ['tabular-nums'],
  },

  /* Emerald Banner (Waiting Seller Ship / Paid) */
  statusBannerEmerald: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  bannerIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerCheckmark: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  bannerTitleText: {
    fontSize: 15,
    fontWeight: '700',
  },
  bannerSubtitleText: {
    fontSize: 11,
    color: '#059669',
    marginTop: 2,
  },

  /* Cancelled Banner */
  statusBannerCancelled: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  statusPillCancelled: {
    alignSelf: 'flex-start',
    backgroundColor: '#EF4444',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 99,
  },
  statusPillCancelledText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  sellerCancelledNote: {
    color: '#10B981',
    fontWeight: '600',
    fontSize: 11,
    marginTop: 6,
  },

  statusBannerGeneric: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 4,
  },

  /* Timeline Styles */
  timelineList: {
    gap: 0,
    marginTop: 4,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: 12,
  },
  timelineCol: {
    width: 24,
    alignItems: 'center',
  },
  timelineDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  timelineDotDone: {
    backgroundColor: '#10B981',
  },
  timelineDotCancelled: {
    backgroundColor: '#EF4444',
  },
  timelineDotNow: {
    backgroundColor: '#10B981',
    borderWidth: 3,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  timelineDotTodo: {
    borderWidth: 1.5,
  },
  timelineDotMark: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  timelineDotNumber: {
    fontSize: 10,
    fontWeight: '600',
  },
  timelineDotNumberNow: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  timelineLine: {
    width: 2,
    flex: 1,
    minHeight: 22,
    marginVertical: 2,
  },
  timelineLineDone: {
    backgroundColor: '#10B981',
  },
  timelineContent: {
    flex: 1,
    paddingBottom: 16,
    justifyContent: 'flex-start',
  },
  timelineStepLabel: {
    fontSize: 13,
    lineHeight: 20,
  },
  timelineStepTime: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 1,
  },

  /* Clickable Product Card */
  productCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  productImageWrapper: {
    width: 58,
    height: 58,
    borderRadius: 14,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  productImage: {
    width: 58,
    height: 58,
  },
  productDetails: {
    flex: 1,
    gap: 4,
  },
  productName: {
    fontSize: 13,
    lineHeight: 18,
  },
  productBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  condBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  condBadgeText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '600',
  },
  productSizeText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  chevronArrow: {
    fontSize: 22,
    color: '#94A3B8',
    paddingHorizontal: 4,
  },

  /* Shipping Address */
  addressRecipient: {
    fontSize: 13,
    fontWeight: '600',
  },
  addressFull: {
    fontSize: 12,
    lineHeight: 18,
    color: '#94A3B8',
  },

  /* Payment Breakdown */
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  breakdownLabel: {
    fontSize: 12,
    color: '#94A3B8',
  },
  breakdownValue: {
    fontSize: 13,
    fontWeight: '500',
  },
  breakdownTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: 10,
    marginTop: 4,
  },
  breakdownTotalLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  breakdownTotalValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#10B981',
  },
  breakdownCancelledValue: {
    color: '#94A3B8',
    textDecorationLine: 'line-through',
  },

  /* Order Metadata */
  metadataCard: {
    paddingVertical: 10,
    gap: 6,
  },
  metadataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metadataLabel: {
    fontSize: 11,
    color: '#94A3B8',
  },
  metadataValue: {
    fontSize: 11,
    fontWeight: '500',
  },

  /* Sim Controls */
  simButtonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },

  /* Cancel Button Trigger */
  cancelTriggerBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelTriggerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#EF4444',
  },

  /* Sticky Bottom Bar */
  stickyBottomBar: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  stickyPayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  stickyPayLabel: {
    fontSize: 10,
    color: '#94A3B8',
  },
  stickyPayAmount: {
    fontSize: 20,
    fontWeight: '900',
    color: '#10B981',
  },
  stickyPayBtn: {
    backgroundColor: '#059669',
    borderRadius: 14,
    paddingHorizontal: 32,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  stickyPayBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  stickyReceiptBtn: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#10B981',
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickyReceiptBtnText: {
    color: '#10B981',
    fontSize: 14,
    fontWeight: '700',
  },
  stickyShipBtn: {
    backgroundColor: '#059669',
    borderRadius: 14,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickyShipBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  stickyShopMoreBtn: {
    backgroundColor: '#059669',
    borderRadius: 14,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickyShopMoreBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  /* Cancel Modal Bottom Sheet */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  modalPanel: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    padding: 24,
    paddingBottom: 36,
    alignItems: 'center',
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#94A3B8',
    opacity: 0.4,
    marginBottom: 16,
  },
  modalAlertIconBox: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  modalAlertExclamation: {
    fontSize: 26,
    fontWeight: '900',
    color: '#EF4444',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 4,
  },
  modalButtonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 22,
    width: '100%',
  },
  modalCancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  modalConfirmBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
