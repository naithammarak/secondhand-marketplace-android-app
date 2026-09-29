import { MarketplaceLoginRequired } from '@/components/marketplace-login-required';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';

import { useAuth } from '@/auth/auth-provider';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, errorText, Loading, Screen, styles as orderUiStyles } from '@/components/order-ui';
import { EmptyState } from './wondee/primitives';
import { useTheme } from '@/hooks/use-theme';
import { useProductImage } from '@/hooks/use-product-image';
import { MarketplaceNav } from './marketplace-nav';
import { CONDITION_LABELS } from '@/services/product-service';
import { formatBaht, formatDateTime, orderStatusLabel } from '@/orders/order-format';
import { useOrdersList } from '@/orders/orders-provider';
import type { OrderListItem, OrderStatus } from '@/services/order-service';

type BuyerFilterTab = 'ALL' | 'WP' | 'CONF' | 'PROG' | 'DONE' | 'CXR';
type SellerFilterTab = 'ALL' | 'SHIP' | 'WP' | 'PROGS' | 'DONE' | 'CXR';
type StatusFilterTab = BuyerFilterTab | SellerFilterTab;

const ST_GROUPS: Record<string, string[]> = {
  ALL: [],
  WP: ['WAITING_PAYMENT'],
  SHIP: ['WAITING_SELLER_SHIP'],
  PROG: [
    'WAITING_SELLER_SHIP',
    'SHIPPING_TO_CENTER',
    'RECEIVED_AT_CENTER',
    'INSPECTING',
    'SHIPPING_TO_BUYER',
    'RETURNING_TO_SELLER',
  ],
  CONF: ['RESULT_NOTIFIED'],
  PROGS: [
    'WAITING_SELLER_SHIP',
    'SHIPPING_TO_CENTER',
    'RECEIVED_AT_CENTER',
    'INSPECTING',
    'RESULT_NOTIFIED',
    'SHIPPING_TO_BUYER',
    'RETURNING_TO_SELLER',
  ],
  DONE: ['COMPLETED'],
  CXR: ['CANCELLED', 'REFUNDED', 'RETURNED'],
};

const BUYER_TABS: Array<{ key: BuyerFilterTab; label: string }> = [
  { key: 'ALL', label: 'ทั้งหมด' },
  { key: 'WP', label: 'รอชำระ' },
  { key: 'CONF', label: 'รอยืนยันรับสินค้า' },
  { key: 'PROG', label: 'กำลังดำเนินการ' },
  { key: 'DONE', label: 'สำเร็จ' },
  { key: 'CXR', label: 'ยกเลิก/คืนเงิน' },
];

const SELLER_TABS: Array<{ key: SellerFilterTab; label: string }> = [
  { key: 'ALL', label: 'ทั้งหมด' },
  { key: 'SHIP', label: 'ต้องจัดส่ง' },
  { key: 'WP', label: 'รอผู้ซื้อชำระ' },
  { key: 'PROGS', label: 'กำลังดำเนินการ' },
  { key: 'DONE', label: 'สำเร็จ' },
  { key: 'CXR', label: 'ยกเลิก/คืน' },
];

function matchesFilter(item: OrderListItem, filterKey: StatusFilterTab): boolean {
  if (filterKey === 'ALL') return true;
  if (filterKey === 'WP') {
    return item.status === 'WAITING_PAYMENT';
  }
  const group = ST_GROUPS[filterKey];
  return group ? group.includes(item.status) : (item.status as string) === filterKey;
}

function formatTimeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return '15 นาทีที่แล้ว';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '15 นาทีที่แล้ว';
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'เมื่อสักครู่';
  if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} ชั่วโมงที่แล้ว`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays} วันที่แล้ว`;
  return date.toLocaleDateString('th-TH');
}

function OrderCardBadge({ status }: { status: OrderStatus | string }) {
  const isWaitingPayment = status === 'WAITING_PAYMENT';
  const isShipped = status === 'SHIPPED';
  const isWaitingSellerShip = status === 'WAITING_SELLER_SHIP';
  const isInspecting =
    status === 'INSPECTING' || status === 'SHIPPING_TO_CENTER' || status === 'RECEIVED_AT_CENTER';
  const isInspectedPass = status === 'RESULT_NOTIFIED';
  const isCancelled = status === 'CANCELLED';

  let badgeBg = '#F1F5F9';
  let badgeBorder = '#E2E8F0';
  let badgeText = '#64748B';
  let label = orderStatusLabel(status);

  if (isWaitingPayment) {
    badgeBg = '#FEF3C7';
    badgeBorder = '#FDE68A';
    badgeText = '#D97706';
    label = 'รอชำระเงิน';
  } else if (isShipped) {
    badgeBg = '#D1FAE5';
    badgeBorder = '#A7F3D0';
    badgeText = '#059669';
    label = 'จัดส่งแล้ว (EMS)';
  } else if (isInspectedPass) {
    badgeBg = '#D1FAE5';
    badgeBorder = '#A7F3D0';
    badgeText = '#059669';
    label = '🛡️ ตรวจรับรองแล้ว (PASS)';
  } else if (isWaitingSellerShip) {
    badgeBg = '#E0F2FE';
    badgeBorder = '#BAE6FD';
    badgeText = '#0284C7';
    label = 'ชำระแล้ว รอผู้ขายจัดส่ง';
  } else if (isInspecting) {
    badgeBg = '#EDE9FE';
    badgeBorder = '#DDD6FE';
    badgeText = '#7C3AED';
    label = 'กำลังตรวจสินค้า';
  } else if (isCancelled) {
    badgeBg = '#F1F5F9';
    badgeBorder = '#E2E8F0';
    badgeText = '#64748B';
    label = 'ยกเลิกแล้ว';
  }

  return (
    <View style={[styles.statusBadge, { backgroundColor: badgeBg, borderColor: badgeBorder }]}>
      <ThemedText style={[styles.statusBadgeText, { color: badgeText }]} accessibilityLiveRegion="polite">
        {label}
      </ThemedText>
    </View>
  );
}

function useOrderCountdown(expiresAt: string | null | undefined, createdAt: string | null | undefined) {
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
    if (createdAt) {
      const ms = new Date(createdAt).getTime();
      if (!Number.isNaN(ms)) return ms + 30 * 60 * 1000;
    }
    return null;
  }, [expiresAt, createdAt]);

  if (!deadline) {
    return { formatted: '24:13', isExpired: false };
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

function OrderRow({ item, onPress }: { item: OrderListItem; onPress(): void }) {
  const theme = useTheme();
  const countdown = useOrderCountdown(item.expiresAt, item.createdAt);
  const canPay =
    item.viewerRole === 'buyer' && item.status === 'WAITING_PAYMENT' && item.paymentStatus === 'UNPAID';
  const amount = item.viewerRole === 'buyer' ? item.totalAmount : item.sellerPayout;

  const rawImage =
    item.product.imageUrl ??
    (item.product as unknown as { imageUrl?: string; mainImageUrl?: string; image?: string })?.imageUrl ??
    (item.product as unknown as { mainImageUrl?: string })?.mainImageUrl ??
    (item.product as unknown as { image?: string })?.image;

  const itemImage = useProductImage(item.product.id, rawImage);

  const rawCondition = CONDITION_LABELS[item.product.condition] ?? item.product.condition ?? '';
  const conditionText = rawCondition ? (rawCondition.startsWith('สภาพ') ? rawCondition : `สภาพ${rawCondition}`) : '';

  let footerNote = 'คำสั่งซื้อล่าสุด';
  if (item.status === 'RESULT_NOTIFIED') {
    footerNote = `ออกใบรับรอง #CERT-${item.id} แล้ว 📜`;
  } else if ((item.status as string) === 'SHIPPED') {
    footerNote = 'ตรวจสินค้าผ่านแล้ว • TH01928374';
  } else if (item.status === 'WAITING_PAYMENT') {
    footerNote = item.createdAt ? `สั่งเมื่อ ${formatTimeAgo(item.createdAt)}` : 'สั่งเมื่อ 15 นาทีที่แล้ว';
  } else if (item.createdAt) {
    const formatted = formatDateTime(item.createdAt);
    footerNote = formatted ? `สั่งซื้อเมื่อ ${formatted}` : 'คำสั่งซื้อล่าสุด';
  }

  const isCancelled = item.status === 'CANCELLED';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.orderCard,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          opacity: pressed ? 0.95 : 1,
        },
      ]}>
      {/* Top Header of Card */}
      <View style={styles.cardHeaderRow}>
        <ThemedText style={styles.orderIdText}>#ORD - {item.id}</ThemedText>
        <OrderCardBadge status={item.status} />
      </View>

      {/* Divider */}
      <View style={[styles.cardDivider, { backgroundColor: theme.border ?? '#F1F5F9' }]} />

      {/* Product Content Row */}
      <View style={styles.productRow}>
        <View style={[styles.imageContainer, { backgroundColor: theme.backgroundElement ?? '#F1F5F9' }]}>
          {itemImage ? (
            <Image
              source={{ uri: itemImage }}
              style={styles.productImage}
              resizeMode="cover"
              accessibilityLabel={`รูปสินค้า ${item.product.name}`}
            />
          ) : (
            <ThemedText style={{ fontSize: 24 }}>
              {item.product.name.includes('กระเป๋า')
                ? '👜'
                : item.product.name.includes('เสื้อ') || item.product.name.includes('Jacket')
                  ? '🧥'
                  : item.product.name.includes('รองเท้า')
                    ? '👟'
                    : item.product.name.includes('หูฟัง')
                      ? '🎧'
                      : '📦'}
            </ThemedText>
          )}
        </View>

        <View style={styles.productInfo}>
          <ThemedText style={styles.productTitle} numberOfLines={1}>
            {item.product.name}
          </ThemedText>
          <View style={styles.productSubtitleRow}>
            {conditionText ? (
              <View
                style={[
                  styles.condPill,
                  {
                    backgroundColor:
                      item.product.condition === 'LIKE_NEW'
                        ? '#ECFDF5'
                        : item.product.condition === 'GOOD'
                          ? '#FEF3C7'
                          : '#F1F5F9',
                  },
                ]}>
                <ThemedText
                  style={[
                    styles.condPillText,
                    {
                      color:
                        item.product.condition === 'LIKE_NEW'
                          ? '#059669'
                          : item.product.condition === 'GOOD'
                            ? '#D97706'
                            : '#64748B',
                    },
                  ]}>
                  {conditionText}
                </ThemedText>
              </View>
            ) : null}
            <ThemedText style={styles.productSubtitleText}>
              ขนาด {item.product.size || '-'}
            </ThemedText>
          </View>
        </View>

        <View style={styles.productPriceCol}>
          <ThemedText style={styles.amountLabelText}>
            {item.viewerRole === 'seller' ? 'คุณจะได้รับ' : 'ยอดชำระ'}
          </ThemedText>
          <ThemedText
            style={[
              styles.productPrice,
              isCancelled && styles.productPriceCancelled,
            ]}>
            {formatBaht(amount)}
          </ThemedText>
        </View>
      </View>

      {/* Info Line */}
      <View style={styles.infoLineContainer}>
        {item.status === 'WAITING_PAYMENT' ? (
          <ThemedText style={styles.waitingPaymentDeadline}>
            {countdown.isExpired
              ? '⏱ หมดเวลาชำระเงิน'
              : `⏱ ${item.viewerRole === 'seller' ? 'ผู้ซื้อต้องชำระภายใน ' : 'เหลือเวลาชำระ '}${countdown.formatted}`}
          </ThemedText>
        ) : isCancelled ? (
          <ThemedText style={styles.infoMutedText}>
            {item.viewerRole === 'seller'
              ? 'ผู้ซื้อยกเลิกคำสั่งซื้อนี้'
              : 'หมดเวลาชำระเงิน ระบบยกเลิกให้อัตโนมัติ'}
          </ThemedText>
        ) : (
          <ThemedText style={styles.infoMutedText}>{footerNote}</ThemedText>
        )}
      </View>

      {/* Action Button: Full width */}
      {canPay ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="ชำระเงิน"
          onPress={onPress}
          style={({ pressed }) => [styles.fullPayButton, { opacity: pressed ? 0.85 : 1 }]}>
          <ThemedText style={styles.fullPayButtonText}>ชำระเงิน</ThemedText>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="ดูรายละเอียด"
          onPress={onPress}
          style={({ pressed }) => [
            styles.fullDetailButton,
            {
              backgroundColor: theme.backgroundElement ?? '#F8FAFC',
              borderColor: theme.border ?? '#E2E8F0',
              opacity: pressed ? 0.8 : 1,
            },
          ]}>
          <ThemedText style={[styles.fullDetailButtonText, { color: theme.text }]}>
            {item.viewerRole === 'seller' && item.status === 'WAITING_SELLER_SHIP'
              ? 'จัดส่งสินค้า'
              : (item.status as string) === 'SHIPPED'
                ? 'ดูสถานะจัดส่ง'
                : 'ดูรายละเอียด'}
          </ThemedText>
        </Pressable>
      )}
    </Pressable>
  );
}

export function OrdersListScreen() {
  const theme = useTheme();
  const auth = useAuth();
  const router = useRouter();
  const { state, store } = useOrdersList();
  const { view } = useLocalSearchParams<{ view?: string }>();
  const [statusFilter, setStatusFilter] = useState<StatusFilterTab>('ALL');

  const customer =
    auth.account?.source === 'backend' &&
    (auth.account.role === 'BUYER' || auth.account.role === 'SELLER') &&
    !auth.accountError;

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

  useEffect(() => {
    if (!customer) return;
    void store.setView(view === 'seller' && auth.account?.role === 'SELLER' ? 'seller' : 'buyer');
  }, [customer, view, auth.account?.role, store]);

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

  return (
    <Screen>
      <SafeAreaView style={[orderUiStyles.content, { flex: 1, alignSelf: 'center', gap: 0 }]}>
        {/* Top Header */}
        <View style={[styles.topHeader, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <ThemedText style={styles.headerTitle}>
            {state.view === 'seller' ? 'ที่ฉันซื้อ' : 'คำสั่งซื้อ'}
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="ปิด"
            hitSlop={8}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            style={({ pressed }) => [
              styles.closeButton,
              { backgroundColor: theme.backgroundElement ?? '#F1F5F9', opacity: pressed ? 0.7 : 1 },
            ]}>
            <ThemedText style={{ fontSize: 13, fontWeight: '700', color: theme.text }}>✕</ThemedText>
          </Pressable>
        </View>

        {/* Segmented Role Tabs */}
        <View style={styles.headerControls}>
          <View
            style={[styles.roleTabContainer, { backgroundColor: theme.backgroundElement ?? '#F1F5F9' }]}>
            <Pressable
              accessibilityRole="tab"
              accessibilityLabel="คำสั่งซื้อที่ฉันซื้อ"
              accessibilityState={{ selected: state.view === 'buyer' }}
              onPress={() => {
                setStatusFilter('ALL');
                void store.setView('buyer');
              }}
              style={[styles.roleTab, state.view === 'buyer' && styles.roleTabActive]}>
              <ThemedText
                style={[
                  styles.roleTabText,
                  state.view === 'buyer' ? styles.roleTabTextActive : { color: theme.textSecondary },
                ]}>
                คำสั่งซื้อที่ฉันซื้อ
              </ThemedText>
            </Pressable>
            <Pressable
              accessibilityRole="tab"
              accessibilityLabel="คำสั่งซื้อร้านของฉัน"
              accessibilityState={{ selected: state.view === 'seller' }}
              onPress={() => {
                setStatusFilter('ALL');
                void store.setView('seller');
              }}
              style={[styles.roleTab, state.view === 'seller' && styles.roleTabActive]}>
              <ThemedText
                style={[
                  styles.roleTabText,
                  state.view === 'seller' ? styles.roleTabTextActive : { color: theme.textSecondary },
                ]}>
                คำสั่งซื้อร้านของฉัน
              </ThemedText>
            </Pressable>
          </View>

          {/* Status Filter Chips */}
          <View style={styles.filterPillsWrapper}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterPillsContent}>
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
                    style={[
                      styles.filterPill,
                      active
                        ? styles.filterPillActive
                        : [
                            styles.filterPillInactive,
                            { backgroundColor: theme.backgroundElement ?? '#F1F5F9' },
                          ],
                    ]}>
                    <ThemedText
                      style={[
                        styles.filterPillText,
                        active ? styles.filterPillTextActive : { color: theme.textSecondary },
                      ]}>
                      {tab.label} ({count})
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>

        {!customer && (
          <Card>
            <ThemedText>กำลังตรวจสอบสิทธิ์บัญชี หรือบัญชีนี้ไม่สามารถซื้อขายได้</ThemedText>
          </Card>
        )}

        <FlatList
          testID="orders-flatlist"
          style={{ flex: 1 }}
          data={customer && state.owner === auth.session.user.id ? displayedItems : []}
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
                <Card>
                  <ThemedText accessibilityLiveRegion="polite">{errorText(state.error)}</ThemedText>
                  <Button
                    label="ลองใหม่อีกครั้ง"
                    onPress={() => {
                      void store.refresh();
                    }}
                  />
                </Card>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            state.loading ? (
              <Loading label="กำลังโหลดคำสั่งซื้อ" />
            ) : state.loaded && !state.error ? (
              <View style={styles.emptyContainer}>
                <View style={[styles.emptyIconBox, { backgroundColor: theme.backgroundElement ?? '#F1F5F9' }]}>
                  <ThemedText style={{ fontSize: 32 }}>🧾</ThemedText>
                </View>
                <ThemedText style={styles.emptyTitle}>ยังไม่มีคำสั่งซื้อ</ThemedText>
                <ThemedText style={styles.emptySubtitle}>
                  เลือกซื้อของมือสองคัดเกรดได้ที่หน้าแรก
                </ThemedText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="เลือกซื้อสินค้า"
                  onPress={() => router.replace('/products')}
                  style={({ pressed }) => [styles.emptyActionButton, { opacity: pressed ? 0.8 : 1 }]}>
                  <ThemedText style={styles.emptyActionButtonText}>เลือกซื้อสินค้า</ThemedText>
                </Pressable>
              </View>
            ) : null
          }
          ListFooterComponent={
            state.loadingMore ? (
              <Loading label="กำลังโหลดเพิ่ม" />
            ) : store.hasMore() ? (
              <Button
                label="โหลดเพิ่ม"
                onPress={() => {
                  void store.loadMore();
                }}
              />
            ) : displayedItems.length > 0 ? (
              <View style={styles.listFooter}>
                <ThemedText style={styles.listFooterText}>ดูครบทุกรายการแล้ว</ThemedText>
              </View>
            ) : null
          }
        />

        <View style={{ backgroundColor: theme.surface }}>
          <MarketplaceNav selected="orders" />
        </View>
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerControls: {
    paddingTop: 10,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  roleTabContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 3,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  roleTab: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleTabActive: {
    backgroundColor: '#059669',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  roleTabText: {
    fontSize: 12,
    fontWeight: '600',
  },
  roleTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  filterPillsWrapper: {
    paddingVertical: 2,
  },
  filterPillsContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 13,
    paddingVertical: 5,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterPillActive: {
    backgroundColor: '#059669',
  },
  filterPillInactive: {
    backgroundColor: '#F1F5F9',
  },
  filterPillText: {
    fontSize: 11,
    fontWeight: '500',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  orderCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  orderIdText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  cardDivider: {
    height: 1,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  imageContainer: {
    width: 56,
    height: 56,
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  productImage: {
    width: 56,
    height: 56,
  },
  productInfo: {
    flex: 1,
    gap: 4,
  },
  productTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  productSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  condPill: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  condPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  productSubtitleText: {
    fontSize: 11,
    color: '#64748B',
  },
  productPriceCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  amountLabelText: {
    fontSize: 10,
    color: '#94A3B8',
  },
  productPrice: {
    fontSize: 14,
    fontWeight: '800',
    color: '#059669',
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  productPriceCancelled: {
    color: '#94A3B8',
    textDecorationLine: 'line-through',
  },
  infoLineContainer: {
    paddingTop: 2,
  },
  waitingPaymentDeadline: {
    fontSize: 11,
    color: '#D97706',
    fontWeight: '600',
  },
  infoMutedText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  fullPayButton: {
    backgroundColor: '#059669',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullPayButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  fullDetailButton: {
    borderWidth: 1,
    paddingVertical: 9,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullDetailButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyIconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748B',
  },
  emptyActionButton: {
    backgroundColor: '#059669',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 10,
  },
  emptyActionButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  listFooter: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  listFooterText: {
    fontSize: 11,
    color: '#94A3B8',
  },
});

