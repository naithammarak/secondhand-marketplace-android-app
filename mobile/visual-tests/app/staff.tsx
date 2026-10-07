/** QA FIXTURE scenes for UI2 staff states (inert actions, no API). Open /staff?scene=... */
import { useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useEffect } from 'react';
import { useTheme } from '../../src/hooks/use-theme';
import { useThemePreference } from '../../src/theme/theme-provider';
import { ThemedText } from '../../src/components/themed-text';
import { InspectorWorkView, type WorkActions } from '../../src/components/staff/inspector-work';
import { DeliveryCaseReview, DemoEventIntro, DemoEventRecorded, ReturnExceptionReview } from '../../src/components/staff/admin-delivery';
import { Notice } from '../../src/components/staff/staff-ui';
import { deliveryReviewFixture, returnReviewFixture } from '../../src/fulfillment/fixtures';
import type { WorkDetail } from '../../src/services/inspection-service';
import { photos } from '../shims/catalog';

const now = Date.now();
const iso = (hours: number) => new Date(now + hours * 3600_000).toISOString();
const evidence = [31, 32].map(id => ({ id, mime_type: 'image/png', size_bytes: 1, url: `/inspection-evidence/${id}` }));
const work = (extra: Partial<WorkDetail> = {}): WorkDetail => ({
  id: 4, order_id: 42, order_status: 'SHIPPING_TO_CENTER', product: { id: 7, name: 'แจ็กเก็ตยีนส์ ตัวอย่าง QA', condition: 'GOOD', size: 'M' },
  shipment: { carrier: 'ขนส่งท้องถิ่น อื่น ๆ', tracking_number: 'local-trk 001', shipped_at: iso(-30), courier_delivered_at: null, received_at: null },
  inspector_id: null, started_at: null, result: null, summary: null, inspected_at: null, evidence: [], certificate: null, next_action: null,
  fulfillment_policy: 'EXTERNAL_V2', result_available_at: null, result_decision_deadline_at: null, result_timed_out_at: null,
  buyer_decision: null, fulfillment: null, can_create_fulfillment: false, inspection_overdue_escalated_at: null, ...extra,
});
const done = { inspector_id: 9, inspected_at: iso(-20), summary: 'ความแท้: ตรวจแล้วตรงตามหลักฐาน\nสภาพ: ตรงกับที่ประกาศ', evidence, order_status: 'RESULT_NOTIFIED' as const };
const cert = { certificate_no: 'CERT-QA-0042', public_url: 'https://cert.example.test/certificates/qa-opaque-token', issued_at: iso(-20), status: 'ISSUED' as const };

const SCENES: Record<string, WorkDetail> = {
  'inspector-receive': work(),
  'inspector-receive-legacy': work({ fulfillment_policy: 'LEGACY_V1' }),
  'inspector-start': work({ order_status: 'RECEIVED_AT_CENTER', shipment: { carrier: 'ขนส่งท้องถิ่น อื่น ๆ', tracking_number: 'local-trk 001', shipped_at: iso(-30), courier_delivered_at: null, received_at: iso(-2) } }),
  'inspector-inspecting': work({ order_status: 'INSPECTING', inspector_id: 9, evidence }),
  'inspector-wait-decision': work({ ...done, result: 'MINOR_ISSUE', certificate: cert, next_action: 'WAIT_BUYER_DECISION', result_available_at: iso(-20), result_decision_deadline_at: iso(52) }),
  'inspector-outbound-buyer': work({ ...done, result: 'PASS', certificate: cert, next_action: 'SHIP_TO_BUYER', can_create_fulfillment: true, buyer_decision: { decision: 'CONFIRM', decided_at: iso(-4) } }),
  'inspector-outbound-return': work({ ...done, result: 'FAKE', summary: 'ความแท้: พบข้อสงสัย', next_action: 'RETURN_TO_SELLER', can_create_fulfillment: true }),
  'inspector-timeout-return': work({ ...done, result: 'PASS', certificate: cert, next_action: 'RETURN_TO_SELLER', can_create_fulfillment: true, result_available_at: iso(-75), result_decision_deadline_at: iso(-3), result_timed_out_at: iso(-2) }),
  'inspector-shipped': work({ ...done, result: 'PASS', certificate: { ...cert, status: 'REVOKED' }, fulfillment: { id: 12, leg: 'TO_BUYER', status: 'IN_TRANSIT' }, buyer_decision: { decision: 'CONFIRM', decided_at: iso(-4) }, order_status: 'SHIPPING_TO_BUYER' }),
};
const actions: WorkActions = { busy: false, photoSource: id => ({ uri: photos[id % photos.length] }), onReceive() {}, onStart() {}, onPick() {}, onFinalize() {}, onShip() {} };

function Scene({ scene }: { scene: string }) {
  if (SCENES[scene]) return <InspectorWorkView work={SCENES[scene]} actions={actions} />;
  if (scene === 'admin-case-review') return <DeliveryCaseReview review={deliveryReviewFixture} busy={false} onResolve={() => {}} />;
  if (scene === 'admin-return-review') return <ReturnExceptionReview review={returnReviewFixture} busy={false} onConfirm={() => {}} />;
  if (scene === 'admin-demo-event') return <View style={{ gap: 14 }}><DemoEventIntro />
    <DemoEventRecorded result={{ order_id: 42, shipment_id: 12, leg: 'TO_BUYER', event_id: 'demo-42-12-qa01', event: 'DELIVERED', source: 'ADMIN_DEMO', confirmed_at: iso(0), simulated: true, recipient_confirmed: false }} />
    <Notice tone="danger" title="บันทึกไม่สำเร็จ" detail="เหตุการณ์ขนส่งจำลองปิดอยู่ (ต้องเปิด EXTERNAL_SHIPPING_DEMO_ENABLED)" /></View>;
  if (scene === 'staff-denied') return <Notice tone="neutral" title="บัญชีนี้ไม่มีสิทธิ์ใช้งานส่วนนี้" detail="สิทธิ์เจ้าหน้าที่กำหนดโดยผู้ดูแลระบบเท่านั้น" />;
  return <ThemedText>ไม่พบ scene</ThemedText>;
}

export default function StaffQA() {
  const params = useLocalSearchParams<{ scene?: string; theme?: string }>();
  const theme = useTheme();
  const { setPreference } = useThemePreference();
  useEffect(() => { setPreference(params.theme === 'dark' ? 'dark' : 'light'); }, [params.theme]); // eslint-disable-line react-hooks/exhaustive-deps
  const scene = params.scene ?? 'inspector-receive';
  return <View style={{ flex: 1, backgroundColor: theme.background }}>
    <View style={{ backgroundColor: '#fbbf24', padding: 4 }}><ThemedText style={{ color: '#111827', fontSize: 12, textAlign: 'center' }}>QA FIXTURE · {scene} · ไม่มี API/การบันทึกจริง</ThemedText></View>
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16, maxWidth: 800, width: '100%', alignSelf: 'center' }}><Scene scene={scene} /></ScrollView>
  </View>;
}
