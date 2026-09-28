import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ProfileScreen } from '@/components/profile-screen';
const mockPush = jest.fn();
let mockAuth: any;
let mockState: any;
const mockStore = { refresh: jest.fn() };
jest.mock('expo-router', () => ({ useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]), router: { push: (...args: any[]) => mockPush(...args) } }));
jest.mock('@/auth/auth-provider', () => ({ useAuth: () => mockAuth }));
jest.mock('@/verification/verification-provider', () => ({ useVerification: () => ({ state: mockState, store: mockStore }) }));
beforeEach(() => {
  jest.clearAllMocks();
  mockAuth = { session: { user: { id: 'buyer' } }, account: { fullName: 'สมใจ', role: 'BUYER', source: 'backend' }, retryAccount: jest.fn(), logout: jest.fn() };
  mockState = { owner: 'buyer', record: { status: 'NOT_SUBMITTED' }, loadError: null };
});
test('guest has 3 tabs and Google entry without private data', () => {
  mockAuth.session = null;
  render(<ProfileScreen />);
  expect(screen.getAllByRole('tab')).toHaveLength(3);
  expect(screen.queryByText('สมใจ')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'เข้าสู่ระบบด้วย Google' }));
  expect(mockPush).toHaveBeenCalledWith('/login');
});
test('Buyer opens application, with no role selector or fake seller tools', () => {
  render(<ProfileScreen />);
  fireEvent.press(screen.getByRole('button', { name: 'ขอเปิดร้านค้า' }));
  expect(mockPush).toHaveBeenCalledWith('/seller-verification');
  expect(screen.queryByText('ลงขายสินค้า')).toBeNull();
  expect(mockAuth.retryAccount).toHaveBeenCalledTimes(1);
});
test('approved Seller has separate purchases and sales', () => {
  mockAuth.account.role = 'SELLER'; mockState.record = { status: 'APPROVED', shopName: 'วนดี' };
  render(<ProfileScreen />);
  fireEvent.press(screen.getByRole('button', { name: 'คำสั่งซื้อของฉัน' }));
  fireEvent.press(screen.getByRole('button', { name: 'คำสั่งขาย' }));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/orders', params: { view: 'buyer' } });
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/orders', params: { view: 'seller' } });
  expect(screen.getByRole('button', { name: 'ลงขายสินค้า' })).toBeTruthy();
});
test('stale approval from another owner cannot reveal shop or sell controls', () => {
  mockAuth.account.role = 'SELLER'; mockState.owner = 'other'; mockState.record = { status: 'APPROVED', shopName: 'PRIVATE' };
  render(<ProfileScreen />);
  expect(screen.queryByText('PRIVATE')).toBeNull();
  expect(screen.queryByText('ลงขายสินค้า')).toBeNull();
});
test('approval on Buyer does not optimistically promote the account', () => {
  mockState.record.status = 'APPROVED';
  render(<ProfileScreen />);
  expect(screen.queryByText('ลงขายสินค้า')).toBeNull();
});
test.each([['ADMIN','ตรวจคำขอยืนยันตัวตน','/admin-verifications'], ['INSPECTOR','งานตรวจสินค้า','/inspections']])('%s has its existing staff entry', (role, label, path) => {
  mockAuth.account.role = role;
  render(<ProfileScreen />);
  fireEvent.press(screen.getByRole('button', { name: label }));
  expect(mockPush).toHaveBeenCalledWith(path);
  expect(screen.queryByText('ขอเปิดร้านค้า')).toBeNull();
});
test('logout uses the auth provider and clears the saved return', async () => {
  render(<ProfileScreen />);
  fireEvent.press(screen.getByRole('button', { name: 'ออกจากระบบ' }));
  await waitFor(() => expect(mockAuth.logout).toHaveBeenCalledTimes(1));
});
