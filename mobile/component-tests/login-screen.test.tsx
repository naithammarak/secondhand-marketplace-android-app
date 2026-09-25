import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { LoginScreen } from '@/components/login-screen';
import { marketplaceReturn } from '@/auth/marketplace-return-instance';

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockAuth: any;
let mockVerification: any = { state: { record: null } };

jest.mock('expo-router', () => ({
  router: {
    push: (...args: any[]) => mockPush(...args),
    replace: (...args: any[]) => mockReplace(...args),
  },
}));
jest.mock('@/auth/auth-provider', () => ({ useAuth: () => mockAuth }));
jest.mock('@/verification/verification-provider', () => ({
  useVerification: () => mockVerification,
}));

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
  mockVerification = { state: { record: null } };
});

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

test('browsing without login cancels the saved purchase destination', async () => {
  await marketplaceReturn.save({ kind: 'checkout', productId: 42 });
  mockAuth = newUserAuth({ session: null, account: null });
  render(<LoginScreen />);
  fireEvent.press(screen.getByRole('button', { name: 'ดูสินค้าก่อน' }));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  expect(await marketplaceReturn.consume()).toBeNull();
});

test('waits for account verification before showing first-role choices', async () => {
  mockAuth = newUserAuth({ account: null, accountChecking: true });
  await render(<LoginScreen />);

  expect(screen.getByLabelText('กำลังตรวจสอบบัญชี')).toBeTruthy();
  expect(screen.queryByText('ผู้ซื้อ')).toBeNull();
});

test.each([
  ['ผู้ซื้อ', 'BUYER', 'บทบาทผู้ซื้อ'],
  ['ผู้ขาย', 'SELLER', 'บทบาทผู้ขาย'],
] as const)('selects %s, confirms it, and welcomes with the backend result', async (label, role, roleLabel) => {
  const view = await render(<LoginScreen />);
  const confirm = screen.getByRole('button', { name: 'ยืนยันบทบาท' });
  expect(confirm.props.accessibilityState?.disabled ?? confirm.props.disabled).toBeTruthy();

  await fireEvent.press(screen.getByRole('radio', { name: label }));
  await fireEvent.press(screen.getByRole('button', { name: 'ยืนยันบทบาท' }));
  expect(mockAuth.selectRole).toHaveBeenCalledWith(role);

  mockAuth.account = { fullName: 'สมใจ ซื้อดี', role, source: 'backend' };
  await view.rerender(<LoginScreen />);
  expect(screen.getByText('ยินดีต้อนรับ สมใจ ซื้อดี')).toBeTruthy();
  expect(screen.getByText(roleLabel)).toBeTruthy();
  expect(screen.queryByText('เลือกบทบาทของคุณ')).toBeNull();
});

test('keeps the role page actionable after a save failure', async () => {
  mockAuth = newUserAuth({ roleError: 'network-error' });
  await render(<LoginScreen />);

  await fireEvent.press(screen.getByRole('radio', { name: 'ผู้ซื้อ' }));
  expect(screen.getByText('เชื่อมต่อเพื่อบันทึกบทบาทไม่ได้ กรุณาลองใหม่')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'ลองบันทึกอีกครั้ง' }));
  expect(mockAuth.selectRole).toHaveBeenCalledWith('BUYER');
});

test('an existing admin skips role selection and can log out', async () => {
  mockAuth = newUserAuth({
    account: { fullName: null, role: 'ADMIN', source: 'backend' },
  });
  await render(<LoginScreen />);

  expect(screen.getByText('ยินดีต้อนรับ')).toBeTruthy();
  expect(screen.getByText('บทบาทผู้ดูแลระบบ')).toBeTruthy();
  expect(screen.queryByText('เลือกบทบาทของคุณ')).toBeNull();
  expect(screen.getByText('ตรวจคำขอยืนยันตัวตน')).toBeTruthy();
  await fireEvent.press(screen.getByText('ออกจากระบบ'));
  await waitFor(() => expect(mockAuth.logout).toHaveBeenCalledTimes(1));
});

test('mock account cannot report a successful role save', async () => {
  mockAuth = newUserAuth({
    account: { fullName: null, role: null, source: 'mock' },
  });
  await render(<LoginScreen />);

  expect(screen.getByText('บริการบัญชียังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'ยืนยันบทบาท' }).props.accessibilityState.disabled).toBeTruthy();
});

test('shows "ลงขายสินค้า" button and navigates to /product/new when seller is APPROVED', async () => {
  mockVerification = { state: { record: { status: 'APPROVED' } } };
  mockAuth = newUserAuth({
    account: { fullName: 'แม่ค้าใจดี', role: 'SELLER', source: 'backend' },
  });
  await render(<LoginScreen />);

  const postProductBtn = screen.getByRole('button', { name: 'ลงขายสินค้า' });
  expect(postProductBtn).toBeTruthy();
  await fireEvent.press(postProductBtn);
  expect(mockPush).toHaveBeenCalledWith('/product/new');
  await fireEvent.press(screen.getByRole('button', { name: 'สินค้าของฉัน' }));
  expect(mockPush).toHaveBeenCalledWith('/product/mine');
});

test('does not show "ลงขายสินค้า" button when seller is not APPROVED', async () => {
  mockVerification = { state: { record: { status: 'PENDING' } } };
  mockAuth = newUserAuth({
    account: { fullName: 'แม่ค้าใจดี', role: 'SELLER', source: 'backend' },
  });
  await render(<LoginScreen />);

  expect(screen.queryByRole('button', { name: 'ลงขายสินค้า' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'สินค้าของฉัน' })).toBeNull();
});
