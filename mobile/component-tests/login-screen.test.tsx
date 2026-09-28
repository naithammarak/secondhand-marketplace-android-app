import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { LoginScreen } from '@/components/login-screen';
import { marketplaceReturn } from '@/auth/marketplace-return-instance';

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockAuth: any;

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
  router: {
    push: (...args: any[]) => mockPush(...args),
    replace: (...args: any[]) => mockReplace(...args),
  },
}));
jest.mock('@/auth/auth-provider', () => ({ useAuth: () => mockAuth }));

function newUserAuth(overrides: Record<string, unknown> = {}) {
  return {
    initializing: false,
    session: { user: { id: 'user-1' } },
    account: { fullName: 'สมใจ ซื้อดี', role: null, source: 'backend' },
    accountChecking: false,
    accountError: null,
    roleSaving: false,
    roleError: null,
    loginAdapter: undefined,
    selectRole: jest.fn(),
    retryAccount: jest.fn(),
    logout: jest.fn(),
    ...overrides,
  };
}

beforeEach(async () => {
  await marketplaceReturn.clear();
  jest.clearAllMocks();
  mockAuth = newUserAuth();
});

afterEach(() => jest.restoreAllMocks());

test('returns to checkout after backend role verification, never while checking', async () => {
  await marketplaceReturn.save({ kind: 'checkout', productId: 42 });
  mockAuth = newUserAuth({ accountChecking: true });
  const view = render(<LoginScreen />);
  expect(mockReplace).not.toHaveBeenCalled();
  mockAuth = newUserAuth({ account: { fullName: null, role: 'BUYER', source: 'backend' } });
  view.rerender(<LoginScreen />);
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({ pathname: '/checkout/[productId]', params: { productId: '42' } }));
  expect(await marketplaceReturn.consume()).toBeNull();
});

test('keeps checkout destination when the same user session refreshes during storage read', async () => {
  await marketplaceReturn.save({ kind: 'checkout', productId: 42 });
  mockAuth = newUserAuth({ account: { fullName: null, role: 'BUYER', source: 'backend' } });
  const saved = await AsyncStorage.getItem('marketplace.return.v1');
  let release!: (value: string | null) => void;
  const getItem = jest.spyOn(AsyncStorage, 'getItem');
  getItem.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const view = render(<LoginScreen />);
  await waitFor(() => expect(release).toBeDefined());
  mockAuth = { ...mockAuth, session: { user: { id: 'user-1' }, access_token: 'refreshed' } };
  view.rerender(<LoginScreen />);
  await act(async () => { release(saved); await marketplaceReturn.consume(); });
  expect(mockReplace).toHaveBeenCalledWith({ pathname: '/checkout/[productId]', params: { productId: '42' } });
});

test('cancelled Google login clears the saved checkout destination', async () => {
  await marketplaceReturn.save({ kind: 'checkout', productId: 42 });
  mockAuth = newUserAuth({
    session: null,
    account: null,
    loginAdapter: { run: async () => 'cancelled' },
  });
  render(<LoginScreen />);
  fireEvent.press(screen.getByRole('button', { name: 'เข้าสู่ระบบด้วย Google' }));
  await waitFor(() => expect(screen.getByText(/ยกเลิกการเข้าสู่ระบบแล้ว/)).toBeTruthy());
  expect(await marketplaceReturn.consume()).toBeNull();
});

test('browsing without login cancels the saved purchase destination', async () => {
  await marketplaceReturn.save({ kind: 'checkout', productId: 42 });
  mockAuth = newUserAuth({ session: null, account: null });
  render(<LoginScreen />);
  fireEvent.press(screen.getByRole('button', { name: 'ดูสินค้าก่อน' }));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  expect(await marketplaceReturn.consume()).toBeNull();
});

test('waits for the backend and never offers self-selection of Seller', () => {
  mockAuth = newUserAuth({ account: null, accountChecking: true });
  render(<LoginScreen />);
  expect(screen.getByLabelText('กำลังตรวจสอบบัญชี')).toBeTruthy();
  expect(screen.queryByRole('radio')).toBeNull();
  expect(screen.queryByRole('button', { name: 'ไปที่โปรไฟล์' })).toBeNull();
});

test.each(['backend', 'mock'])('null role from %s is unavailable and preserves the return destination', async source => {
  await marketplaceReturn.save({ kind: 'checkout', productId: 42 });
  mockAuth = newUserAuth({ account: { role: null, source } });
  render(<LoginScreen />);
  expect(screen.getByText('บริการบัญชียังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'อัปเดตบัญชี' }));
  expect(mockAuth.retryAccount).toHaveBeenCalledTimes(1);
  expect(mockAuth.selectRole).not.toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
  expect(await marketplaceReturn.peek()).toEqual({ kind: 'checkout', productId: 42 });
});

test.each(['BUYER', 'SELLER', 'ADMIN', 'INSPECTOR'])('verified %s can open the profile', role => {
  mockAuth = newUserAuth({ account: { role, source: 'backend' } });
  render(<LoginScreen />);
  fireEvent.press(screen.getByRole('button', { name: 'ไปที่โปรไฟล์' }));
  expect(mockReplace).toHaveBeenCalledWith('/profile');
  expect(mockAuth.selectRole).not.toHaveBeenCalled();
});
