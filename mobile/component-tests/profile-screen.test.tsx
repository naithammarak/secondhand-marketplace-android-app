import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ProfileScreen } from '@/components/profile-screen';
const mockPush = jest.fn();
let mockAuth: any;
let mockState: any;
const mockStore = { refresh: jest.fn() };
let mockProfile: any;
jest.mock('@/profile/use-profile', () => ({ useProfile: () => ({ profile: mockProfile, busy: false, error: null, reload: jest.fn(), save: jest.fn(), acknowledge: jest.fn() }) }));
jest.mock('expo-router', () => ({ useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]), router: { push: (...args: any[]) => mockPush(...args) } }));
jest.mock('@/auth/auth-provider', () => ({ useAuth: () => mockAuth }));
jest.mock('@/verification/verification-provider', () => ({ useVerification: () => ({ state: mockState, store: mockStore }) }));
beforeEach(() => {
  jest.clearAllMocks();
  mockProfile = null;
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
  expect(screen.getByText('คำขอร้านได้รับอนุมัติแล้ว')).toBeTruthy();
  fireEvent.press(screen.getByText('ตรวจสอบสิทธิ์ผู้ขายอีกครั้ง'));
  expect(mockPush).not.toHaveBeenCalled();
});
test.each([['ADMIN','ตรวจคำขอยืนยันตัวตน','/admin-verifications'], ['ADMIN','มอบหมายผู้ขนส่ง','/admin-deliveries'], ['INSPECTOR','งานตรวจสินค้า','/inspections'], ['COURIER','งานส่งเข้าศูนย์','/courier']])('%s has its existing staff entry', (role, label, path) => {
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

test('unknown verification is shown as retryable error instead of a fresh application', () => {
  mockState.record = null; mockState.loadError = 'network-error';
  render(<ProfileScreen />);
  expect(screen.queryByRole('button', { name: 'ขอเปิดร้านค้า' })).toBeNull();
  expect(screen.getByText('โหลดสถานะคำขอผู้ขายไม่สำเร็จ')).toBeTruthy();
});

test('inactive account can read profile but cannot save or open seller application', () => {
  mockProfile = { id: 1, full_name: 'Suspended', email: 's@example.test', role: 'BUYER', status: 'SUSPENDED' };
  render(<ProfileScreen />);
  expect(screen.getByRole('button', { name: 'บันทึกชื่อ' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'ขอเปิดร้านค้า' })).toBeNull();
});
