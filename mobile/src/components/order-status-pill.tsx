import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { orderStatusLabel } from '@/orders/order-format';
import type { OrderStatus } from '@/services/order-service';
import { useThemePreference } from '@/theme/theme-provider';

/** สีป้ายตาม design (.st-*): รอผู้ใช้ทำอะไร = อำพัน, ดำเนินการ = ฟ้า, สำเร็จ = เขียว, ปิดแล้ว = เทา */
export function statusTone(status: OrderStatus | string): { bg: string; light: string; dark: string } {
  if (status === 'WAITING_PAYMENT' || status === 'RESULT_NOTIFIED' || status === 'DELIVERED_PENDING_BUYER' || status === 'DELIVERY_DISPUTED') {
    return { bg: 'rgba(245, 158, 11, 0.15)', light: '#d97706', dark: '#fbbf24' };
  }
  if (status === 'COMPLETED') return { bg: 'rgba(16, 185, 129, 0.15)', light: '#059669', dark: '#34d399' };
  if (status === 'CANCELLED' || status === 'REFUNDED' || status === 'RETURNED' || status === 'UNKNOWN') {
    return { bg: 'rgba(100, 116, 139, 0.18)', light: '#64748b', dark: '#94a3b8' };
  }
  return { bg: 'rgba(14, 165, 233, 0.15)', light: '#0284c7', dark: '#38bdf8' };
}

export function OrderStatusPill({ status }: { status: OrderStatus | string }) {
  const { scheme } = useThemePreference();
  const tone = statusTone(status);
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}>
      <ThemedText
        numberOfLines={1}
        style={[styles.text, { color: scheme === 'dark' ? tone.dark : tone.light }]}
        accessibilityLiveRegion="polite">
        {orderStatusLabel(status)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, flexShrink: 1 },
  text: { fontSize: 10, lineHeight: 15, fontWeight: '700' },
});
