/** UI2-01 Inspector queue/history: unassigned inbound work plus this Inspector's assigned work. */
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/hooks/use-theme';
import { useInspectionApi } from '@/inspections/use-inspection-api';
import { orderStatusLabel } from '@/orders/order-format';
import type { WorkDetail } from '@/services/inspection-service';
import { Button } from '../order-ui';
import { ThemedText } from '../themed-text';
import { EmptyState } from '../wondee/primitives';
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

function Queue() {
  const theme = useTheme();
  const api = useInspectionApi();
  const [filter, setFilter] = useState<Filter>('SHIPPING_TO_CENTER');
  const [offset, setOffset] = useState(0);
  const resource = useStaffResource(useCallback(() => api.call(token => api.service.list(token, offset, filter === 'ALL' ? undefined : filter)), [api, offset, filter]));
  const page = resource.data;
  return <>
    <ThemedText themeColor="textSecondary">งานที่ยังไม่มีผู้รับผิดชอบในศูนย์ และงานที่คุณเริ่มตรวจแล้ว</ThemedText>
    <Chips options={[...FILTERS]} value={filter} disabled={resource.loading} onChange={value => { setFilter(value); setOffset(0); }} />
    <LoadState {...resource} label="กำลังโหลดงานตรวจ" />
    {page && page.items.length === 0 && !resource.loading ? <EmptyState title="ยังไม่มีงานในตัวกรองนี้" detail="งานใหม่จะแสดงเมื่อผู้ขายแจ้งส่งสินค้าเข้าศูนย์" /> : null}
    {page?.items.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`เปิดงานตรวจ ${item.product.name}`}
      onPress={() => router.push({ pathname: '/inspections/[inspectionId]', params: { inspectionId: String(item.id) } })}
      style={({ pressed }) => ({ borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, borderRadius: 16, padding: 14, gap: 4, opacity: pressed ? 0.85 : 1 })}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <ThemedText type="small" themeColor="textSecondary">คำสั่งซื้อ #{item.order_id} · งาน #{item.id}</ThemedText>
        {item.fulfillment_policy === 'LEGACY_V1' ? <ThemedText type="small" themeColor="textSecondary">รุ่นเดิม</ThemedText> : null}
      </View>
      <ThemedText type="smallBold">{item.product.name}</ThemedText>
      <ThemedText type="small" style={{ color: theme.accent }}>{orderStatusLabel(item.order_status)}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{workHint(item)}</ThemedText>
      {item.inspection_overdue_escalated_at ? <ThemedText type="small" style={{ color: theme.danger }}>เกินกำหนดตรวจ ผู้ดูแลกำลังติดตาม</ThemedText> : null}
    </Pressable>)}
    {page ? <ThemedText type="small" themeColor="textSecondary">แสดง {offset + 1}–{offset + page.items.length} จาก {page.total}</ThemedText> : null}
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {offset > 0 ? <Button label="หน้าก่อน" disabled={resource.loading} onPress={() => setOffset(value => Math.max(0, value - 20))} /> : null}
      {page && offset + page.items.length < page.total ? <Button label="หน้าถัดไป" disabled={resource.loading} onPress={() => setOffset(value => value + 20)} /> : null}
    </View>
  </>;
}

export function InspectorQueueScreen() {
  return <StaffScreen title="งานตรวจสินค้า" role="INSPECTOR"><Queue /></StaffScreen>;
}
