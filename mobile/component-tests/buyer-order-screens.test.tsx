import { fireEvent, render, screen } from '@testing-library/react-native';
import { BuyerOrderScreen, BuyerProfileScreen } from '@/components/buyer-order-screens';
import { initialOrderDetailState } from '@/orders/order-detail-store';

const mockPush = jest.fn();
const mockAuth = { initializing: false, session: { user: { id: 'buyer' } },
  account: { fullName: 'ผู้ซื้อทดสอบ' }, retryAccount: jest.fn(), logout: jest.fn() };
const mockStore = { open: jest.fn(), refresh: jest.fn(), cancel: jest.fn() };
let mockState: any;
jest.mock('expo-router', () => ({ router: { push: (...args: any[]) => mockPush(...args) } }));
jest.mock('@/auth/auth-provider', () => ({ useAuth: () => mockAuth }));
jest.mock('@/orders/orders-provider', () => ({ useOrderDetail: () => ({ state: mockState, store: mockStore }) }));
jest.mock('@/components/marketplace-header', () => ({ MarketplaceHeader: () => null }));
jest.mock('@/components/marketplace-nav', () => ({ MarketplaceNav: () => null }));

beforeEach(() => {
  jest.clearAllMocks();
  mockState = { ...initialOrderDetailState, owner: 'buyer', orderId: 42, order: {
    id: 42, product: { name: 'สินค้าจริง' }, status: 'WAITING_PAYMENT', paymentStatus: 'UNPAID',
    amounts: { totalAmount: '1200.00' }, canCancel: true, receiptNo: null,
    expiresAt: '2026-10-01T00:00:00Z',
  } };
});

test('pending order displays unpaid status, cancellation and refresh without payment or receipt', () => {
  render(<BuyerOrderScreen orderId={42} />);
  expect(mockStore.open).toHaveBeenCalledWith(42);
  expect(screen.getByText('สร้างคำสั่งซื้อแล้ว • ยังไม่ชำระเงิน')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'ชำระเงิน' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'ดูใบเสร็จ' })).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'ยกเลิกคำสั่งซื้อ' }));
  expect(mockStore.cancel).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByRole('button', { name: 'รีเฟรชคำสั่งซื้อ' }));
  expect(mockStore.refresh).toHaveBeenCalledTimes(1);
});

test('account change does not display the previous buyer order', () => {
  mockState.owner = 'another-buyer';
  render(<BuyerOrderScreen orderId={42} />);
  expect(screen.queryByText('สินค้าจริง')).toBeNull();
  expect(screen.queryByRole('button', { name: 'ยกเลิกคำสั่งซื้อ' })).toBeNull();
});

test('buyer profile supports orders and sign out without seller capabilities', () => {
  render(<BuyerProfileScreen />);
  fireEvent.press(screen.getByRole('button', { name: 'คำสั่งซื้อของฉัน' }));
  expect(mockPush).toHaveBeenCalledWith('/orders');
  fireEvent.press(screen.getByRole('button', { name: 'ออกจากระบบ' }));
  expect(mockAuth.logout).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('ขอเปิดร้านค้า')).toBeNull();
});
