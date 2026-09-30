import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { InspectionScreen } from '@/components/inspection/connected-screens';

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockAuth: any;
let mockWork: any;
let mockParams: any;
let mockBuyerResult: any;
const mockService = {
  list: jest.fn(), detail: jest.fn(), receive: jest.fn(), start: jest.fn(),
  getBuyerResult: jest.fn(), decideBuyerInspection: jest.fn(), courierShipments: jest.fn(),
  privateImageSource: jest.fn(),
};
const mockApi = { service: mockService, token: 'current', call: (request: (token: string) => Promise<unknown>) => request('current') };
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'component-mutation-key') }));
jest.mock('@/auth/auth-provider', () => ({ useAuth: () => mockAuth }));
jest.mock('@/inspections/use-inspection-api', () => ({
  ...jest.requireActual('@/inspections/use-inspection-api'), useInspectionApi: () => mockApi,
}));
jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
  useLocalSearchParams: () => mockParams,
  Redirect: () => null,
  router: { push: (...args: any[]) => mockPush(...args), replace: (...args: any[]) => mockReplace(...args), canGoBack: () => false },
}));
beforeEach(() => {
  jest.clearAllMocks();
  mockAuth = { session: { user: { id: 'inspector-a' } }, account: { role: 'INSPECTOR', source: 'backend' } };
  mockParams = { inspectionId: '9' };
  mockWork = { id: 9, order_id: 42, order_status: 'SHIPPING_TO_CENTER', product: { name: 'Real API item' }, shipment: { carrier: 'Post', tracking_number: 'TRACK', courier_delivered_at: null }, result: null, evidence: [] };
  mockService.list.mockResolvedValue({ items: [mockWork], total: 1 });
  mockService.detail.mockImplementation(async () => mockWork);
  mockService.receive.mockImplementation(async () => { mockWork = { ...mockWork, order_status: 'RECEIVED_AT_CENTER' }; return mockWork; });
  mockService.start.mockImplementation(async () => { mockWork = { ...mockWork, order_status: 'INSPECTING' }; return mockWork; });
  mockBuyerResult = { order_id: 42, order_status: 'RESULT_NOTIFIED', result: 'PASS', summary: 'ผลตรวจตรงตามรายการ', inspected_at: '2026-09-28T00:00:00Z',
    evidence: [], certificate: { certificate_no: 'C-42', public_url: 'https://api.test/certificates/token', issued_at: '2026-09-28T00:00:00Z', status: 'ISSUED' },
    decision: null, can_decide: true, next_action: 'WAIT_BUYER_DECISION' };
  mockService.getBuyerResult.mockImplementation(async () => mockBuyerResult);
  mockService.decideBuyerInspection.mockImplementation(async () => {
    const savedDecision = { decision: 'CONFIRM', reason: null, decided_at: '2026-09-29T00:00:00Z' };
    mockBuyerResult = { ...mockBuyerResult, decision: savedDecision, can_decide: false, next_action: 'SHIP_TO_BUYER' };
    return { decision: savedDecision, next_action: 'SHIP_TO_BUYER' };
  });
  mockService.courierShipments.mockResolvedValue({ items: [], scope: 'pending', offset: 0, limit: 100, has_more: false, next_offset: null });
});
test('guest and buyer cannot load the Inspector queue', () => {
  mockAuth.session = null;
  const view = render(<InspectionScreen kind="queue" />);
  mockAuth.session = { user: { id: 'buyer' } }; mockAuth.account.role = 'BUYER';
  view.rerender(<InspectionScreen kind="queue" />);
  expect(mockService.list).not.toHaveBeenCalled();
});
test('queue reads authenticated API data and opens that work', async () => {
  render(<InspectionScreen kind="queue" />);
  expect(await screen.findByText('Real API item')).toBeTruthy();
  expect(mockService.list).toHaveBeenCalledWith('current', 0, undefined);
  fireEvent.press(screen.getByText('เปิดงานตรวจ'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/inspections/[inspectionId]', params: { inspectionId: 9 } });
});
test('receive waits for courier delivery, then real receive/start callbacks advance the work', async () => {
  render(<InspectionScreen kind="work" />);
  await screen.findByText('Real API item');
  expect(screen.getByRole('button', { name: 'รับสินค้าเข้าศูนย์' }).props.accessibilityState.disabled).toBe(true);
  mockWork = { ...mockWork, shipment: { ...mockWork.shipment, courier_delivered_at: '2026-09-28T00:00:00Z' } };
  fireEvent.press(screen.getByText('โหลดสถานะล่าสุด'));
  await waitFor(() => expect(screen.getByRole('button', { name: 'รับสินค้าเข้าศูนย์' }).props.accessibilityState.disabled).toBe(false));
  fireEvent.press(screen.getByText('รับสินค้าเข้าศูนย์'));
  await waitFor(() => expect(mockService.receive).toHaveBeenCalledWith('current', 9, null, expect.any(String)));
  await waitFor(() => expect(screen.getByRole('button', { name: 'เริ่มตรวจสินค้า' }).props.accessibilityState.disabled).toBe(false));
  fireEvent.press(screen.getByText('เริ่มตรวจสินค้า'));
  await screen.findByText('เพิ่มรูปหลักฐาน');
  expect(mockService.start).toHaveBeenCalledWith('current', 9, expect.any(String));
});

test('buyer result submits a confirmed decision and displays the saved decision and shipping next step', async () => {
  mockAuth.account.role = 'SELLER';
  mockParams = { orderId: '42' };
  render(<InspectionScreen kind="result" />);
  await screen.findByText('ผลตรวจตรงตามรายการ');
  fireEvent.press(screen.getByText('ยอมรับผลตรวจ'));
  fireEvent.press(screen.getByText('ยืนยันยอมรับผลตรวจ'));
  await waitFor(() => expect(mockService.decideBuyerInspection).toHaveBeenCalledWith('current', 42, { decision: 'CONFIRM' }));
  await waitFor(() => expect(mockService.getBuyerResult).toHaveBeenCalledTimes(2));
  expect(await screen.findByText('บันทึกคำตัดสิน: ยอมรับผลตรวจ')).toBeTruthy();
  expect(screen.getByText(/ขั้นตอนถัดไปคือจัดส่งสินค้าไปยังผู้ซื้อ/)).toBeTruthy();
  expect(screen.getByText(/ยังไม่ใช่การยืนยันว่าได้รับสินค้าแล้ว/)).toBeTruthy();
  expect(screen.queryByText('การตัดสินผลตรวจยังไม่พร้อมใช้งานสำหรับรายการนี้')).toBeNull();
});

test('Courier screen selects a queue scope and refreshes that scope from its first page', async () => {
  mockAuth.account.role = 'COURIER';
  mockParams = {};
  render(<InspectionScreen kind="courier" />);
  await waitFor(() => expect(mockService.courierShipments).toHaveBeenCalledWith('current', 'pending'));
  fireEvent.press(screen.getByText('ประวัติ'));
  await waitFor(() => expect(mockService.courierShipments).toHaveBeenCalledWith('current', 'history'));
  fireEvent.press(screen.getByText('โหลดงานล่าสุด'));
  await waitFor(() => expect(mockService.courierShipments.mock.calls.filter(call => call[1] === 'history')).toHaveLength(2));
});
