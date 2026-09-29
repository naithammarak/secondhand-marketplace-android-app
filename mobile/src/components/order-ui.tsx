import type { PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { OrderErrorKind, OrderStatus } from '@/services/order-service';
import { WondeeLoader } from './wondee/loader';

export const orderStatusColors: Record<OrderStatus, string> = {
  WAITING_PAYMENT: Colors.light.warning,
  WAITING_SELLER_SHIP: Colors.light.success,
  SHIPPING_TO_CENTER: Colors.light.info,
  RECEIVED_AT_CENTER: Colors.light.info,
  INSPECTING: Colors.light.warning,
  RESULT_NOTIFIED: Colors.light.success,
  CANCELLED: Colors.light.textSecondary,
  UNKNOWN: Colors.light.textSecondary,
};

export const unknownStatusColor = Colors.light.textSecondary;

export const orderErrorMessages: Record<OrderErrorKind, string> = {
  unauthorized: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่',
  forbidden: 'บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้',
  'not-found': 'ไม่พบข้อมูล หรือคุณไม่มีสิทธิ์ดูรายการนี้',
  conflict: 'รายการนี้เปลี่ยนแปลงไปแล้ว ระบบดึงสถานะล่าสุดมาแสดงให้',
  'validation-error': 'ข้อมูลยังไม่ถูกต้อง กรุณาตรวจสอบช่องที่มีข้อความสีแดง',
  'network-error': 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่',
  timeout: 'เซิร์ฟเวอร์ตอบช้าเกินไป',
  'server-error': 'ระบบขัดข้อง กรุณาลองใหม่ภายหลัง',
  unavailable: 'บริการยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง',
};

/** ข้อความเฉพาะตาม code จาก backend ใช้แทนข้อความทั่วไปเมื่อมี */
export const orderCodeMessages: Record<string, string> = {
  product_unavailable: 'สินค้านี้ไม่พร้อมขายหรือถูกผู้อื่นจองไปแล้ว',
  already_ordered: 'คุณสั่งซื้อสินค้านี้ไว้แล้ว',
  self_purchase: 'ไม่สามารถซื้อสินค้าของตัวเองได้',
  product_not_found: 'ไม่พบสินค้า หรือสินค้าถูกลบไปแล้ว',
  buyer_role_required: 'เฉพาะบัญชีผู้ซื้อเท่านั้นที่สั่งซื้อได้',
  account_inactive: 'บัญชีนี้ถูกระงับการใช้งาน',
  order_already_paid: 'คำสั่งซื้อนี้ชำระเงินแล้ว',
  idempotency_key_reused: 'คำขอซ้ำไม่ตรงกับคำขอเดิม ระบบดึงสถานะล่าสุดมาแสดงให้',
  payment_simulation_disabled: 'ระบบจ่ายเงินจำลองปิดอยู่ในสภาพแวดล้อมนี้',
  receipt_not_found: 'ยังไม่มีใบเสร็จสำหรับคำสั่งซื้อนี้',
  not_order_buyer: 'เฉพาะผู้ซื้อของคำสั่งซื้อนี้เท่านั้น',
  order_cancelled: 'คำสั่งซื้อนี้ถูกยกเลิกแล้ว',
  order_expired: 'หมดเวลาชำระเงิน คำสั่งซื้อนี้ถูกยกเลิกอัตโนมัติและสินค้าถูกปล่อยให้ผู้อื่นซื้อได้',
};

export function errorText(kind: OrderErrorKind, code?: string | null): string {
  return (code && orderCodeMessages[code]) || orderErrorMessages[kind];
}

export function Screen({ children }: PropsWithChildren) {
  return (
    <ThemedView style={styles.screen}>
      <Animated.View
        entering={FadeIn?.duration ? FadeIn.duration(240) : undefined}
        style={{ flex: 1, width: '100%' }}>
        {children}
      </Animated.View>
    </ThemedView>
  );
}

export function Card({ children }: PropsWithChildren) {
  const theme = useTheme();
  return <ThemedView style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>{children}</ThemedView>;
}

export function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <ThemedText type={bold ? 'smallBold' : 'small'} themeColor={bold ? undefined : 'textSecondary'}>{label}</ThemedText>
      <ThemedText type={bold ? 'smallBold' : 'small'}>{value}</ThemedText>
    </View>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <View style={styles.center}>
      <WondeeLoader size={36} accessibilityLabel={label} />
      <ThemedText type="small" style={{ marginTop: 8 }}>{label}</ThemedText>
    </View>
  );
}

export function Button({
  label, onPress, disabled, busy, variant = 'secondary', accessibilityLabel,
}: {
  label: string;
  onPress(): void;
  disabled?: boolean;
  busy?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  const inactive = disabled || busy;
  return (
    <Pressable
      style={({ pressed }) => [
        { minHeight: 48, opacity: pressed ? 0.75 : 1 },
        variant === 'secondary' ? styles.secondaryButton : styles.primaryButton,
        { borderColor: variant === 'danger' ? theme.danger : theme.primary, backgroundColor: variant === 'secondary' ? theme.surface : variant === 'danger' ? theme.danger : theme.primary },
        inactive && styles.buttonDisabled,
      ]}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      onPress={onPress}>
      {busy ? <ActivityIndicator color={variant === 'secondary' ? theme.accent : theme.onPrimary} /> : null}
      <ThemedText type="smallBold" style={{ color: variant === 'secondary' ? theme.accent : variant === 'danger' ? theme.onDanger : theme.onPrimary }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

export function StatusBadge({ status, label }: { status: OrderStatus; label: string }) {
  const theme = useTheme();
  const color = status === 'WAITING_PAYMENT' ? theme.warning
    : status === 'WAITING_SELLER_SHIP' ? theme.success : theme.textSecondary;
  const backgroundColor = status === 'WAITING_PAYMENT' ? theme.warningSoft
    : status === 'WAITING_SELLER_SHIP' ? theme.successSoft : theme.backgroundElement;
  return (
    <View style={[styles.statusRow, { backgroundColor }]}>
      <View style={[styles.statusDot, { backgroundColor: color }]} />
      <ThemedText type="small" style={{ color, flexShrink: 1 }} accessibilityLiveRegion="polite">{label}</ThemedText>
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollContent: { flexGrow: 1, alignItems: 'center', padding: Spacing.three },
  content: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.three },
  center: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.four },
  card: { borderWidth: 1, borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: Spacing.two, paddingVertical: 7 },
  statusRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', maxWidth: '100%', gap: 6, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  field: { gap: Spacing.one },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 15, fontFamily: Fonts.sans, color: Colors.light.text, backgroundColor: Colors.light.backgroundElement, borderColor: Colors.light.border,
  },
  errorText: { color: Colors.light.danger },
  noticeBox: { borderWidth: 1, borderRadius: 12, padding: Spacing.two, gap: Spacing.one },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  primaryButton: {
    flexDirection: 'row',
    gap: Spacing.two,
    backgroundColor: Colors.light.primary,
    borderRadius: 12,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerButton: { backgroundColor: Colors.light.danger },
  primaryButtonText: { color: '#ffffff' },
  secondaryButton: {
    flexDirection: 'row',
    gap: Spacing.two,
    borderRadius: 12,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.light.primary,
  },
  buttonDisabled: { opacity: 0.5 },
});
