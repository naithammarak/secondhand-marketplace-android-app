import { fireEvent, render, screen } from '@testing-library/react-native';
import { OrdersListScreen } from '@/components/orders-list-screen';

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
  expect(screen.getByRole('button', { name: 'ดูรายละเอียด' })).toBeTruthy();
});
test('result notification does not claim that every result has a certificate', () => {
  mockState.items[0].status = 'RESULT_NOTIFIED';
  mockState.items[0].paymentStatus = 'PAID';
  render(<OrdersListScreen />);
  expect(screen.getByText('แจ้งผลการตรวจแล้ว')).toBeTruthy();
  expect(screen.queryByText(/ออกใบรับรอง/)).toBeNull();
});
test.each(['CANCELLED', 'UNKNOWN'])('%s unpaid orders open details without offering payment', (status) => {
  mockState.items[0].status = status;
  render(<OrdersListScreen />);
  expect(screen.queryByRole('button', { name: 'ชำระเงิน' })).toBeNull();
  expect(screen.getByText(status === 'CANCELLED' ? 'ยกเลิกแล้ว' : 'สถานะอื่น ๆ กรุณาอัปเดตแอปเพื่อดูรายละเอียด')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'ดูรายละเอียด' }));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/orders/[orderId]', params: { orderId: '42' } });
});
test('sellers cannot see a payment action on unpaid orders', () => {
  mockState.items[0].viewerRole = 'seller';
  mockState.items[0].sellerPayout = '190.00';
  render(<OrdersListScreen />);
  expect(screen.queryByRole('button', { name: 'ชำระเงิน' })).toBeNull();
  expect(screen.getByRole('button', { name: 'ดูรายละเอียด' })).toBeTruthy();
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
  expect(screen.getByText(/⏱ เหลือเวลาชำระ 1[45]:\d\d/)).toBeTruthy();
});

test('displays expired text when WAITING_PAYMENT order deadline has passed', () => {
  const pastDeadline = new Date(Date.now() - 5000).toISOString();
  mockState.items[0].expiresAt = pastDeadline;
  render(<OrdersListScreen />);
  expect(screen.getByText('⏱ หมดเวลาชำระเงิน')).toBeTruthy();
});

test('displays seller countdown label for seller WAITING_PAYMENT order', () => {
  const futureDeadline = new Date(Date.now() + 20 * 60 * 1000).toISOString();
  mockState.items[0].viewerRole = 'seller';
  mockState.items[0].expiresAt = futureDeadline;
  render(<OrdersListScreen />);
  expect(screen.getByText(/⏱ ผู้ซื้อต้องชำระภายใน 19:\d\d|⏱ ผู้ซื้อต้องชำระภายใน 20:00/)).toBeTruthy();
});

test('RESULT_NOTIFIED with failed inspection displays failed badge and action to choose', () => {
  mockState.items[0].id = 37;
  mockState.items[0].status = 'RESULT_NOTIFIED';
  mockState.items[0].inspectionResult = 'NOT_AS_DESCRIBED';
  render(<OrdersListScreen />);
  expect(screen.getByText('🟠 ไม่ตรงตามประกาศ')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'ดูผลตรวจและเลือก' })).toBeTruthy();
});

test('RETURNING_TO_SELLER and REFUNDED display return badges and seller relist action', () => {
  mockState.items[0].status = 'RETURNING_TO_SELLER';
  const view = render(<OrdersListScreen />);
  expect(screen.getByText('กำลังส่งคืนผู้ขาย')).toBeTruthy();

  mockState.items[0].status = 'REFUNDED';
  mockState.items[0].viewerRole = 'seller';
  mockState.items[0].product.name = 'แจ็คเก็ตหนัง Zara';
  view.rerender(<OrdersListScreen />);
  expect(screen.getByText('คืนเงินแล้ว')).toBeTruthy();
  const relistBtn = screen.getByRole('button', { name: 'ลงขายอีกครั้ง' });
  expect(relistBtn).toBeTruthy();
  fireEvent.press(relistBtn);
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/product/new',
    params: {
      relistOrderId: '42',
      relistName: 'แจ็คเก็ตหนัง Zara',
      relistReason: 'fail',
    },
  });
});


test('buyer-orders runtime opens unpaid details without offering payment or seller views', () => {
  process.env.EXPO_PUBLIC_BUYER_ORDERS = 'true';
  try {
    render(<OrdersListScreen />);
    expect(screen.queryByRole('button', { name: 'ชำระเงิน' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'คำสั่งซื้อร้านของฉัน' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'ดูรายละเอียด' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/orders/[orderId]', params: { orderId: '42' } });
  } finally { delete process.env.EXPO_PUBLIC_BUYER_ORDERS; }
});
