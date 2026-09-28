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
