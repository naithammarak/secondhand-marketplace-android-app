import { fireEvent, render, screen } from '@testing-library/react-native';
import { InspectorWorkView, type WorkActions } from '@/components/staff/inspector-work';
import { workHint } from '@/components/staff/inspector-queue';
import type { WorkDetail } from '@/services/inspection-service';

jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: jest.fn(), Redirect: () => null }));

const base = (extra: Partial<WorkDetail> = {}): WorkDetail => ({
  id: 4, order_id: 7, order_status: 'SHIPPING_TO_CENTER', product: { id: 3, name: 'แจ็กเก็ต', condition: 'GOOD', size: 'M' },
  shipment: { carrier: 'ขนส่งอื่น ๆ', tracking_number: 'local-trk 001', shipped_at: '2026-10-02T10:00:00Z', courier_delivered_at: null, received_at: null },
  inspector_id: null, started_at: null, result: null, summary: null, inspected_at: null, evidence: [], certificate: null, next_action: null,
  fulfillment_policy: 'EXTERNAL_V2', result_available_at: null, result_decision_deadline_at: null, result_timed_out_at: null,
  buyer_decision: null, fulfillment: null, can_create_fulfillment: false, inspection_overdue_escalated_at: null, ...extra,
});
const actions = (extra: Partial<WorkActions> = {}): WorkActions => ({
  busy: false, photoSource: () => ({ uri: 'https://img.test/1.png' }), onReceive: jest.fn(), onStart: jest.fn(), onPick: jest.fn(),
  onFinalize: jest.fn(), onShip: jest.fn(), ...extra,
});
const disabled = (name: string) => screen.getByRole('button', { name }).props.accessibilityState.disabled;

test('EXTERNAL_V2 center receipt needs no provider-arrived/courier prerequisite', () => {
  const handlers = actions();
  render(<InspectorWorkView work={base()} actions={handlers} />);
  expect(disabled('ยืนยันรับสินค้าเข้าศูนย์จริง')).toBe(false);
  fireEvent.changeText(screen.getByLabelText('บันทึกการรับ (ไม่บังคับ)'), ' กล่องสมบูรณ์ ');
  fireEvent.press(screen.getByRole('button', { name: 'ยืนยันรับสินค้าเข้าศูนย์จริง' }));
  expect(handlers.onReceive).toHaveBeenCalledWith(' กล่องสมบูรณ์ ');
});

test('LEGACY_V1 receipt keeps the courier proof rule', () => {
  render(<InspectorWorkView work={base({ fulfillment_policy: 'LEGACY_V1' })} actions={actions()} />);
  expect(disabled('ยืนยันรับสินค้าเข้าศูนย์จริง')).toBe(true);
  expect(screen.getByText(/ต้องมีหลักฐานผู้ขนส่ง/)).toBeTruthy();
});

test('final result payload is result/summary/evidence_ids only; checklist only writes summary text', () => {
  const handlers = actions();
  render(<InspectorWorkView work={base({ order_status: 'INSPECTING', inspector_id: 9, evidence: [
    { id: 31, mime_type: 'image/png', size_bytes: 10, url: '/inspection-evidence/31' }, { id: 30, mime_type: 'image/png', size_bytes: 10, url: '/inspection-evidence/30' }] })} actions={handlers} />);
  fireEvent.press(screen.getByRole('checkbox', { name: 'หลักฐาน 31' }));
  fireEvent.press(screen.getByRole('checkbox', { name: 'หลักฐาน 30' }));
  fireEvent.press(screen.getByRole('button', { name: 'ผ่านการตรวจตามรายงาน' }));
  expect(screen.getByText(/ระบบจะออกใบรับรองพร้อมบันทึกผล/)).toBeTruthy();
  fireEvent.press(screen.getAllByRole('button', { name: '✓ ตรง' })[0]);
  fireEvent.press(screen.getByRole('button', { name: 'ตรวจทานและบันทึกผล' }));
  fireEvent.press(screen.getByRole('button', { name: 'บันทึกผลและออกใบรับรอง' }));
  expect(handlers.onFinalize).toHaveBeenCalledWith({ result: 'PASS', summary: 'ความแท้: ตรวจแล้วตรงตามหลักฐาน', evidence_ids: [30, 31] });
});

test('negative result states no certificate and no Buyer acceptance', () => {
  render(<InspectorWorkView work={base({ order_status: 'INSPECTING', inspector_id: 9 })} actions={actions()} />);
  fireEvent.press(screen.getByRole('button', { name: 'ไม่ผ่านการตรวจความแท้' }));
  expect(screen.getByText(/ผลนี้ไม่ออกใบรับรอง ไม่เปิดให้ผู้ซื้อยอมรับ/)).toBeTruthy();
});

test('outbound form appears only from can_create_fulfillment, has no photo, sends trimmed carrier/tracking', () => {
  const handlers = actions();
  const work = base({ order_status: 'RESULT_NOTIFIED', inspector_id: 9, result: 'FAKE', inspected_at: '2026-10-03T10:00:00Z', summary: 'ไม่ผ่าน', next_action: 'RETURN_TO_SELLER', can_create_fulfillment: true });
  const view = render(<InspectorWorkView work={work} actions={handlers} />);
  expect(screen.getByText('ไม่ออกใบรับรองสำหรับผลนี้')).toBeTruthy();
  expect(screen.getByText(/ที่อยู่รับคืนที่ผู้ขายบันทึกและถูกล็อกไว้/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: /เพิ่มรูป/ })).toBeNull();
  expect(screen.getByText(/ไม่ต้องแนบรูปพัสดุ/)).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText('ผู้ให้บริการขนส่ง'), '  Flash Express ');
  fireEvent.changeText(screen.getByLabelText('เลขพัสดุ'), ' th-0001 x ');
  fireEvent.press(screen.getByRole('button', { name: 'บันทึกการส่งออก' }));
  fireEvent.press(screen.getByRole('button', { name: 'ยืนยันบันทึกการส่งออก' }));
  expect(handlers.onShip).toHaveBeenCalledWith({ carrier: 'Flash Express', tracking_number: 'th-0001 x' });
  view.rerender(<InspectorWorkView work={{ ...work, can_create_fulfillment: false, fulfillment: { id: 13, leg: 'TO_SELLER', status: 'IN_TRANSIT' } }} actions={handlers} />);
  expect(screen.queryByRole('button', { name: 'บันทึกการส่งออก' })).toBeNull();
  expect(screen.getByText('บันทึกส่งคืนผู้ขายแล้ว')).toBeTruthy();
  expect(screen.queryByText(/ยืนยันว่าส่งถึง/)).toBeNull();
});

test('positive result waits for Buyer decision with server deadline; no outbound yet', () => {
  render(<InspectorWorkView work={base({ order_status: 'RESULT_NOTIFIED', inspector_id: 9, result: 'MINOR_ISSUE', inspected_at: '2026-10-03T10:00:00Z',
    summary: 'รอยเล็กน้อย', next_action: 'WAIT_BUYER_DECISION', result_decision_deadline_at: '2026-10-06T10:00:00Z',
    certificate: { certificate_no: 'C-1', public_url: 'https://x.test/c/abc', issued_at: '2026-10-03T10:00:00Z', status: 'ISSUED' } })} actions={actions()} />);
  expect(screen.getByText(/รอผู้ซื้อตัดสินภายใน/)).toBeTruthy();
  expect(screen.getByText('ออกแล้ว (ISSUED)')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'บันทึกการส่งออก' })).toBeNull();
});

test('queue hints derive from server status and flags', () => {
  expect(workHint(base())).toBe('รับเข้าศูนย์ได้เมื่อได้รับพัสดุจริง');
  expect(workHint(base({ order_status: 'RESULT_NOTIFIED', can_create_fulfillment: true, next_action: 'SHIP_TO_BUYER' }))).toBe('พร้อมส่งถึงผู้ซื้อ');
  expect(workHint(base({ order_status: 'RESULT_NOTIFIED', next_action: 'WAIT_BUYER_DECISION' }))).toBe('รอผู้ซื้อตัดสินผลตรวจ');
});

test('checklist toggles replace that topic line instead of appending duplicates', () => {
  const handlers = actions();
  render(<InspectorWorkView work={base({ order_status: 'INSPECTING', inspector_id: 9, evidence: [
    { id: 31, mime_type: 'image/png', size_bytes: 10, url: '/inspection-evidence/31' }] })} actions={handlers} />);
  fireEvent.press(screen.getAllByRole('button', { name: '✓ ตรง' })[0]);
  fireEvent.press(screen.getAllByRole('button', { name: '✗ ไม่ตรง' })[0]);
  fireEvent.press(screen.getAllByRole('button', { name: '✗ ไม่ตรง' })[0]);
  expect(screen.getByLabelText('สรุปผลการตรวจ').props.value).toBe('ความแท้: พบข้อสงสัย');
});

test('the inspect dock lists what is still missing before review', () => {
  render(<InspectorWorkView work={base({ order_status: 'INSPECTING', inspector_id: 9 })} actions={actions()} />);
  expect(screen.getByText(/ยังขาด: เลือกผลตรวจ/)).toBeTruthy();
  expect(disabled('ตรวจทานและบันทึกผล')).toBe(true);
});
