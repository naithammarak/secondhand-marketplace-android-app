import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { SellerVerificationScreen } from '@/components/seller-verification-screen';
import * as pickIdCardModule from '@/verification/pick-id-card';

const mockBack = jest.fn();
let mockAuth: any;
let mockVerificationState: any;
let mockVerificationStore: any;

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  Redirect: ({ href }: { href: string }) => null,
}));

jest.mock('@/auth/auth-provider', () => ({
  useAuth: () => mockAuth,
}));

jest.mock('@/verification/verification-provider', () => ({
  useVerification: () => ({
    state: mockVerificationState,
    store: mockVerificationStore,
  }),
}));

function newAuth(overrides: Record<string, unknown> = {}) {
  return {
    session: { user: { id: 'seller-1' } },
    account: { fullName: 'ผู้ขาย สมหมาย', role: 'SELLER', source: 'backend' },
    accountChecking: false,
    accountError: null,
    retryAccount: jest.fn(),
    ...overrides,
  };
}

function newVerificationState(overrides: Record<string, unknown> = {}) {
  return {
    owner: 'seller-1',
    loading: false,
    refreshing: false,
    record: null,
    loadError: null,
    submitting: false,
    submitError: null,
    fieldErrors: {},
    ...overrides,
  };
}

function newVerificationStore(overrides: Record<string, unknown> = {}) {
  return {
    load: jest.fn().mockResolvedValue(undefined),
    refresh: jest.fn().mockResolvedValue(undefined),
    retry: jest.fn().mockResolvedValue(undefined),
    clearFieldError: jest.fn(),
    submit: jest.fn().mockResolvedValue(undefined),
    getSnapshot: jest.fn(() => mockVerificationState),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth = newAuth();
  mockVerificationState = newVerificationState();
  mockVerificationStore = newVerificationStore();
});

test('waits for account check before showing seller verification form (fail closed)', async () => {
  mockAuth = newAuth({ account: null, accountChecking: true });
  await render(<SellerVerificationScreen />);

  expect(screen.getByLabelText('กำลังตรวจสอบสิทธิ์บัญชี')).toBeTruthy();
  expect(screen.queryByText('ข้อมูลสำหรับยืนยันตัวตน')).toBeNull();
  expect(mockVerificationStore.load).not.toHaveBeenCalled();
});

test('shows account check error with retry button when account verification fails', async () => {
  mockAuth = newAuth({ account: null, accountChecking: false, accountError: 'network-error' });
  await render(<SellerVerificationScreen />);

  expect(screen.getByText('ตรวจสอบสิทธิ์บัญชีไม่สำเร็จ')).toBeTruthy();
  const retryBtn = screen.getByRole('button', { name: 'ลองใหม่อีกครั้ง' });
  await fireEvent.press(retryBtn);
  expect(mockAuth.retryAccount).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('ข้อมูลสำหรับยืนยันตัวตน')).toBeNull();
});

test.each(['BUYER', 'ADMIN', 'INSPECTOR'] as const)(
  'blocks non-seller role %s and displays forbidden message',
  async (role) => {
    mockAuth = newAuth({ account: { fullName: `ผู้ใช้ ${role}`, role, source: 'backend' } });
    await render(<SellerVerificationScreen />);

    expect(screen.getByText('หน้านี้สำหรับบัญชีผู้ขายเท่านั้น')).toBeTruthy();
    expect(screen.queryByText('ข้อมูลสำหรับยืนยันตัวตน')).toBeNull();

    await fireEvent.press(screen.getByText('กลับ'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  }
);

test('fills all form fields, picks image, and wires submission payload to store.submit()', async () => {
  const fakeImage = {
    uri: 'file:///fake/id-card.jpg',
    name: 'id-card.jpg',
    type: 'image/jpeg',
    size: 1024 * 500,
  };
  const spyPick = jest.spyOn(pickIdCardModule, 'pickIdCardImage').mockResolvedValue({
    status: 'picked',
    file: fakeImage,
  });

  await render(<SellerVerificationScreen />);

  fireEvent.changeText(screen.getByPlaceholderText('เช่น ธนาคารกรุงไทย'), 'ธนาคารกรุงไทย');
  expect(mockVerificationStore.clearFieldError).toHaveBeenCalledWith('bankName');

  fireEvent.changeText(screen.getByPlaceholderText('ชื่อ-นามสกุลตามหน้าสมุดบัญชี'), 'สมหมาย ค้าขาย');
  expect(mockVerificationStore.clearFieldError).toHaveBeenCalledWith('bankAccountName');

  fireEvent.changeText(screen.getByPlaceholderText('ตัวเลข 10-15 หลัก'), '1234567890');
  expect(mockVerificationStore.clearFieldError).toHaveBeenCalledWith('bankAccountNumber');

  await act(async () => {
    await fireEvent.press(screen.getByRole('button', { name: 'เลือกรูปบัตรประชาชน' }));
  });
  expect(mockVerificationStore.clearFieldError).toHaveBeenCalledWith('idCard');

  await act(async () => {
    await fireEvent.press(screen.getByRole('button', { name: 'ส่งคำขอยืนยันตัวตน' }));
  });

  expect(mockVerificationStore.submit).toHaveBeenCalledTimes(1);
  expect(mockVerificationStore.submit).toHaveBeenCalledWith({
    bankName: 'ธนาคารกรุงไทย',
    bankAccountName: 'สมหมาย ค้าขาย',
    bankAccountNumber: '1234567890',
    idCard: fakeImage,
  });

  spyPick.mockRestore();
});

test('renders loading indicator when initial status is loading without cached record', async () => {
  mockVerificationState = newVerificationState({ loading: true, record: null });
  await render(<SellerVerificationScreen />);

  expect(screen.getByLabelText('กำลังโหลดสถานะคำขอ')).toBeTruthy();
});

test('renders load error (e.g. network-error or 403) with retry button', async () => {
  mockVerificationState = newVerificationState({
    loadError: 'forbidden',
  });
  await render(<SellerVerificationScreen />);

  expect(screen.getByText('บัญชีนี้ไม่มีสิทธิ์ส่งคำขอยืนยันผู้ขาย')).toBeTruthy();
  const retryBtn = screen.getByRole('button', { name: 'ลองใหม่อีกครั้ง' });
  await fireEvent.press(retryBtn);
  expect(mockVerificationStore.retry).toHaveBeenCalledTimes(1);
});

test('renders NOT_SUBMITTED state with submission form enabled', async () => {
  mockVerificationState = newVerificationState({
    record: {
      id: null,
      status: 'NOT_SUBMITTED',
      canSubmit: true,
      bankName: null,
      bankAccountName: null,
      bankAccountLast4: null,
      rejectReason: null,
      reviewedAt: null,
      verifiedAt: null,
    },
  });

  await render(<SellerVerificationScreen />);

  expect(screen.getByText('สถานะ: ยังไม่ส่งคำขอ')).toBeTruthy();
  expect(screen.getByText('กรอกข้อมูลด้านล่างเพื่อส่งคำขอยืนยันตัวตนผู้ขาย')).toBeTruthy();
  expect(screen.getByText('ข้อมูลสำหรับยืนยันตัวตน')).toBeTruthy();
  expect(screen.getByPlaceholderText('เช่น ธนาคารกรุงไทย')).toBeTruthy();
  expect(screen.getByPlaceholderText('ชื่อ-นามสกุลตามหน้าสมุดบัญชี')).toBeTruthy();
  expect(screen.getByPlaceholderText('ตัวเลข 10-15 หลัก')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'เลือกรูปบัตรประชาชน' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'ส่งคำขอยืนยันตัวตน' })).toBeTruthy();
});

test('renders PENDING state: shows pending badge, masked bank details, and hides submission form', async () => {
  mockVerificationState = newVerificationState({
    record: {
      id: 101,
      status: 'PENDING',
      canSubmit: false,
      bankName: 'ธนาคารกสิกรไทย',
      bankAccountName: 'สมหมาย ค้าขาย',
      bankAccountLast4: '4567',
      rejectReason: null,
      reviewedAt: null,
      verifiedAt: null,
    },
  });

  await render(<SellerVerificationScreen />);

  expect(screen.getByText('สถานะ: รอตรวจสอบ')).toBeTruthy();
  expect(screen.getByText('ธนาคารกสิกรไทย • สมหมาย ค้าขาย • เลขบัญชีลงท้าย 4567')).toBeTruthy();
  expect(screen.queryByText('ข้อมูลสำหรับยืนยันตัวตน')).toBeNull();
  expect(screen.queryByRole('button', { name: 'ส่งคำขอยืนยันตัวตน' })).toBeNull();

  const refreshBtn = screen.getByRole('button', { name: 'รีเฟรชสถานะ' });
  await fireEvent.press(refreshBtn);
  expect(mockVerificationStore.refresh).toHaveBeenCalledTimes(1);
});

test('renders APPROVED state: shows approved badge, masked bank details, and hides submission form', async () => {
  mockVerificationState = newVerificationState({
    record: {
      id: 101,
      status: 'APPROVED',
      canSubmit: false,
      bankName: 'ธนาคารไทยพาณิชย์',
      bankAccountName: 'สมหมาย ค้าขาย',
      bankAccountLast4: '9876',
      rejectReason: null,
      reviewedAt: '2026-09-18T10:00:00Z',
      verifiedAt: '2026-09-18T10:00:00Z',
    },
  });

  await render(<SellerVerificationScreen />);

  expect(screen.getByText('สถานะ: อนุมัติแล้ว')).toBeTruthy();
  expect(screen.getByText('บัญชีผู้ขายของคุณได้รับการยืนยันแล้ว')).toBeTruthy();
  expect(screen.getByText('ธนาคารไทยพาณิชย์ • สมหมาย ค้าขาย • เลขบัญชีลงท้าย 9876')).toBeTruthy();
  expect(screen.queryByText('ข้อมูลสำหรับยืนยันตัวตน')).toBeNull();
});

test('renders REJECTED state: displays rejection reason and enables resubmission form', async () => {
  mockVerificationState = newVerificationState({
    record: {
      id: 101,
      status: 'REJECTED',
      canSubmit: true,
      bankName: 'ธนาคารกรุงเทพ',
      bankAccountName: 'สมหมาย ค้าขาย',
      bankAccountLast4: '1122',
      rejectReason: 'รูปบัตรประชาชนไม่ชัดเจน ไม่สามารถอ่านเลขประจำตัวได้',
      reviewedAt: '2026-09-18T12:00:00Z',
      verifiedAt: null,
    },
  });

  await render(<SellerVerificationScreen />);

  expect(screen.getByText('สถานะ: ถูกปฏิเสธ')).toBeTruthy();
  expect(screen.getByText('เหตุผลที่ถูกปฏิเสธ')).toBeTruthy();
  expect(screen.getByText('รูปบัตรประชาชนไม่ชัดเจน ไม่สามารถอ่านเลขประจำตัวได้')).toBeTruthy();
  expect(screen.getByText('ส่งคำขอใหม่')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'ส่งคำขอยืนยันตัวตน' })).toBeTruthy();
});

test('submitting in-flight disables submit button and shows loading indicator', async () => {
  mockVerificationState = newVerificationState({
    submitting: true,
    record: null,
  });

  await render(<SellerVerificationScreen />);

  const submitBtn = screen.getByRole('button', { name: 'กำลังส่งคำขอ' });
  expect(submitBtn.props.accessibilityState?.disabled).toBe(true);
  expect(screen.getByLabelText('กำลังส่งคำขอ')).toBeTruthy();
});

test('picking an image updates preview and allows submission', async () => {
  const spyPick = jest.spyOn(pickIdCardModule, 'pickIdCardImage').mockResolvedValue({
    status: 'picked',
    file: {
      uri: 'file:///fake/id-card.jpg',
      name: 'id-card.jpg',
      type: 'image/jpeg',
      size: 1024 * 500,
    },
  });

  await render(<SellerVerificationScreen />);

  const pickBtn = screen.getByRole('button', { name: 'เลือกรูปบัตรประชาชน' });
  await act(async () => {
    await fireEvent.press(pickBtn);
  });

  expect(spyPick).toHaveBeenCalledTimes(1);
  expect(await screen.findByText('id-card.jpg')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'เลือกรูปบัตรประชาชน' })).toBeTruthy();

  spyPick.mockRestore();
});

test('shows picker error when permission is denied', async () => {
  const spyPick = jest.spyOn(pickIdCardModule, 'pickIdCardImage').mockResolvedValue({
    status: 'permission-denied',
  });

  await render(<SellerVerificationScreen />);

  await act(async () => {
    await fireEvent.press(screen.getByRole('button', { name: 'เลือกรูปบัตรประชาชน' }));
  });
  expect(await screen.findByText('ไม่ได้รับอนุญาตให้เข้าถึงคลังรูปภาพ กรุณาอนุญาตในการตั้งค่า')).toBeTruthy();

  spyPick.mockRestore();
});

test('displays field errors from client validation or backend', async () => {
  mockVerificationState = newVerificationState({
    fieldErrors: {
      bankName: 'กรุณากรอกชื่อธนาคาร',
      bankAccountNumber: 'เลขที่บัญชีต้องเป็นตัวเลข 10-15 หลัก',
      idCard: 'กรุณาแนบรูปถ่ายบัตรประชาชน',
    },
    submitError: 'validation-error',
  });

  await render(<SellerVerificationScreen />);

  expect(screen.getByText('กรุณากรอกชื่อธนาคาร')).toBeTruthy();
  expect(screen.getByText('เลขที่บัญชีต้องเป็นตัวเลข 10-15 หลัก')).toBeTruthy();
  expect(screen.getByText('กรุณาแนบรูปถ่ายบัตรประชาชน')).toBeTruthy();
  expect(screen.getByText('ข้อมูลยังไม่ครบถ้วน กรุณาตรวจสอบช่องที่มีข้อความสีแดง')).toBeTruthy();
});

test('displays conflict error when submission collides with existing pending request', async () => {
  mockVerificationState = newVerificationState({
    submitError: 'conflict',
    record: {
      id: 102,
      status: 'PENDING',
      canSubmit: false,
      bankName: 'ธนาคารกรุงไทย',
      bankAccountName: 'สมหมาย',
      bankAccountLast4: '3344',
      rejectReason: null,
      reviewedAt: null,
      verifiedAt: null,
    },
  });

  await render(<SellerVerificationScreen />);

  expect(screen.getByText('มีคำขอที่รอผลอยู่แล้ว ระบบได้ดึงสถานะล่าสุดมาแสดงให้')).toBeTruthy();
});
