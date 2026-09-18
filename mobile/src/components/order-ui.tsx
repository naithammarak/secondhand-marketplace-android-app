import type { PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import type { OrderErrorKind, OrderStatus } from '@/services/order-service';

export const orderStatusColors: Record<OrderStatus, string> = {
  WAITING_PAYMENT: '#B7791F',
  WAITING_SELLER_SHIP: '#2F855A',
};

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
};

export function errorText(kind: OrderErrorKind, code?: string | null): string {
  return (code && orderCodeMessages[code]) || orderErrorMessages[kind];
}

export function Screen({ children }: PropsWithChildren) {
  return <ThemedView style={styles.screen}>{children}</ThemedView>;
}

export function Card({ children }: PropsWithChildren) {
  return <ThemedView type="backgroundElement" style={styles.card}>{children}</ThemedView>;
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
      <ActivityIndicator accessibilityLabel={label} />
      <ThemedText type="small">{label}</ThemedText>
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
  const inactive = disabled || busy;
  return (
    <Pressable
      style={[
        variant === 'secondary' ? styles.secondaryButton : styles.primaryButton,
        variant === 'danger' && styles.dangerButton,
        inactive && styles.buttonDisabled,
      ]}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      onPress={onPress}>
      {busy ? <ActivityIndicator color={variant === 'secondary' ? undefined : '#ffffff'} /> : null}
      <ThemedText type="smallBold" style={variant === 'secondary' ? undefined : styles.primaryButtonText}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

export function StatusBadge({ status, label }: { status: OrderStatus; label: string }) {
  return (
    <View style={styles.statusRow}>
      <View style={[styles.statusDot, { backgroundColor: orderStatusColors[status] }]} />
      <ThemedText type="smallBold" accessibilityLiveRegion="polite">{label}</ThemedText>
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollContent: { flexGrow: 1, alignItems: 'center', padding: Spacing.three },
  content: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.three },
  center: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.four },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  field: { gap: Spacing.one },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  errorText: { color: '#C53030' },
  noticeBox: { borderWidth: 1, borderRadius: Spacing.two, padding: Spacing.two, gap: Spacing.one },
  buttonRow: { flexDirection: 'row', gap: Spacing.two },
  primaryButton: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.two,
    backgroundColor: '#243a73',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerButton: { backgroundColor: '#9B2C2C' },
  primaryButtonText: { color: '#ffffff' },
  secondaryButton: {
    flexDirection: 'row',
    gap: Spacing.two,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#243a73',
  },
  buttonDisabled: { opacity: 0.5 },
});
