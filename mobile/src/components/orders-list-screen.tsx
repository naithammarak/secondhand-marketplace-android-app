import { MarketplaceLoginRequired } from '@/components/marketplace-login-required';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';

import { useAuth } from '@/auth/auth-provider';
import { ThemedText } from '@/components/themed-text';
import { errorText, Loading, Screen } from '@/components/order-ui';
import { ProductImage, cardConditionLabels, conditionBadgeTheme } from '@/components/product-catalog-ui';
import { EmptyState, ErrorState, Skeleton } from './wondee/primitives';
import { useTheme } from '@/hooks/use-theme';
import { useThemePreference } from '@/theme/theme-provider';
import { useProductImage } from '@/hooks/use-product-image';
import { MarketplaceNav } from './marketplace-nav';
import { OrderStatusPill } from './order-status-pill';
import { CONDITION_LABELS } from '@/services/product-service';
import { cancelReasonLabels, formatBaht, formatDateTime } from '@/orders/order-format';
import { useOrdersList } from '@/orders/orders-provider';
import type { OrderListItem, OrderStatus } from '@/services/order-service';
import type { ProductCondition } from '@/services/product-catalog-service';

type BuyerFilterTab = 'ALL' | 'WP' | 'CONF' | 'PROG' | 'DONE' | 'CXR';
type SellerFilterTab = 'ALL' | 'SHIP' | 'WP' | 'PROGS' | 'DONE' | 'CXR';
type StatusFilterTab = BuyerFilterTab | SellerFilterTab;

/** ทุกสถานะที่รู้จักต้องอยู่ในกลุ่มใดกลุ่มหนึ่ง ไม่งั้นคำสั่งซื้อจะเห็นแค่ใน "ทั้งหมด" */
const ST_GROUPS: Record<Exclude<StatusFilterTab, 'ALL'>, readonly OrderStatus[]> = {
  WP: ['WAITING_PAYMENT'],
  SHIP: ['WAITING_SELLER_SHIP'],
  // ผลตรวจที่ต้องเปิดดู และสินค้าที่ขนส่งแจ้งส่งถึงแล้วรอผู้ซื้อยืนยันรับ/แจ้งไม่ได้รับ
  CONF: ['RESULT_NOTIFIED', 'DELIVERED_PENDING_BUYER'],
  // รับคืนแล้วแต่ยังไม่คืนเงิน = ยังดำเนินการอยู่ ไม่จัดเป็นคืนเงินแล้ว
  PROG: [
    'WAITING_SELLER_SHIP',
    'SHIPPING_TO_CENTER',
    'RECEIVED_AT_CENTER',
    'INSPECTING',
    'SHIPPING_TO_BUYER',
    'DELIVERY_DISPUTED',
    'RETURNING_TO_SELLER',
    'RETURNED_TO_SELLER',
  ],
  PROGS: [
    'WAITING_SELLER_SHIP',
    'SHIPPING_TO_CENTER',
    'RECEIVED_AT_CENTER',
    'INSPECTING',
    'RESULT_NOTIFIED',
    'SHIPPING_TO_BUYER',
    'DELIVERED_PENDING_BUYER',
    'DELIVERY_DISPUTED',
    'RETURNING_TO_SELLER',
    'RETURNED_TO_SELLER',
  ],
  DONE: ['COMPLETED'],
  CXR: ['CANCELLED', 'REFUNDED', 'RETURNED'],
};

const BUYER_TABS: { key: BuyerFilterTab; label: string }[] = [
  { key: 'ALL', label: 'ทั้งหมด' },
  { key: 'WP', label: 'รอชำระ' },
  { key: 'CONF', label: 'รอคุณตรวจสอบ' },
  { key: 'PROG', label: 'กำลังดำเนินการ' },
  { key: 'DONE', label: 'สำเร็จ' },
  { key: 'CXR', label: 'ยกเลิก/คืนเงิน' },
];

const SELLER_TABS: { key: SellerFilterTab; label: string }[] = [
  { key: 'ALL', label: 'ทั้งหมด' },
  { key: 'SHIP', label: 'ต้องจัดส่ง' },
  { key: 'WP', label: 'รอผู้ซื้อชำระ' },
  { key: 'PROGS', label: 'กำลังดำเนินการ' },
  { key: 'DONE', label: 'สำเร็จ' },
  { key: 'CXR', label: 'ยกเลิก/คืน' },
];

export function matchesFilter(item: OrderListItem, filterKey: StatusFilterTab): boolean {
  if (filterKey === 'ALL') return true;
  return ST_GROUPS[filterKey].includes(item.status);
}

function ClockIcon({ color }: { color: string }) {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} />
      <Path d="M12 7v5l3 2" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function useOrderCountdown(expiresAt: string | null | undefined) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const deadline = useMemo(() => {
    if (expiresAt) {
      const ms = new Date(expiresAt).getTime();
      if (!Number.isNaN(ms)) return ms;
    }
    return null;
  }, [expiresAt]);

  if (!deadline) {
    return { formatted: null, isExpired: false };
  }

  const diffMs = deadline - now;
  if (diffMs <= 0) {
    return { formatted: '0:00', isExpired: true };
  }

  const totalSecs = Math.ceil(diffMs / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  const secStr = String(secs).padStart(2, '0');

  const formatted = hours > 0 ? `${hours}:${String(mins).padStart(2, '0')}:${secStr}` : `${mins}:${secStr}`;
  return { formatted, isExpired: false };
}

type CardAction = { label: string; primary: boolean };

/** ปุ่มบนการ์ดเฉพาะสถานะที่ผู้ใช้ต้องทำต่อ ที่เหลือแตะการ์ดเพื่อดูรายละเอียด (ตาม design) */
function cardAction(item: OrderListItem): CardAction | null {
  const buyer = item.viewerRole === 'buyer';
  if (buyer && item.status === 'WAITING_PAYMENT' && item.paymentStatus === 'UNPAID') return { label: 'ชำระเงิน', primary: true };
  if (!buyer && item.status === 'WAITING_SELLER_SHIP') return { label: 'จัดส่งสินค้า', primary: true };
  if (buyer && item.status === 'RESULT_NOTIFIED') return { label: 'ดูผลตรวจ', primary: true };
  if (buyer && item.status === 'DELIVERED_PENDING_BUYER') return { label: 'ดูสถานะจัดส่ง', primary: true };
  if (buyer && item.status === 'COMPLETED') return { label: 'ดูรายละเอียดและรีวิวผู้ขาย', primary: false };
  return null;
}

function OrderRow({ item, onPress }: { item: OrderListItem; onPress(): void }) {
  const theme = useTheme();
  const { scheme } = useThemePreference();
  const isDark = scheme === 'dark';
  const muted = isDark ? '#64748b' : '#94a3b8';
  const countdown = useOrderCountdown(item.expiresAt);
  const amount = item.viewerRole === 'buyer' ? item.totalAmount : item.sellerPayout;
  const itemImage = useProductImage(item.product.id, item.product.imageUrl ?? null);

  const conditionKey = item.product.condition as ProductCondition;
  const badge = CONDITION_LABELS[item.product.condition] ? conditionBadgeTheme[conditionKey] : null;
  const size = item.product.size?.trim();

  const buyer = item.viewerRole === 'buyer';
  const footerByStatus: Record<string, string> = {
    WAITING_SELLER_SHIP: buyer ? 'รอผู้ขายส่งเข้าศูนย์ตรวจ' : 'บันทึกที่อยู่รับคืนแล้วแจ้งส่งเข้าศูนย์',
    RESULT_NOTIFIED: buyer ? 'แจ้งผลตรวจแล้ว เปิดเพื่อดูผลและขั้นตอนถัดไป' : 'แจ้งผลตรวจแล้ว เปิดเพื่อดูขั้นตอนถัดไป',
    SHIPPING_TO_BUYER: buyer ? 'ศูนย์ส่งสินค้าแล้ว ยืนยันรับเมื่อได้รับจริง' : 'ศูนย์ส่งถึงผู้ซื้อแล้ว',
    DELIVERED_PENDING_BUYER: buyer ? 'สถานะขนส่งแจ้งส่งถึงแล้ว โปรดยืนยันรับหรือแจ้งไม่ได้รับ' : 'รอผู้ซื้อยืนยันรับ',
    DELIVERY_DISPUTED: 'ผู้ดูแลกำลังตรวจสอบกรณีไม่ได้รับสินค้า',
    RETURNED_TO_SELLER: buyer ? 'ผู้ขายรับคืนแล้ว กำลังดำเนินการคืนเงิน' : 'รับคืนแล้ว กำลังดำเนินการคืนเงินให้ผู้ซื้อ',
    REFUNDED: buyer ? 'คืนเงินจำลองแล้ว เปิดเพื่อดูยอดและเลขอ้างอิง' : 'คืนเงินให้ผู้ซื้อแล้ว ไม่มีการจ่ายเงินให้ผู้ขาย',
    COMPLETED: buyer ? 'สำเร็จ' : 'ขายสำเร็จ เปิดเพื่อดูยอดที่บันทึก',
  };
  const createdText = formatDateTime(item.createdAt);
  const footerNote = footerByStatus[item.status] ?? (createdText ? `สั่งซื้อเมื่อ ${createdText}` : 'เปิดเพื่อดูรายละเอียด');
  const isCancelled = item.status === 'CANCELLED';
  const action = cardAction(item);

  // ตัวการ์ดกับปุ่มเป็นพี่น้องกัน (ไม่ซ้อนปุ่มในปุ่ม) ให้ screen reader เข้าถึงปุ่มได้
  return (
    <View
      style={[
        styles.orderCard,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          shadowOpacity: isDark ? 0.25 : 0.04,
          opacity: isCancelled ? 0.72 : 1,
        },
      ]}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`คำสั่งซื้อ #${item.id} ${item.product.name}`}
      onPress={onPress}
      style={({ pressed }) => [styles.cardBody, { opacity: pressed ? 0.85 : 1 }]}>
      <View style={styles.cardHeaderRow}>
        <ThemedText style={[styles.orderIdText, { color: muted }]}>#{item.id}</ThemedText>
        <OrderStatusPill status={item.status} />
      </View>

      <View style={styles.productRow}>
        <View style={styles.imageBox}>
          <ProductImage
            uri={itemImage}
            width={48}
            height={48}
            borderRadius={12}
            accessibilityLabel={`รูปสินค้า ${item.product.name}`}
          />
        </View>
        <View style={styles.productInfo}>
          <ThemedText style={[styles.productTitle, { color: theme.text }]} numberOfLines={1}>
            {item.product.name}
          </ThemedText>
          <View style={styles.productSubtitleRow}>
            {badge ? (
              <View
                accessibilityLabel={CONDITION_LABELS[item.product.condition]}
                style={[styles.condBadge, { backgroundColor: badge.bg }]}>
                <ThemedText style={[styles.condBadgeText, { color: badge.text }]}>
                  {cardConditionLabels[conditionKey]}
                </ThemedText>
              </View>
            ) : null}
            {size ? <ThemedText style={[styles.sizeText, { color: muted }]}>ขนาด {size}</ThemedText> : null}
          </View>
        </View>
        <View style={styles.priceCol}>
          <ThemedText style={[styles.amountLabel, { color: muted }]}>
            {item.viewerRole === 'seller' ? (item.status === 'COMPLETED' ? 'ยอดที่บันทึก' : 'ประมาณการรับ') : 'ยอดชำระ'}
          </ThemedText>
          <ThemedText
            style={[
              styles.amountValue,
              isCancelled ? { color: muted, textDecorationLine: 'line-through' } : null,
            ]}>
            {formatBaht(amount)}
          </ThemedText>
        </View>
      </View>

      {item.status === 'WAITING_PAYMENT' ? (
        <View style={styles.infoRow}>
          <ClockIcon color={isDark ? '#fbbf24' : '#d97706'} />
          <ThemedText style={[styles.infoWarning, { color: isDark ? '#fbbf24' : '#d97706' }]}>
            {countdown.isExpired
              ? 'หมดเวลาชำระเงิน กำลังตรวจสถานะล่าสุด'
              : countdown.formatted
                ? `${item.viewerRole === 'seller' ? 'ผู้ซื้อต้องชำระภายใน ' : 'เหลือเวลาชำระ '}${countdown.formatted}`
                : 'เปิดเพื่อดูเวลาชำระจากระบบ'}
          </ThemedText>
        </View>
      ) : (
        <ThemedText style={[styles.infoText, { color: muted }]}>
          {isCancelled
            ? item.cancelReason ? cancelReasonLabels[item.cancelReason] : 'คำสั่งซื้อนี้ถูกยกเลิก'
            : footerNote}
        </ThemedText>
      )}
    </Pressable>

      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={onPress}
          style={({ pressed }) => [
            styles.actionButton,
            action.primary
              ? { backgroundColor: pressed ? '#10b981' : '#059669' }
              : { backgroundColor: theme.backgroundElement },
          ]}>
          <ThemedText style={[styles.actionText, { color: action.primary ? '#ffffff' : theme.text }]}>
            {action.label}
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

function OrderCardSkeleton() {
  const theme = useTheme();
  return (
    <View style={[styles.orderCard, { backgroundColor: theme.surface, borderColor: theme.border, gap: 10 }]}>
      <View style={{ width: 80 }}><Skeleton height={12} label="กำลังโหลดคำสั่งซื้อ" /></View>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <View style={{ width: 48 }}><Skeleton height={48} /></View>
        <View style={{ flex: 1, gap: 6 }}>
          <Skeleton height={14} />
          <View style={{ width: 96 }}><Skeleton height={12} /></View>
        </View>
      </View>
      <Skeleton height={12} />
    </View>
  );
}

export function OrdersListScreen() {
  const theme = useTheme();
  const { scheme } = useThemePreference();
  const isDark = scheme === 'dark';
  const auth = useAuth();
  const router = useRouter();
  const { state, store } = useOrdersList();
  const { view } = useLocalSearchParams<{ view?: string }>();
  // ตัวกรองผูกกับมุมมอง: สลับซื้อ/ร้านแล้วกลับเป็น "ทั้งหมด"
  const [filterChoice, setFilterChoice] = useState<{ view: string; key: StatusFilterTab }>({ view: 'buyer', key: 'ALL' });
  const statusFilter: StatusFilterTab = filterChoice.view === state.view ? filterChoice.key : 'ALL';
  const setStatusFilter = (key: StatusFilterTab) => setFilterChoice({ view: state.view, key });

  const customer =
    auth.account?.source === 'backend' &&
    (auth.account.role === 'BUYER' || auth.account.role === 'SELLER') &&
    !auth.accountError;
  const isSeller = auth.account?.role === 'SELLER';

  const [isManualRefresh, setIsManualRefresh] = useState(false);

  useEffect(() => {
    if (!state.refreshing) {
      setIsManualRefresh(false);
    }
  }, [state.refreshing]);

  const handleManualRefresh = () => {
    setIsManualRefresh(true);
    void store.refresh();
  };

  const pullToRefresh = usePullToRefresh({
    refreshing: state.refreshing,
    onRefresh: handleManualRefresh,
  });

  // มุมมองมาจากแท็บล่าง (/orders?view=buyer|seller) เท่านั้น ผู้ซื้อทั่วไปไม่มีออเดอร์ร้าน
  useEffect(() => {
    if (!customer) return;
    void store.setView(view === 'seller' && isSeller ? 'seller' : 'buyer');
  }, [customer, view, isSeller, store]);

  useEffect(() => {
    if (state.owner && customer && !state.loaded) void store.load();
  }, [customer, state.loaded, state.owner, store]);

  const activeTabs = state.view === 'seller' ? SELLER_TABS : BUYER_TABS;

  const countForTab = useMemo(() => {
    return (tabKey: StatusFilterTab) => state.items.filter(item => matchesFilter(item, tabKey)).length;
  }, [state.items]);

  const displayedItems = useMemo(() => {
    return state.items.filter(item => matchesFilter(item, statusFilter));
  }, [state.items, statusFilter]);

  if (auth.initializing) {
    return (
      <Screen>
        <Loading label="กำลังตรวจสอบบัญชี" />
      </Screen>
    );
  }
  if (!auth.session) return <MarketplaceLoginRequired destination={{ kind: 'orders' }} />;

  const title = state.view === 'seller' ? 'ออเดอร์ร้าน' : isSeller ? 'ที่ฉันซื้อ' : 'คำสั่งซื้อ';
  const filterLabel = activeTabs.find(tab => tab.key === statusFilter)?.label ?? '';

  return (
    <Screen>
      <SafeAreaView style={[styles.page, { backgroundColor: theme.background }]}>
        <View
          style={[
            styles.header,
            { backgroundColor: isDark ? '#121622' : '#ffffff', borderBottomColor: theme.border },
          ]}>
          <ThemedText accessibilityRole="header" style={[styles.headerTitle, { color: theme.text }]}>
            {title}
          </ThemedText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {activeTabs.map(tab => {
              const active = statusFilter === tab.key;
              const count = countForTab(tab.key);
              return (
                <Pressable
                  key={tab.key}
                  accessibilityRole="tab"
                  accessibilityLabel={`${tab.label} (${count})`}
                  accessibilityState={{ selected: active }}
                  onPress={() => setStatusFilter(tab.key)}
                  style={[styles.chip, { backgroundColor: active ? '#059669' : theme.backgroundElement }]}>
                  <ThemedText
                    style={[
                      styles.chipText,
                      { color: active ? '#ffffff' : theme.textSecondary, fontWeight: active ? '700' : '500' },
                    ]}>
                    {tab.label} ({count})
                  </ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {!customer && (
          <View style={{ paddingTop: 24 }}>
            <EmptyState
              icon="alert"
              title="ยังแสดงคำสั่งซื้อไม่ได้"
              detail="กำลังตรวจสอบสิทธิ์บัญชี หรือบัญชีนี้ไม่สามารถซื้อขายได้"
            />
          </View>
        )}

        <FlatList
          testID="orders-flatlist"
          style={{ flex: 1 }}
          data={customer && state.owner === auth.session.user.id ? displayedItems : []}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={styles.listContent}
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
          }
          onEndReachedThreshold={0.3}
          onEndReached={() => {
            void store.loadMore();
          }}
          renderItem={({ item }) => (
            <OrderRow
              item={item}
              onPress={() =>
                router.push({ pathname: '/orders/[orderId]', params: { orderId: String(item.id) } })
              }
            />
          )}
          ListHeaderComponent={
            <View>
              {Platform.OS === 'web' && isManualRefresh && state.refreshing ? (
                <View style={{ paddingVertical: 8, alignItems: 'center' }}>
                  <Loading label="กำลังรีเฟรชคำสั่งซื้อ..." />
                </View>
              ) : null}
              {state.error ? (
                <ErrorState
                  icon={state.error === 'network-error' ? 'offline' : 'alert'}
                  title="โหลดคำสั่งซื้อไม่สำเร็จ"
                  detail={errorText(state.error)}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="ลองใหม่อีกครั้ง"
                    onPress={() => {
                      void store.refresh();
                    }}
                    style={styles.stateButton}>
                    <ThemedText style={styles.stateButtonText}>ลองใหม่อีกครั้ง</ThemedText>
                  </Pressable>
                </ErrorState>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            state.loading ? (
              <View style={{ gap: 12 }}>
                <OrderCardSkeleton />
                <OrderCardSkeleton />
                <OrderCardSkeleton />
              </View>
            ) : state.loaded && !state.error && customer ? (
              state.items.length > 0 ? (
                <EmptyState icon="receipt" title={`ไม่มีคำสั่งซื้อในหมวด "${filterLabel}"`} detail="ลองเลือกหมวดอื่นด้านบน" />
              ) : state.view === 'seller' ? (
                <EmptyState icon="receipt" title="ยังไม่มีออเดอร์" detail="เมื่อมีคนสั่งซื้อสินค้าของร้าน จะแสดงที่นี่" />
              ) : (
                <EmptyState icon="receipt" title="ยังไม่มีคำสั่งซื้อ" detail="เลือกซื้อของมือสองคัดเกรดได้ที่หน้าแรก">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="เลือกซื้อสินค้า"
                    onPress={() => router.replace('/')}
                    style={styles.stateButton}>
                    <ThemedText style={styles.stateButtonText}>เลือกซื้อสินค้า</ThemedText>
                  </Pressable>
                </EmptyState>
              )
            ) : null
          }
          ListFooterComponent={
            state.loadingMore ? (
              <Loading label="กำลังโหลดเพิ่ม" />
            ) : store.hasMore() ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="โหลดเพิ่ม"
                onPress={() => {
                  void store.loadMore();
                }}
                style={[styles.loadMore, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText style={[styles.loadMoreText, { color: theme.text }]}>โหลดเพิ่ม</ThemedText>
              </Pressable>
            ) : displayedItems.length > 0 ? (
              <ThemedText style={[styles.listFooterText, { color: isDark ? '#64748b' : '#94a3b8' }]}>
                ดูครบทุกรายการแล้ว
              </ThemedText>
            ) : null
          }
        />

        <MarketplaceNav selected={state.view === 'seller' ? 'shop-orders' : 'orders'} />
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, width: '100%', alignSelf: 'center' },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, gap: 12, borderBottomWidth: 1 },
  headerTitle: { fontSize: 16, lineHeight: 24, fontWeight: '700' },
  chips: { gap: 8 },
  chip: { borderRadius: 999, paddingHorizontal: 14, height: 30, justifyContent: 'center' },
  chipText: { fontSize: 12, lineHeight: 16 },
  listContent: { gap: 12, padding: 16, flexGrow: 1, width: '100%', maxWidth: 800, alignSelf: 'center' },
  stateButton: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, backgroundColor: '#059669' },
  stateButtonText: { fontSize: 12, fontWeight: '700', color: '#ffffff' },

  orderCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 10,
    shadowColor: '#000000',
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardBody: { gap: 10 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  orderIdText: { fontFamily: 'monospace', fontSize: 11, lineHeight: 16 },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  imageBox: { width: 48, height: 48, borderRadius: 12, overflow: 'hidden' },
  productInfo: { flex: 1, minWidth: 0 },
  productTitle: { fontSize: 12, lineHeight: 17, fontWeight: '600' },
  productSubtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  condBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  condBadgeText: { fontSize: 10, lineHeight: 14, fontWeight: '800' },
  sizeText: { fontSize: 10, lineHeight: 14 },
  priceCol: { alignItems: 'flex-end', flexShrink: 0 },
  amountLabel: { fontSize: 10, lineHeight: 14 },
  amountValue: { fontSize: 14, lineHeight: 20, fontWeight: '800', color: '#10b981' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  infoWarning: { fontSize: 11, lineHeight: 16, fontWeight: '600' },
  infoText: { fontSize: 11, lineHeight: 16 },
  actionButton: { borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  actionText: { fontSize: 12, lineHeight: 17, fontWeight: '700' },
  loadMore: { borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  loadMoreText: { fontSize: 12, fontWeight: '600' },
  listFooterText: { fontSize: 11, lineHeight: 16, textAlign: 'center', paddingVertical: 8 },
});
