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
import { ReviewModal } from '@/components/review-modal';
import { CertificateSheet } from './inspection/views';
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
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [isReviewed, setIsReviewed] = useState(false);
  const [showCertSheet, setShowCertSheet] = useState(false);
  const [reviewToast, setReviewToast] = useState<string | null>(null);
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

  const orderStatusStr = String(order?.status ?? '');
  const isReturnFlow = orderStatusStr === 'RETURNING_TO_SELLER' || orderStatusStr === 'REFUNDED' || orderStatusStr === 'RETURNED';
  const isInspectionFailed = isReturnFlow || (order as any)?.inspectionResult === 'NOT_AS_DESCRIBED' || (order as any)?.inspectionResult === 'FAKE' || order?.id === 37;
  const inspectionOutcome = (order as any)?.inspectionResult === 'FAKE' ? 'FAKE' : isInspectionFailed ? 'NOT_AS_DESCRIBED' : 'PASS';

  // 7-step timeline structure matching prototype index.html
  const timelineSteps = isReturnFlow
    ? [
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
          time: `จัดส่งแล้ว · พัสดุ TH2NDH00${order?.id ?? 37}A1`,
        },
        {
          label: 'ศูนย์รับของและตรวจสอบ',
          time: 'ตรวจสอบเรียบร้อย',
        },
        {
          label: isBuyer ? 'แจ้งผลตรวจ / คุณปฏิเสธผลตรวจ' : 'แจ้งผลตรวจ / ผู้ซื้อปฏิเสธผลตรวจ',
          time: 'ปฏิเสธผลตรวจ',
        },
        {
          label: isBuyer ? 'ศูนย์ส่งสินค้าคืนผู้ขาย' : 'ส่งคืนผู้ขาย',
          time: `พัสดุ TH2NDH00${order?.id ?? 37}R1`,
        },
        {
          label: isBuyer ? 'คืนเงินค่าสินค้าแล้ว' : 'ได้รับสินค้าคืน',
          time: (orderStatusStr === 'REFUNDED' || orderStatusStr === 'RETURNED') ? ((order as any)?.updatedAt ? formatDateTime((order as any).updatedAt) : 'เรียบร้อยแล้ว') : '',
        },
      ]
    : [
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
          time: isPaid ? (order?.status === 'WAITING_SELLER_SHIP' ? 'ภายใน 3 วัน' : `จัดส่งแล้ว · พัสดุ TH2NDH00${order?.id ?? 40}A1`) : '',
        },
        {
          label: 'ศูนย์รับของและตรวจสอบ',
          time:
            order?.status === 'RECEIVED_AT_CENTER' || order?.status === 'INSPECTING'
              ? 'กำลังตรวจสอบ'
              : (orderStatusStr === 'RESULT_NOTIFIED' || orderStatusStr === 'SHIPPING_TO_BUYER' || orderStatusStr === 'COMPLETED')
                ? 'ตรวจสอบเรียบร้อย'
                : '',
        },
        {
          label: `แจ้งผลตรวจ / ${isBuyer ? 'คุณยืนยันรับ' : 'ผู้ซื้อยืนยัน'}`,
          time: order?.status === 'RESULT_NOTIFIED' ? 'แจ้งผลแล้ว · รอการยืนยัน' : (orderStatusStr === 'SHIPPING_TO_BUYER' || orderStatusStr === 'COMPLETED') ? 'ยืนยันยอมรับผลตรวจแล้ว' : '',
        },
        {
          label: `ส่งถึง${isBuyer ? 'คุณ' : 'ผู้ซื้อ'}`,
          time: (orderStatusStr === 'SHIPPING_TO_BUYER' || orderStatusStr === 'COMPLETED') ? `พัสดุ TH2NDH00${order?.id ?? 40}Z9` : '',
        },
        {
          label: isBuyer ? 'สำเร็จ' : 'สำเร็จ · โอนเงินแล้ว',
          time: String(order?.status) === 'COMPLETED' ? ((order as any)?.updatedAt ? formatDateTime((order as any).updatedAt) : 'สำเร็จ') : '',
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
  } else if (orderStatusStr === 'SHIPPING_TO_BUYER') {
    currentTimelineIndex = 5;
  } else if (orderStatusStr === 'COMPLETED') {
    currentTimelineIndex = 6;
  } else if (orderStatusStr === 'RETURNING_TO_SELLER') {
    currentTimelineIndex = 5;
  } else if (orderStatusStr === 'REFUNDED' || orderStatusStr === 'RETURNED') {
    currentTimelineIndex = 6;
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
              ) : (order.status === 'RESULT_NOTIFIED' || orderStatusStr === 'RESULT_NOTIFIED') ? (
                <View
                  style={[
                    styles.statusBannerAmber,
                    {
                      backgroundColor: isDark ? '#2E1E05' : (isInspectionFailed ? (inspectionOutcome === 'FAKE' ? '#FEF2F2' : '#FFF7ED') : '#FFFBEB'),
                      borderColor: isDark ? '#78350F' : (isInspectionFailed ? (inspectionOutcome === 'FAKE' ? '#FCA5A5' : '#FED7AA') : '#FDE68A'),
                    },
                  ]}>
                  <View style={styles.bannerHeaderRow}>
                    <View style={[styles.statusPillAmber, isInspectionFailed && { backgroundColor: inspectionOutcome === 'FAKE' ? '#FEE2E2' : '#FFEDD5' }]}>
                      <ThemedText style={[styles.statusPillAmberText, isInspectionFailed && { color: inspectionOutcome === 'FAKE' ? '#DC2626' : '#EA580C' }]}>
                        {isInspectionFailed
                          ? (isBuyer ? (inspectionOutcome === 'FAKE' ? 'ผลตรวจ: 🔴 ของปลอม' : 'ผลตรวจ: 🟠 ไม่ตรงตามประกาศ') : (inspectionOutcome === 'FAKE' ? 'ผลตรวจ 🔴 ของปลอม · รอผู้ซื้อเลือก' : 'ผลตรวจ 🟠 ไม่ตรงตามประกาศ · รอผู้ซื้อเลือก'))
                          : (isBuyer ? 'ผลตรวจออกแล้ว' : 'รอผู้ซื้อยืนยัน')}
                      </ThemedText>
                    </View>
                    <ThemedText style={styles.bannerSubLabel}>เหลือเวลา 72 ชม.</ThemedText>
                  </View>
                  <View style={styles.bannerBodyRow}>
                    <ThemedText style={styles.bannerDescText}>
                      {isInspectionFailed
                        ? (isBuyer
                          ? 'ปฏิเสธ = ส่งคืนผู้ขาย + คืนเงินค่าสินค้า · ยอมรับ = รับตามสภาพจริง · ไม่ออกใบรับรอง · ถ้าไม่ตอบภายใน 72 ชม. ระบบจะส่งคืนผู้ขายและคืนเงินค่าสินค้าอัตโนมัติ'
                          : 'ผู้ซื้อเลือกได้ว่าจะรับสินค้าตามสภาพจริง หรือปฏิเสธให้ส่งคืนคุณ · ถ้าไม่ตอบภายใน 72 ชม. ระบบจะส่งคืนและคืนเงินอัตโนมัติ')
                        : (isBuyer
                          ? 'ผลตรวจออกแล้ว · กรุณายืนยันภายใน 72 ชม. ถ้าไม่ตอบระบบจะถือว่ายอมรับผลตรวจอัตโนมัติ'
                          : 'ผลตรวจออกแล้ว · รอผู้ซื้อยืนยันผลตรวจ')}
                    </ThemedText>
                  </View>
                </View>
              ) : (orderStatusStr === 'SHIPPING_TO_BUYER') ? (
                <View
                  style={{
                    backgroundColor: isDark ? '#0C2A4A' : '#F0F9FF',
                    borderColor: isDark ? '#0284C7' : '#BAE6FD',
                    borderRadius: 16,
                    borderWidth: 1,
                    padding: 14,
                    gap: 6,
                  }}>
                  <ThemedText type="smallBold" style={{ color: '#0284C7', fontSize: 14 }}>
                    {isBuyer ? 'กำลังส่งถึงคุณ' : 'กำลังส่งถึงผู้ซื้อ'}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    พัสดุ <ThemedText style={{ fontFamily: 'monospace', fontWeight: '700', color: theme.text }}>TH2NDH00{order.id}Z9</ThemedText> · {isBuyer ? 'ระบบจะปิดงานอัตโนมัติเมื่อพัสดุถึงคุณ' : 'เงินจะโอนให้คุณเมื่อพัสดุถึงผู้ซื้อ'}
                  </ThemedText>
                  <ThemedText style={{ fontSize: 10.5, color: '#64748B' }}>
                    💰 เงินพักไว้ที่ระบบ จะโอนให้ผู้ขายเมื่อผู้ซื้อได้รับสินค้า
                  </ThemedText>
                </View>
              ) : orderStatusStr === 'COMPLETED' ? (
                <View
                  style={[
                    styles.statusBannerEmerald,
                    {
                      backgroundColor: isDark ? '#052E20' : '#ECFDF5',
                      borderColor: isDark ? '#065F46' : '#A7F3D0',
                      gap: 6,
                    },
                  ]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={styles.bannerIconCircle}>
                      <ThemedText style={styles.bannerCheckmark}>✓</ThemedText>
                    </View>
                    <View style={{ flex: 1 }}>
                      <ThemedText style={styles.bannerTitleText}>
                        {isBuyer ? 'ได้รับสินค้าแล้ว · คำสั่งซื้อสำเร็จ' : 'โอนเงินให้คุณแล้ว'}
                      </ThemedText>
                      <ThemedText style={styles.bannerSubtitleText}>
                        {isBuyer
                          ? 'ขอบคุณที่เลือกซื้อสินค้ากับเรา'
                          : `ยอด ${formatBaht(order.amounts.sellerPayout)} โอนเข้าบัญชีรับเงินเรียบร้อยแล้ว`}
                      </ThemedText>
                    </View>
                  </View>
                </View>
              ) : orderStatusStr === 'RETURNING_TO_SELLER' ? (
                <View
                  style={[
                    styles.statusBannerCancelled,
                    {
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                      gap: 6,
                    },
                  ]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={styles.statusPillCancelled}>
                      <ThemedText style={styles.statusPillCancelledText}>
                        {isBuyer ? 'กำลังส่งคืนผู้ขาย' : 'กำลังส่งสินค้าคืนคุณ'}
                      </ThemedText>
                    </View>
                    <ThemedText style={{ fontSize: 11, color: '#64748B' }}>พัสดุ TH2NDH00{order.id}R1</ThemedText>
                  </View>
                  <ThemedText type="smallBold" style={{ fontSize: 14 }}>
                    {isBuyer ? 'คุณปฏิเสธผลตรวจ' : 'ผู้ซื้อปฏิเสธผลตรวจ'}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {isBuyer
                      ? `เมื่อส่งคืนถึงผู้ขาย ระบบจะคืนเงินค่าสินค้า ${formatBaht(order.amounts.itemPrice)} · ไม่คืนค่าจัดส่ง ฿50 และค่าตรวจสอบ ฿100`
                      : 'ศูนย์กำลังส่งสินค้าคืนคุณ · คำสั่งซื้อนี้ไม่มีการโอนเงิน'}
                  </ThemedText>
                </View>
              ) : (orderStatusStr === 'RETURNED' || orderStatusStr === 'REFUNDED') ? (
                <View
                  style={[
                    styles.statusBannerCancelled,
                    {
                      backgroundColor: isBuyer ? (isDark ? '#0C2A4A' : '#F0F9FF') : theme.surface,
                      borderColor: isBuyer ? (isDark ? '#0284C7' : '#BAE6FD') : theme.border,
                      gap: 8,
                    },
                  ]}>
                  {isBuyer ? (
                    <>
                      <ThemedText type="small" themeColor="textSecondary">
                        คืนเงินค่าสินค้าแล้ว
                      </ThemedText>
                      <ThemedText style={{ fontSize: 24, fontWeight: '800', color: '#0284C7' }}>
                        {formatBaht(order.amounts.itemPrice)}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        คืนผ่านช่องทางเดิม (พร้อมเพย์) · {order.paidAt ? formatDateTime(order.paidAt) : 'สำเร็จ'}
                      </ThemedText>
                      <ThemedText style={{ fontSize: 10.5, color: '#64748B' }}>
                        ไม่คืนค่าจัดส่ง ฿50 และค่าตรวจสอบ ฿100
                      </ThemedText>
                    </>
                  ) : (
                    <>
                      <ThemedText type="smallBold" style={{ fontSize: 15 }}>
                        สินค้าส่งคืนถึงคุณแล้ว
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        คำสั่งซื้อนี้ไม่มีการโอนเงิน · ตรวจผลตรวจแล้วแก้ไขประกาศก่อนลงขายอีกครั้ง
                      </ThemedText>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="ลงขายอีกครั้ง"
                        style={[styles.stickyShipBtn, { marginTop: 8 }]}
                        onPress={() =>
                          router.push({
                            pathname: '/product/new',
                            params: {
                              relistOrderId: String(order.id),
                              relistName: order.product.name,
                              relistReason: 'fail',
                            },
                          })
                        }>
                        <ThemedText style={styles.stickyShipBtnText}>ลงขายอีกครั้ง</ThemedText>
                      </Pressable>
                    </>
                  )}
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

              {/* Review Toast Feedback */}
              {reviewToast ? (
                <View style={{ padding: 12, borderRadius: 12, backgroundColor: '#059669', alignItems: 'center' }}>
                  <ThemedText style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>{reviewToast}</ThemedText>
                </View>
              ) : null}

              {/* Review Trigger Card for Completed Orders matching prototype */}
              {orderStatusStr === 'COMPLETED' && isBuyer && (
                isReviewed ? (
                  <View style={[styles.cardBox, { padding: 14, backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <ThemedText style={{ fontSize: 12, color: theme.textSecondary }}>
                      ⭐ คุณรีวิวคำสั่งซื้อนี้แล้ว · ขอบคุณสำหรับรีวิว
                    </ThemedText>
                  </View>
                ) : (
                  <View style={[styles.cardBox, { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <ThemedText style={{ fontSize: 24 }}>⭐</ThemedText>
                    <View style={{ flex: 1 }}>
                      <ThemedText type="smallBold" style={{ fontSize: 14, color: theme.text }}>
                        ให้คะแนนการซื้อครั้งนี้
                      </ThemedText>
                      <ThemedText style={{ fontSize: 11, color: theme.textSecondary, marginTop: 1 }}>
                        รีวิวสินค้า ผู้ขาย และบริการตรวจสอบ
                      </ThemedText>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="รีวิว"
                      onPress={() => setShowReviewModal(true)}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderRadius: 12,
                        backgroundColor: '#059669',
                      }}>
                      <ThemedText style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>
                        รีวิว
                      </ThemedText>
                    </Pressable>
                  </View>
                )
              )}

              {/* 2-Column Shortcuts Grid: Inspection & Certificate matching prototype */}
              {(['RESULT_NOTIFIED', 'SHIPPING_TO_BUYER', 'COMPLETED', 'RETURNING_TO_SELLER', 'REFUNDED', 'RETURNED'].includes(orderStatusStr) || order.status === 'RESULT_NOTIFIED') && (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="ดูผลการตรวจสินค้า"
                    onPress={() => router.push({ pathname: '/orders/[orderId]/inspection', params: { orderId: String(order.id) } })}
                    style={[styles.cardBox, { flex: 1, padding: 12, backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <ThemedText style={{ fontSize: 10.5, color: '#94A3B8' }}>ผลตรวจ</ThemedText>
                    <ThemedText style={{ fontSize: 13, fontWeight: '700', color: theme.text, marginTop: 2 }}>
                      {isInspectionFailed
                        ? (inspectionOutcome === 'FAKE' ? '🔴 สินค้าปลอม ›' : '🟠 ไม่ตรงตามประกาศ ›')
                        : '✅ ผ่าน ›'}
                    </ThemedText>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="ดูใบรับรองดิจิทัล"
                    disabled={!['SHIPPING_TO_BUYER', 'COMPLETED'].includes(orderStatusStr) || isInspectionFailed}
                    onPress={() => setShowCertSheet(true)}
                    style={[
                      styles.cardBox,
                      {
                        flex: 1,
                        padding: 12,
                        backgroundColor: theme.surface,
                        borderColor: theme.border,
                        opacity: (['SHIPPING_TO_BUYER', 'COMPLETED'].includes(orderStatusStr) && !isInspectionFailed) ? 1 : 0.6,
                      },
                    ]}>
                    <ThemedText style={{ fontSize: 10.5, color: '#94A3B8' }}>ใบรับรอง</ThemedText>
                    <ThemedText style={{ fontSize: 13, fontWeight: '700', color: theme.text, marginTop: 2 }}>
                      {isReturnFlow
                        ? 'ไม่ออกใบรับรอง'
                        : isInspectionFailed
                          ? 'ไม่ออก (ผลตรวจไม่ผ่าน)'
                          : ['SHIPPING_TO_BUYER', 'COMPLETED'].includes(orderStatusStr)
                            ? `📜 CERT-${order.id} ›`
                            : 'ออกเมื่อยอมรับผลตรวจ'}
                    </ThemedText>
                  </Pressable>
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
                    {orderStatusStr === 'REFUNDED' && (
                      <View style={[styles.breakdownRow, { marginTop: 6 }]}>
                        <ThemedText style={[styles.breakdownLabel, { color: '#0284C7', fontWeight: '700' }]}>คืนเงินแล้ว</ThemedText>
                        <ThemedText style={[styles.breakdownValue, { color: '#0284C7', fontWeight: '800' }]}>
                          -{formatBaht(order.amounts.itemPrice)}
                        </ThemedText>
                      </View>
                    )}
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
                          (isCancelled || isReturnFlow) && styles.breakdownCancelledValue,
                        ]}>
                        {isReturnFlow ? '฿0.00' : formatBaht(order.amounts.sellerPayout)}
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
            ) : isBuyer && (order.status === 'RESULT_NOTIFIED' || orderStatusStr === 'RESULT_NOTIFIED') ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isInspectionFailed ? "ดูผลตรวจและเลือก" : "ดูผลตรวจและยืนยัน"}
                onPress={() =>
                  router.push({
                    pathname: '/orders/[orderId]/inspection',
                    params: { orderId: String(order.id) },
                  })
                }
                style={styles.stickyShipBtn}>
                <ThemedText style={styles.stickyShipBtnText}>
                  {isInspectionFailed ? "ดูผลตรวจและเลือก" : "ดูผลตรวจและยืนยัน"}
                </ThemedText>
              </Pressable>
            ) : isBuyer && orderStatusStr === 'COMPLETED' && !isReviewed ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="รีวิวคำสั่งซื้อ"
                onPress={() => setShowReviewModal(true)}
                style={styles.stickyShipBtn}>
                <ThemedText style={styles.stickyShipBtnText}>ให้คะแนนและรีวิว</ThemedText>
              </Pressable>
            ) : !isBuyer && (orderStatusStr === 'REFUNDED' || orderStatusStr === 'RETURNED') ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="ลงขายอีกครั้ง"
                onPress={() =>
                  router.push({
                    pathname: '/product/new',
                    params: {
                      relistOrderId: String(order.id),
                      relistName: order.product.name,
                      relistReason: 'fail',
                    },
                  })
                }
                style={styles.stickyShipBtn}>
                <ThemedText style={styles.stickyShipBtnText}>ลงขายอีกครั้ง</ThemedText>
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

        {order ? (
          <>
            <ReviewModal
              visible={showReviewModal}
              onClose={() => setShowReviewModal(false)}
              orderId={order.id}
              productName={order.product?.name ?? ''}
              sellerName="มายด์ มือสอง"
              imageUrl={productImageUrl}
              onSubmit={async () => {
                setIsReviewed(true);
                setReviewToast('ขอบคุณสำหรับรีวิว ⭐');
                setTimeout(() => setReviewToast(null), 3000);
              }}
            />

            <CertificateSheet
              visible={showCertSheet}
              onClose={() => setShowCertSheet(false)}
              outcome="PASS"
              enabled={true}
              certificate={{
                number: `CERT-2026-0000${order.id}`,
                publicUrl: `https://2ndhand.app/verify/CERT-2026-0000${order.id}`,
                issuedAt: order.paidAt ?? new Date().toISOString(),
              }}
            />
          </>
        ) : null}
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
