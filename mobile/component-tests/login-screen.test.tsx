import { fireEvent, render, screen } from '@testing-library/react-native';

import { LoginScreen } from '@/components/login-screen';

const mockPush = jest.fn();
let mockAuth: any;
let mockVerification: any = { state: { record: null } };

jest.mock('expo-router', () => ({
  router: {
    push: (...args: any[]) => mockPush(...args),
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

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth = newUserAuth();
  mockVerification = { state: { record: null } };
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
  expect(mockAuth.logout).toHaveBeenCalledTimes(1);
});

test('mock account cannot report a successful role save', async () => {
  mockAuth = newUserAuth({
    account: { fullName: null, role: null, source: 'mock' },
  });
  await render(<LoginScreen />);

  expect(screen.getByText('กำลังใช้ผลจำลอง /me จนกว่า Backend จะพร้อม')).toBeTruthy();
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


describe('ทางเข้าซื้อด้วยรหัสสินค้า (ORDER-04, D-16)', () => {
  const buyerAuth = () =>
    newUserAuth({ account: { fullName: 'สมใจ ซื้อดี', role: 'BUYER', source: 'backend' } });

  test('ซ่อนไว้เป็นค่าตั้งต้น แม้ผู้ใช้จะเป็นผู้ซื้อ', async () => {
    mockAuth = buyerAuth();
    await render(<LoginScreen />);

    expect(screen.getByLabelText('ไปหน้าคำสั่งซื้อ')).toBeTruthy();
    expect(screen.queryByLabelText('ซื้อสินค้าด้วยรหัสสินค้า')).toBeNull();
  });

  test('แสดงเฉพาะ build พัฒนาที่เปิด flag ไว้', async () => {
    const previous = process.env.EXPO_PUBLIC_ORDER_DIRECT_ID_ENTRY;
    process.env.EXPO_PUBLIC_ORDER_DIRECT_ID_ENTRY = 'true';
    mockAuth = buyerAuth();
    try {
      await render(<LoginScreen />);
      await fireEvent.press(screen.getByLabelText('ซื้อสินค้าด้วยรหัสสินค้า'));
      expect(mockPush).toHaveBeenCalledWith('/buy-by-product-id');
    } finally {
      if (previous === undefined) delete process.env.EXPO_PUBLIC_ORDER_DIRECT_ID_ENTRY;
      else process.env.EXPO_PUBLIC_ORDER_DIRECT_ID_ENTRY = previous;
    }
  });
});
