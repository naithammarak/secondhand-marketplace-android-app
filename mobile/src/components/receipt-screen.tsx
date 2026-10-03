import { Redirect, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { useAuth } from '@/auth/auth-provider';
import { ThemedText } from '@/components/themed-text';
import { errorText, Loading, Screen } from '@/components/order-ui';
import { EmptyState, ErrorState, Skeleton } from '@/components/wondee/primitives';
import { Fonts } from '@/constants/theme';
import { useMotionAllowed } from '@/components/wondee/motion';
import { BrandIcon } from '@/components/wondee/brand-logo';
import { useTheme } from '@/hooks/use-theme';
import { useThemePreference } from '@/theme/theme-provider';
import { formatBaht, formatDateTime } from '@/orders/order-format';
import { useOrderDetail } from '@/orders/orders-provider';

/** วงกลมเครื่องหมายถูกแบบ design (.success-check) เด้งเข้าเมื่อเปิดใบเสร็จ */
function SuccessCheck() {
  const motionAllowed = useMotionAllowed();
  const progress = useSharedValue(motionAllowed ? 0 : 1);
  useEffect(() => {
    progress.value = motionAllowed ? withTiming(1, { duration: 450, easing: Easing.bezier(0.2, 1.4, 0.4, 1) }) : 1;
  }, [motionAllowed, progress]);
  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.6 + 0.4 * progress.value }],
  }));
  return (
    <Animated.View style={[localStyles.successCheck, style]}>
      <Svg width={84} height={84} viewBox="0 0 52 52" fill="none">
        <Circle cx={26} cy={26} r={24} stroke="#10b981" strokeWidth={3} />
        <Path d="M15 27l7 7 15-15" stroke="#10b981" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </Animated.View>
  );
}

function ReceiptRow({ label, value, strong, mono }: { label: string; value: string; strong?: boolean; mono?: boolean }) {
  const theme = useTheme();
  return (
    <View style={localStyles.row}>
      <ThemedText style={[localStyles.rowLabel, { color: theme.textSecondary }]}>{label}</ThemedText>
      <ThemedText
        style={[
          localStyles.rowValue,
          { color: theme.text },
          strong && { fontWeight: '700' },
          mono && { fontFamily: Fonts.mono },
        ]}>
        {value}
      </ThemedText>
    </View>
  );
}

export function ReceiptScreen({ orderId }: { orderId: number | null }) {
  const auth = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const { scheme } = useThemePreference();
  const isDark = scheme === 'dark';
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

  // รอกู้ session ก่อน ไม่งั้นเปิดลิงก์ใบเสร็จตรง ๆ จะถูกส่งไปหน้า login ทั้งที่ล็อกอินอยู่
  if (auth.initializing) return <Screen><Loading label="กำลังตรวจสอบบัญชี" /></Screen>;
  if (!auth.session) return <Redirect href="/login" />;

  const order = state.owner === auth.session?.user.id && state.orderId === orderId ? state.order : null;
  const receipt = state.owner === auth.session?.user.id && state.orderId === orderId ? state.receipt : null;
  const issuedAt = formatDateTime(receipt?.issuedAt);
  const divider = { borderColor: 'rgba(100, 116, 139, 0.3)' };
  const showLoading = (state.receiptLoading || (!receipt && !state.receiptError)) && !receipt;

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView contentContainerStyle={localStyles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={localStyles.container}>
          {orderId === null ? (
            <View style={{ paddingTop: 24 }}>
              <EmptyState title="ไม่พบใบเสร็จ" detail="ลิงก์ใบเสร็จไม่ถูกต้อง" />
            </View>
          ) : null}

          {orderId !== null && showLoading ? (
            <View style={{ gap: 14, paddingTop: 24 }}>
              <View style={{ alignSelf: 'center', width: 96 }}><Skeleton height={96} label="กำลังโหลดใบเสร็จ" /></View>
              <Skeleton height={320} />
            </View>
          ) : null}

          {state.receiptError && !receipt ? (
            <View style={{ paddingTop: 24 }}>
              <ErrorState
                icon={state.receiptError === 'network-error' ? 'offline' : 'alert'}
                title="โหลดใบเสร็จไม่สำเร็จ"
                detail={errorText(state.receiptError)}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="ลองใหม่อีกครั้ง"
                  onPress={() => { void store.loadReceipt(); }}
                  style={localStyles.retryBtn}>
                  <ThemedText style={localStyles.retryBtnText}>ลองใหม่อีกครั้ง</ThemedText>
                </Pressable>
              </ErrorState>
            </View>
          ) : null}

          {/* หัว "ชำระเงินสำเร็จ" แสดงเมื่อมีใบเสร็จที่เซิร์ฟเวอร์บันทึกแล้วเท่านั้น */}
          {receipt ? (
            <View style={localStyles.successSection}>
              <SuccessCheck />
              <ThemedText style={[localStyles.successTitle, { color: theme.text }]}>ชำระเงินสำเร็จ</ThemedText>
              {/* ข้อความถัดไปตามสถานะจริง: ใบเสร็จเดิมไม่เปลี่ยนแม้คืนเงินแล้ว */}
              {order?.paymentStatus === 'REFUNDED' ? (
                <ThemedText style={[localStyles.successSubtitle, { color: theme.textSecondary }]}>
                  คำสั่งซื้อนี้คืนเงินแล้ว ใบเสร็จด้านล่างเป็นรายการชำระเดิม ดูยอดคืนในสถานะคำสั่งซื้อ
                </ThemedText>
              ) : order?.status === 'WAITING_SELLER_SHIP' ? (
                <ThemedText style={[localStyles.successSubtitle, { color: theme.textSecondary }]}>
                  ผู้ขายจะส่งสินค้าเข้าตรวจสภาพก่อนส่งถึงคุณ
                </ThemedText>
              ) : null}
            </View>
          ) : null}

          {receipt ? (
            <View style={localStyles.receiptWrapper}>
              {/* Receipt Paper Card */}
              <View
                style={[
                  localStyles.receiptCard,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                  },
                ]}>
                <View style={[localStyles.receiptHeader, localStyles.dashed, divider]}>
                  <View style={localStyles.brandRow}>
                    <BrandIcon size={22} />
                    <ThemedText style={[localStyles.brandText, { color: theme.text }]}>2NDHAND</ThemedText>
                  </View>
                  <ThemedText style={[localStyles.receiptTitle, { color: theme.textSecondary }]}>ใบเสร็จรับเงิน</ThemedText>
                </View>

                <View style={[localStyles.section, localStyles.dashed, divider]}>
                  <ReceiptRow label="เลขที่ใบเสร็จ" value={receipt.receiptNo} strong mono />
                  <ReceiptRow label="คำสั่งซื้อ" value={`#${receipt.orderId}`} mono />
                  {issuedAt ? <ReceiptRow label="วันเวลา" value={issuedAt} /> : null}
                  <ReceiptRow
                    label="วิธีชำระ"
                    value={receipt.paymentMethod === 'SIMULATED' || !receipt.paymentMethod ? 'ชำระเงินจำลอง' : receipt.paymentMethod}
                  />
                </View>

                <View style={[localStyles.section, localStyles.dashed, divider]}>
                  <ThemedText style={[localStyles.productName, { color: theme.text }]}>{receipt.productName}</ThemedText>
                  <ReceiptRow label="ราคาสินค้า" value={formatBaht(receipt.itemPrice)} />
                  <ReceiptRow label="ค่าจัดส่ง" value={formatBaht(receipt.shippingFee)} />
                  <ReceiptRow label="ค่าตรวจสอบสินค้า" value={formatBaht(receipt.inspectionFee)} />
                </View>

                <View style={localStyles.totalSection}>
                  <ThemedText style={[localStyles.totalLabel, { color: theme.text }]}>ยอดรวม</ThemedText>
                  <ThemedText style={localStyles.totalAmount}>{formatBaht(receipt.totalAmount)}</ThemedText>
                </View>

                {/* Shipping Destination Box */}
                {order?.shippingAddress ? (
                  <View
                    style={[
                      localStyles.addressBox,
                      { backgroundColor: theme.backgroundElement },
                    ]}>
                    <ThemedText style={[localStyles.addressText, { color: theme.textSecondary }]}>
                      <ThemedText style={[localStyles.addressText, localStyles.addressLabel, { color: theme.text }]}>จัดส่งถึง </ThemedText>
                      {order.shippingAddress.recipientName} · {order.shippingAddress.phone}
                      {'\n'}
                      {order.shippingAddress.addressLine} {order.shippingAddress.subdistrict}{' '}
                      {order.shippingAddress.district} {order.shippingAddress.province}{' '}
                      {order.shippingAddress.postalCode}
                    </ThemedText>
                  </View>
                ) : null}

                {/* Disclaimer */}
                <ThemedText style={[localStyles.disclaimer, { color: isDark ? '#64748b' : '#94a3b8' }]}>
                  เอกสารนี้ออกจากระบบจำลองเพื่อการทดสอบ ไม่ใช่ใบเสร็จทางภาษี
                </ThemedText>
              </View>

              {/* Zigzag Paper Edge SVG */}
              <Svg
                width="100%"
                height={12}
                viewBox="0 0 320 12"
                preserveAspectRatio="none"
                style={localStyles.zigzagEdge}>
                <Path
                  d="M0,0 L10,12 L20,0 L30,12 L40,0 L50,12 L60,0 L70,12 L80,0 L90,12 L100,0 L110,12 L120,0 L130,12 L140,0 L150,12 L160,0 L170,12 L180,0 L190,12 L200,0 L210,12 L220,0 L230,12 L240,0 L250,12 L260,0 L270,12 L280,0 L290,12 L300,0 L310,12 L320,0 Z"
                  fill={theme.surface}
                />
              </Svg>
            </View>
          ) : null}

        </View>
      </ScrollView>

          {/* ปุ่มล่างคงที่แบบ design */}
          <View style={localStyles.actionsSection}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="ดูสถานะคำสั่งซื้อ"
              onPress={() => {
                if (orderId !== null) {
                  router.replace({ pathname: '/orders/[orderId]', params: { orderId: String(orderId) } });
                } else {
                  router.replace('/orders');
                }
              }}
              style={({ pressed }) => [
                localStyles.primaryBtn,
                { opacity: pressed ? 0.85 : 1 },
              ]}>
              <ThemedText style={localStyles.primaryBtnText}>ดูสถานะคำสั่งซื้อ</ThemedText>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="กลับหน้าแรก"
              onPress={() => router.replace('/')}
              style={({ pressed }) => [
                localStyles.ghostBtn,
                { opacity: pressed ? 0.6 : 1 },
              ]}>
              <ThemedText style={[localStyles.ghostBtnText, { color: theme.textSecondary }]}>
                กลับหน้าแรก
              </ThemedText>
            </Pressable>
          </View>
      </SafeAreaView>
    </Screen>
  );
}

const localStyles = StyleSheet.create({
  scrollContent: { flexGrow: 1, paddingBottom: 16 },
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 16, width: '100%', maxWidth: 560, alignSelf: 'center' },
  successSection: { alignItems: 'center', paddingTop: 16 },
  successCheck: { borderRadius: 999, padding: 6, backgroundColor: 'rgba(16, 185, 129, 0.12)' },
  successTitle: { fontFamily: Fonts.extraBold, fontSize: 18, lineHeight: 26, fontWeight: '800', textAlign: 'center', marginTop: 16 },
  successSubtitle: { fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 4, maxWidth: 280 },
  receiptWrapper: { marginTop: 20 },
  receiptCard: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
  dashed: { borderBottomWidth: 1, borderStyle: 'dashed' },
  receiptHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandText: { fontSize: 12, lineHeight: 18, fontWeight: '800', letterSpacing: 0.6 },
  receiptTitle: { fontSize: 11, lineHeight: 16, fontWeight: '600' },
  section: { paddingVertical: 12, gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  rowLabel: { fontSize: 12, lineHeight: 17 },
  rowValue: { fontSize: 12, lineHeight: 17, flexShrink: 1, textAlign: 'right' },
  productName: { fontSize: 12, lineHeight: 17, fontWeight: '600' },
  totalSection: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12 },
  totalLabel: { fontSize: 14, lineHeight: 20, fontWeight: '800' },
  totalAmount: { fontSize: 14, lineHeight: 20, fontWeight: '800', color: '#10b981' },
  addressBox: { marginTop: 12, padding: 10, borderRadius: 12 },
  addressText: { fontSize: 11, lineHeight: 17 },
  addressLabel: { fontWeight: '600' },
  disclaimer: { fontSize: 10, lineHeight: 14, textAlign: 'center', marginTop: 12 },
  zigzagEdge: { marginTop: -1 },
  actionsSection: { gap: 8, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20, width: '100%', maxWidth: 560, alignSelf: 'center' },
  primaryBtn: {
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#ffffff', fontSize: 14, lineHeight: 20, fontWeight: '700' },
  ghostBtn: { paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  ghostBtnText: { fontSize: 12, fontWeight: '600' },
  retryBtn: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, backgroundColor: '#059669' },
  retryBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
});
