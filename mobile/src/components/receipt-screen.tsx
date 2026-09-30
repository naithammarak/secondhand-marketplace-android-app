import { Redirect, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { useAuth } from '@/auth/auth-provider';
import { ThemedText } from '@/components/themed-text';
import { Card, errorText, Loading, Row, Screen } from '@/components/order-ui';
import { BrandIcon, BrandWordmark } from '@/components/wondee/brand-logo';
import { useTheme } from '@/hooks/use-theme';
import { useThemePreference } from '@/theme/theme-provider';
import { formatBaht, formatDateTime } from '@/orders/order-format';
import { useOrderDetail } from '@/orders/orders-provider';

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

  if (!auth.session) return <Redirect href="/login" />;

  const order = state.owner === auth.session?.user.id && state.orderId === orderId ? state.order : null;
  const receipt = state.owner === auth.session?.user.id && state.orderId === orderId ? state.receipt : null;
  const issuedAt = formatDateTime(receipt?.issuedAt);

  return (
    <Screen>
      <ScrollView contentContainerStyle={localStyles.scrollContent} showsVerticalScrollIndicator={false}>
        <SafeAreaView style={localStyles.container}>
          {/* Success Check Header matching prototype screen-order-success */}
          <View style={localStyles.successSection}>
            <View style={[localStyles.successCheckCircle, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.12)' }]}>
              <Svg width={36} height={36} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M5 13l4 4L19 7"
                  stroke="#10b981"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </View>
            <ThemedText style={localStyles.successTitle}>ชำระเงินสำเร็จ</ThemedText>
            <ThemedText style={[localStyles.successSubtitle, { color: theme.textSecondary }]}>
              ผู้ขายจะส่งสินค้าเข้าตรวจสภาพก่อนส่งถึงคุณ
            </ThemedText>
          </View>

          {state.receiptLoading && !receipt ? <Loading label="กำลังโหลดใบเสร็จ" /> : null}
          {state.receiptError && !receipt ? (
            <Card>
              <ThemedText accessibilityLiveRegion="polite">{errorText(state.receiptError)}</ThemedText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="ลองใหม่อีกครั้ง"
                onPress={() => { void store.loadReceipt(); }}
                style={[localStyles.retryBtn, { backgroundColor: theme.primary }]}>
                <ThemedText style={localStyles.retryBtnText}>ลองใหม่อีกครั้ง</ThemedText>
              </Pressable>
            </Card>
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
                {/* Brand Header */}
                <View style={localStyles.receiptHeader}>
                  <View style={localStyles.brandRow}>
                    <BrandIcon size={24} />
                    <BrandWordmark width={78} height={24} />
                  </View>
                  <View style={[localStyles.receiptBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9' }]}>
                    <ThemedText style={[localStyles.receiptBadgeText, { color: theme.textSecondary }]}>
                      ใบเสร็จรับเงิน
                    </ThemedText>
                  </View>
                </View>

                {/* Dashed line */}
                <View style={[localStyles.dashedDivider, { borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)' }]} />

                {/* Metadata */}
                <View style={localStyles.metaSection}>
                  <Row label="เลขที่ใบเสร็จ" value={receipt.receiptNo} bold />
                  <Row label="คำสั่งซื้อ" value={`#${receipt.orderId}`} />
                  {issuedAt ? <Row label="วันเวลา" value={issuedAt} /> : null}
                  <Row label="วิธีชำระ" value={receipt.paymentMethod || 'พร้อมเพย์'} />
                </View>

                {/* Dashed line */}
                <View style={[localStyles.dashedDivider, { borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)' }]} />

                {/* Items & Fees */}
                <View style={localStyles.itemsSection}>
                  <ThemedText type="smallBold" style={{ marginBottom: 6 }}>
                    {receipt.productName}
                  </ThemedText>
                  <Row label="ราคาสินค้า" value={formatBaht(receipt.itemPrice)} />
                  <Row label="ค่าจัดส่ง" value={formatBaht(receipt.shippingFee)} />
                  <Row label="ค่าตรวจสอบสินค้า" value={formatBaht(receipt.inspectionFee)} />
                </View>

                {/* Dashed line */}
                <View style={[localStyles.dashedDivider, { borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)' }]} />

                {/* Total */}
                <View style={localStyles.totalSection}>
                  <ThemedText style={localStyles.totalLabel}>ยอดรวม</ThemedText>
                  <ThemedText style={localStyles.totalAmount}>{formatBaht(receipt.totalAmount)}</ThemedText>
                </View>

                {/* Shipping Destination Box */}
                {order?.shippingAddress ? (
                  <View
                    style={[
                      localStyles.addressBox,
                      {
                        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#f8fafc',
                        borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0',
                      },
                    ]}>
                    <ThemedText style={[localStyles.addressText, { color: theme.textSecondary }]}>
                      <ThemedText style={[localStyles.addressLabel, { color: theme.text }]}>จัดส่งถึง </ThemedText>
                      {order.shippingAddress.recipientName} · {order.shippingAddress.phone}
                      {'\n'}
                      {order.shippingAddress.addressLine} {order.shippingAddress.subdistrict}{' '}
                      {order.shippingAddress.district} {order.shippingAddress.province}{' '}
                      {order.shippingAddress.postalCode}
                    </ThemedText>
                  </View>
                ) : null}

                {/* Disclaimer */}
                <ThemedText style={[localStyles.disclaimer, { color: theme.textSecondary }]}>
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

          {/* Action Buttons matching prototype screen-order-success */}
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
      </ScrollView>
    </Screen>
  );
}

const localStyles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  successSection: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  successCheckCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 260,
    lineHeight: 18,
  },
  receiptWrapper: {
    marginTop: 12,
    marginBottom: 20,
  },
  receiptCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    padding: 16,
  },
  receiptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  receiptBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  receiptBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  dashedDivider: {
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    marginVertical: 12,
  },
  metaSection: {
    gap: 6,
  },
  itemsSection: {
    gap: 6,
  },
  totalSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '800',
  },
  totalAmount: {
    fontSize: 17,
    fontWeight: '800',
    color: '#10b981',
  },
  addressBox: {
    marginTop: 12,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  addressText: {
    fontSize: 11,
    lineHeight: 16,
  },
  addressLabel: {
    fontWeight: '700',
  },
  disclaimer: {
    fontSize: 10,
    textAlign: 'center',
    marginTop: 12,
  },
  zigzagEdge: {
    marginTop: -1,
  },
  actionsSection: {
    gap: 10,
    paddingBottom: 16,
  },
  primaryBtn: {
    backgroundColor: '#059669',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  ghostBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  retryBtn: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  retryBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
});
