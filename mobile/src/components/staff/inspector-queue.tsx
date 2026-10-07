/** UI2-01 Inspector queue/history: unassigned inbound work plus this Inspector's assigned work. */
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { router } from 'expo-router';
import { useTheme } from '@/hooks/use-theme';
import { useInspectionApi } from '@/inspections/use-inspection-api';
import { orderStatusLabel } from '@/orders/order-format';
import type { WorkDetail } from '@/services/inspection-service';
import { Button } from '../order-ui';
import { ThemedText } from '../themed-text';
import { EmptyState } from '../wondee/primitives';
import { OrderStatusPill } from '../order-status-pill';
import { cardConditionLabels, conditionBadgeTheme } from '../product-catalog-ui';
import { CONDITION_LABELS } from '@/services/product-service';
import type { ProductCondition } from '@/services/product-catalog-service';
import { Chips, LoadState, StaffScreen, useStaffResource } from './staff-ui';

const FILTERS = [
  { value: 'SHIPPING_TO_CENTER', label: 'กำลังส่งเข้าศูนย์' },
  { value: 'RECEIVED_AT_CENTER', label: 'รับเข้าศูนย์แล้ว' },
  { value: 'INSPECTING', label: 'กำลังตรวจ' },
  { value: 'RESULT_NOTIFIED', label: 'แจ้งผลแล้ว/รอส่งออก' },
  { value: 'ALL', label: 'ทั้งหมดรวมประวัติ' },
] as const;
type Filter = (typeof FILTERS)[number]['value'];

/** Server-derived next step for a queue row; no local business decision. */
export function workHint(item: WorkDetail): string {
  if (item.order_status === 'SHIPPING_TO_CENTER') return item.fulfillment_policy === 'LEGACY_V1' ? 'รุ่นเดิม: ต้องมีหลักฐานผู้ขนส่งก่อนรับ' : 'รับเข้าศูนย์ได้เมื่อได้รับพัสดุจริง';
  if (item.order_status === 'RECEIVED_AT_CENTER') return 'พร้อมเริ่มตรวจ';
  if (item.order_status === 'INSPECTING') return `หลักฐาน ${item.evidence.length}/5 ภาพ`;
  if (item.can_create_fulfillment) return item.next_action === 'SHIP_TO_BUYER' ? 'พร้อมส่งถึงผู้ซื้อ' : 'พร้อมส่งคืนผู้ขาย';
  if (item.next_action === 'WAIT_BUYER_DECISION') return 'รอผู้ซื้อตัดสินผลตรวจ';
  if (item.fulfillment) return item.fulfillment.leg === 'TO_BUYER' ? 'บันทึกส่งถึงผู้ซื้อแล้ว' : 'บันทึกส่งคืนผู้ขายแล้ว';
  return orderStatusLabel(item.order_status);
}

/** ขั้นที่ผู้ตรวจต้องทำต่อ (ใช้ไฮไลต์บรรทัดถัดไปเป็นสีเขียวเมื่อเป็นงานของศูนย์) */
function isActionable(item: WorkDetail): boolean {
  return item.order_status === 'RECEIVED_AT_CENTER' || (item.order_status === 'INSPECTING' && !item.result)
    || !!item.can_create_fulfillment || (item.order_status === 'SHIPPING_TO_CENTER' && item.fulfillment_policy !== 'LEGACY_V1');
}

function QueueCard({ item }: { item: WorkDetail }) {
  const theme = useTheme();
  const muted = theme.background === '#0c0e14' ? '#64748b' : '#94a3b8';
  const key = item.product.condition as ProductCondition;
  const badge = CONDITION_LABELS[item.product.condition] ? conditionBadgeTheme[key] : null;
  const actionable = isActionable(item);
  return <Pressable accessibilityRole="button" accessibilityLabel={`เปิดงานตรวจ ${item.product.name}`}
    onPress={() => router.push({ pathname: '/inspections/[inspectionId]', params: { inspectionId: String(item.id) } })}
    style={({ pressed }) => [local.card, { backgroundColor: theme.surface, borderColor: item.inspection_overdue_escalated_at ? 'rgba(244, 63, 94, 0.5)' : theme.border, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
    <View style={local.cardHead}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <ThemedText style={[local.mono, { color: muted }]} numberOfLines={1}>#{item.order_id} · งาน {item.id}</ThemedText>
        {item.shipment?.tracking_number ? <ThemedText style={[local.mono, { color: muted }]} numberOfLines={1}>
          {item.shipment.carrier ? `${item.shipment.carrier} · ` : ''}{item.shipment.tracking_number}
        </ThemedText> : null}
      </View>
      <OrderStatusPill status={item.order_status} />
    </View>
    <ThemedText style={[local.name, { color: theme.text }]} numberOfLines={2}>{item.product.name}</ThemedText>
    <View style={local.metaRow}>
      {badge ? <View style={[local.cond, { backgroundColor: badge.bg }]}><ThemedText style={local.condText}>{cardConditionLabels[key]}</ThemedText></View> : null}
      {item.product.size?.trim() ? <ThemedText style={[local.meta, { color: muted }]}>ขนาด {item.product.size}</ThemedText> : null}
      {item.fulfillment_policy === 'LEGACY_V1' ? <ThemedText style={[local.meta, { color: muted }]}>· รุ่นเดิม</ThemedText> : null}
    </View>
    <View style={[local.hintRow, { borderTopColor: 'rgba(100, 116, 139, 0.15)' }]}>
      <ThemedText style={[local.hint, { color: actionable ? '#10b981' : theme.textSecondary }]}>{actionable ? '▶ ' : ''}{workHint(item)}</ThemedText>
      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none"><Path d="M9 5l7 7-7 7" stroke={theme.textSecondary} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
    </View>
    {item.inspection_overdue_escalated_at ? <View style={local.overdue}><ThemedText style={local.overdueText}>เกินกำหนดตรวจ ผู้ดูแลกำลังติดตาม</ThemedText></View> : null}
  </Pressable>;
}

function Queue() {
  const theme = useTheme();
  const api = useInspectionApi();
  const [filter, setFilter] = useState<Filter>('SHIPPING_TO_CENTER');
  const [offset, setOffset] = useState(0);
  const resource = useStaffResource(useCallback(() => api.call(token => api.service.list(token, offset, filter === 'ALL' ? undefined : filter)), [api, offset, filter]));
  const page = resource.data;
  return <>
    <Chips scroll options={[...FILTERS]} value={filter} disabled={resource.loading} onChange={value => { setFilter(value); setOffset(0); }} />
    <ThemedText style={{ fontSize: 11, lineHeight: 16, color: theme.textSecondary }}>งานที่ยังไม่มีผู้รับผิดชอบในศูนย์ และงานที่คุณเริ่มตรวจแล้ว · แตะการ์ดเพื่อทำขั้นถัดไป</ThemedText>
    <LoadState {...resource} label="กำลังโหลดงานตรวจ" />
    {page && page.items.length === 0 && !resource.loading ? <EmptyState icon="receipt" title="ยังไม่มีงานในตัวกรองนี้" detail="งานใหม่จะแสดงเมื่อผู้ขายแจ้งส่งสินค้าเข้าศูนย์" /> : null}
    {page?.items.map(item => <QueueCard key={item.id} item={item} />)}
    {page && page.total > 0 ? <ThemedText style={{ fontSize: 11, textAlign: 'center', color: theme.textSecondary }}>แสดง {offset + 1}–{offset + page.items.length} จาก {page.total}</ThemedText> : null}
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {offset > 0 ? <View style={{ flex: 1 }}><Button label="หน้าก่อน" disabled={resource.loading} onPress={() => setOffset(value => Math.max(0, value - 20))} /></View> : null}
      {page && offset + page.items.length < page.total ? <View style={{ flex: 1 }}><Button label="หน้าถัดไป" disabled={resource.loading} onPress={() => setOffset(value => value + 20)} /></View> : null}
    </View>
  </>;
}

const local = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  mono: { fontFamily: 'monospace', fontSize: 11, lineHeight: 16 },
  name: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cond: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  condText: { fontSize: 10, lineHeight: 14, fontWeight: '800', color: '#ffffff' },
  meta: { fontSize: 11, lineHeight: 16 },
  hintRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderTopWidth: 1, paddingTop: 8 },
  hint: { flex: 1, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  overdue: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: 'rgba(244, 63, 94, 0.12)' },
  overdueText: { fontSize: 10, lineHeight: 15, fontWeight: '700', color: '#f43f5e' },
});

export function InspectorQueueScreen() {
  return <StaffScreen title="งานตรวจสินค้า" role="INSPECTOR"><Queue /></StaffScreen>;
}
