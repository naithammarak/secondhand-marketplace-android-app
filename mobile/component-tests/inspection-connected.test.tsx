import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { InspectionScreen } from '@/components/inspection/connected-screens';

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockAuth: any;
let mockWork: any;
const mockService = {
  list: jest.fn(), detail: jest.fn(), receive: jest.fn(), start: jest.fn(),
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
  useLocalSearchParams: () => ({ inspectionId: '9' }),
  Redirect: () => null,
  router: { push: (...args: any[]) => mockPush(...args), replace: (...args: any[]) => mockReplace(...args), canGoBack: () => false },
}));
beforeEach(() => {
  jest.clearAllMocks();
  mockAuth = { session: { user: { id: 'inspector-a' } }, account: { role: 'INSPECTOR', source: 'backend' } };
  mockWork = { id: 9, order_id: 42, order_status: 'SHIPPING_TO_CENTER', product: { name: 'Real API item' }, shipment: { carrier: 'Post', tracking_number: 'TRACK', courier_delivered_at: null }, result: null, evidence: [] };
  mockService.list.mockResolvedValue({ items: [mockWork], total: 1 });
  mockService.detail.mockImplementation(async () => mockWork);
  mockService.receive.mockImplementation(async () => { mockWork = { ...mockWork, order_status: 'RECEIVED_AT_CENTER' }; return mockWork; });
  mockService.start.mockImplementation(async () => { mockWork = { ...mockWork, order_status: 'INSPECTING' }; return mockWork; });
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
