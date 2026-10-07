import { fireEvent, render, screen } from '@testing-library/react-native';
import { OrdersListScreen, matchesFilter } from '@/components/orders-list-screen';

const mockPush = jest.fn();
const mockStore = { load: jest.fn(), refresh: jest.fn(), loadMore: jest.fn(), hasMore: () => false, setView: jest.fn() };
let mockState: any;
jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]), useLocalSearchParams: () => ({}), useRouter: () => ({ push: mockPush }), router: { replace: jest.fn() } }));
jest.mock('@/auth/auth-provider', () => ({ useAuth: () => ({ session: { user: { id: 'buyer-test' } }, account: { role: 'BUYER', source: 'backend' } }) }));
jest.mock('@/orders/orders-provider', () => ({ useOrdersList: () => ({ state: mockState, store: mockStore }) }));
beforeEach(() => {
  jest.clearAllMocks();
  mockState = { view: 'buyer', owner: 'buyer-test', loaded: true, refreshing: false, items: [{ id: 42, status: 'WAITING_PAYMENT',
    paymentStatus: 'UNPAID', viewerRole: 'buyer', totalAmount: '250.00', sellerPayout: null,
    createdAt: null, product: { id: 7, name: 'สินค้าทดสอบ', condition: 'GOOD', size: 'M' } }] };
});
test('an unpaid order opens its real detail for payment', () => {
  render(<OrdersListScreen />);
  expect(screen.getByText('รอชำระเงิน')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'ชำระเงิน' }));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/orders/[orderId]', params: { orderId: '42' } });
});
test('paid orders have no payment action', () => {
  mockState.items[0].paymentStatus = 'PAID';
  mockState.items[0].status = 'WAITING_SELLER_SHIP';
  render(<OrdersListScreen />);
  expect(screen.queryByRole('button', { name: 'ชำระเงิน' })).toBeNull();
  expect(screen.getByRole('button', { name: 'คำสั่งซื้อ #42 สินค้าทดสอบ' })).toBeTruthy();
});
test('result notification does not claim that every result has a certificate', () => {
  mockState.items[0].status = 'RESULT_NOTIFIED';
  mockState.items[0].paymentStatus = 'PAID';
  render(<OrdersListScreen />);
  expect(screen.getByText(/แจ้งผลตรวจแล้ว เปิดเพื่อดูผล/)).toBeTruthy();
  expect(screen.queryByText(/ออกใบรับรอง/)).toBeNull();
});
test.each(['CANCELLED', 'UNKNOWN'])('%s unpaid orders open details without offering payment', (status) => {
  mockState.items[0].status = status;
  render(<OrdersListScreen />);
  expect(screen.queryByRole('button', { name: 'ชำระเงิน' })).toBeNull();
  expect(screen.getByText(status === 'CANCELLED' ? 'ยกเลิกแล้ว' : 'สถานะอื่น ๆ กรุณาอัปเดตแอปเพื่อดูรายละเอียด')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'คำสั่งซื้อ #42 สินค้าทดสอบ' }));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/orders/[orderId]', params: { orderId: '42' } });
});
test('sellers cannot see a payment action on unpaid orders', () => {
  mockState.items[0].viewerRole = 'seller';
  mockState.items[0].sellerPayout = '190.00';
  render(<OrdersListScreen />);
  expect(screen.queryByRole('button', { name: 'ชำระเงิน' })).toBeNull();
  expect(screen.getByRole('button', { name: 'คำสั่งซื้อ #42 สินค้าทดสอบ' })).toBeTruthy();
});
test('does not render another account orders during an account transition', () => {
  mockState.owner = 'another-account';
  render(<OrdersListScreen />);
  expect(screen.queryByText('สินค้าทดสอบ')).toBeNull();
});

test('does not render explicit refresh button and triggers refresh on pull-to-refresh', () => {
  render(<OrdersListScreen />);
  expect(screen.queryByRole('button', { name: 'รีเฟรช' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'กำลังรีเฟรช' })).toBeNull();

  const flatList = screen.getByTestId('orders-flatlist');
  const { refreshControl } = flatList.props;
  expect(refreshControl).toBeTruthy();
  refreshControl.props.onRefresh();
  expect(mockStore.refresh).toHaveBeenCalled();
});

test('displays dynamic countdown for active WAITING_PAYMENT order', () => {
  const futureDeadline = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  mockState.items[0].expiresAt = futureDeadline;
  render(<OrdersListScreen />);
  expect(screen.getByText(/^เหลือเวลาชำระ 1[45]:\d\d$/)).toBeTruthy();
});

test('displays expired text when WAITING_PAYMENT order deadline has passed', () => {
  const pastDeadline = new Date(Date.now() - 5000).toISOString();
  mockState.items[0].expiresAt = pastDeadline;
  render(<OrdersListScreen />);
  expect(screen.getByText('หมดเวลาชำระเงิน กำลังตรวจสถานะล่าสุด')).toBeTruthy();
});

test('displays seller countdown label for seller WAITING_PAYMENT order', () => {
  const futureDeadline = new Date(Date.now() + 20 * 60 * 1000).toISOString();
  mockState.items[0].viewerRole = 'seller';
  mockState.items[0].expiresAt = futureDeadline;
  render(<OrdersListScreen />);
  expect(screen.getByText(/^ผู้ซื้อต้องชำระภายใน (19:\d\d|20:00)$/)).toBeTruthy();
});

test('RESULT_NOTIFIED shows a neutral server status label, never a guessed pass/fail badge', () => {
  mockState.items[0].status = 'RESULT_NOTIFIED';
  mockState.items[0].inspectionResult = 'NOT_AS_DESCRIBED'; // unknown field must be ignored
  render(<OrdersListScreen />);
  expect(screen.getByText('แจ้งผลตรวจแล้ว')).toBeTruthy();
  expect(screen.queryByText('🟠 ไม่ตรงตามประกาศ')).toBeNull();
  expect(screen.queryByText('🛡️ ตรวจรับรองแล้ว (PASS)')).toBeNull();
});

test('REFUNDED and RETURNED_TO_SELLER use server status labels without a relist action', () => {
  mockState.items[0].status = 'RETURNED_TO_SELLER';
  mockState.items[0].viewerRole = 'seller';
  const view = render(<OrdersListScreen />);
  expect(screen.getByText('รับคืนแล้ว กำลังดำเนินการคืนเงินให้ผู้ซื้อ')).toBeTruthy();
  mockState.items[0].status = 'REFUNDED';
  view.rerender(<OrdersListScreen />);
  expect(screen.getByText('คืนเงินแล้ว')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'ลงขายอีกครั้ง' })).toBeNull();
  expect(mockPush).not.toHaveBeenCalled();
});

test('every known status is reachable from a filter chip, not only from "all"', () => {
  const statuses = ['WAITING_PAYMENT', 'WAITING_SELLER_SHIP', 'SHIPPING_TO_CENTER', 'RECEIVED_AT_CENTER', 'INSPECTING',
    'RESULT_NOTIFIED', 'SHIPPING_TO_BUYER', 'DELIVERED_PENDING_BUYER', 'DELIVERY_DISPUTED', 'RETURNED_TO_SELLER',
    'COMPLETED', 'RETURNING_TO_SELLER', 'REFUNDED', 'RETURNED', 'CANCELLED'];
  const buyerKeys = ['WP', 'CONF', 'PROG', 'DONE', 'CXR'] as const;
  const sellerKeys = ['SHIP', 'WP', 'PROGS', 'DONE', 'CXR'] as const;
  for (const status of statuses) {
    const item = { ...mockState.items[0], status };
    expect(buyerKeys.some(key => matchesFilter(item, key))).toBe(true);
    expect(sellerKeys.some(key => matchesFilter(item, key))).toBe(true);
  }
  // รับคืนแล้วแต่ยังไม่คืนเงิน ต้องไม่อยู่ในหมวดคืนเงินแล้ว
  expect(matchesFilter({ ...mockState.items[0], status: 'RETURNED_TO_SELLER' }, 'CXR')).toBe(false);
});

test('a buyer account has no shop-orders switch and the chip label matches its statuses', () => {
  render(<OrdersListScreen />);
  expect(screen.queryByRole('tab', { name: 'คำสั่งซื้อร้านของฉัน' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'ปิด' })).toBeNull();
  expect(screen.getByRole('tab', { name: 'รอคุณตรวจสอบ (0)' })).toBeTruthy();
  expect(mockStore.setView).toHaveBeenCalledWith('buyer');
});

test('delivered orders are counted under the buyer action chip', () => {
  mockState.items[0].status = 'DELIVERED_PENDING_BUYER';
  mockState.items[0].paymentStatus = 'PAID';
  render(<OrdersListScreen />);
  expect(screen.getByRole('tab', { name: 'รอคุณตรวจสอบ (1)' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'ดูสถานะจัดส่ง' })).toBeTruthy();
});
