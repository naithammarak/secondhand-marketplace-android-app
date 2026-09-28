import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { AdminVerificationScreen } from '@/components/admin-verification-screen';
import type { ReviewRequest } from '@/services/admin-verification-service';

const mockBack = jest.fn();
let mockAuth: any;
let mockReviewState: any;
let mockReviewStore: any;

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
  useRouter: () => ({ back: mockBack }),
  Redirect: ({ href }: { href: string }) => null,
}));

jest.mock('@/auth/auth-provider', () => ({
  useAuth: () => mockAuth,
}));

jest.mock('@/admin/review-provider', () => ({
  useReview: () => ({
    state: mockReviewState,
    store: mockReviewStore,
  }),
}));

function newAuth(overrides: Record<string, unknown> = {}) {
  return {
    session: { user: { id: 'admin-1' } },
    account: { fullName: 'ผู้ดูแล นเรศ', role: 'ADMIN', source: 'backend' },
    accountChecking: false,
    accountError: null,
    retryAccount: jest.fn(),
    ...overrides,
  };
}

const sampleRequest = (id = 1, status = 'PENDING', extra = {}): ReviewRequest => ({
  id,
  status: status as any,
  sellerId: 201,
  sellerName: 'ผู้ขาย สมหมาย',
  sellerEmail: 'seller@example.com',
  shopName: 'ร้านทดสอบ',
  bankName: 'ธนาคารกรุงไทย',
  bankAccountName: 'สมหมาย ขายดี',
  bankAccountLast4: '5678',
  submittedAt: '2026-09-18T08:30:00Z',
  rejectReason: null,
  reviewedAt: null,
  verifiedAt: null,
  reviewedByName: null,
  hasIdCardImage: true,
  ...extra,
});

function newReviewState(overrides: Record<string, unknown> = {}) {
  return {
    owner: 'admin-1',
    status: 'PENDING',
    loading: false,
    refreshing: false,
    loaded: true,
    items: [sampleRequest(1)],
    total: 1,
    loadError: null,
    selectedId: null,
    evidence: null,
    evidenceLoading: false,
    evidenceError: null,
    rejectReason: '',
    reasonError: null,
    deciding: null,
    decisionError: null,
    alreadyReviewed: null,
    lastDecision: null,
    ...overrides,
  };
}

function newReviewStore(overrides: Record<string, unknown> = {}) {
  return {
    load: jest.fn().mockResolvedValue(undefined),
    refresh: jest.fn().mockResolvedValue(undefined),
    retry: jest.fn().mockResolvedValue(undefined),
    setStatus: jest.fn().mockResolvedValue(undefined),
    select: jest.fn(),
    loadEvidence: jest.fn().mockResolvedValue(undefined),
    setRejectReason: jest.fn(),
    decide: jest.fn().mockResolvedValue(undefined),
    getSnapshot: jest.fn(() => mockReviewState),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth = newAuth();
  mockReviewState = newReviewState();
  mockReviewStore = newReviewStore();
});

test('waits for account check before showing admin review screen (fail closed)', async () => {
  mockAuth = newAuth({ account: null, accountChecking: true });
  await render(<AdminVerificationScreen />);

  expect(screen.getByLabelText('กำลังตรวจสอบสิทธิ์บัญชี')).toBeTruthy();
  expect(screen.queryByText('ตรวจคำขอยืนยันตัวตน')).toBeNull();
  expect(mockReviewStore.load).not.toHaveBeenCalled();
});

test('shows account check error with retry button when auth check fails', async () => {
  mockAuth = newAuth({ account: null, accountChecking: false, accountError: 'network-error' });
  await render(<AdminVerificationScreen />);

  expect(screen.getByText('ตรวจสอบสิทธิ์บัญชีไม่สำเร็จ')).toBeTruthy();
  const retryBtn = screen.getByRole('button', { name: 'ลองใหม่อีกครั้ง' });
  await fireEvent.press(retryBtn);
  expect(mockAuth.retryAccount).toHaveBeenCalledTimes(1);
});

test.each(['BUYER', 'SELLER', 'INSPECTOR'] as const)(
  'blocks non-admin role %s from viewing verification queue',
  async (role) => {
    mockAuth = newAuth({ account: { fullName: `ผู้ใช้ ${role}`, role, source: 'backend' } });
    await render(<AdminVerificationScreen />);

    expect(screen.getByText('หน้านี้สำหรับบัญชีผู้ดูแลระบบเท่านั้น')).toBeTruthy();
    expect(screen.queryByText('รอตรวจ (1)')).toBeNull();

    await fireEvent.press(screen.getByText('กลับ'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  }
);

test('renders queue list with tabs, item count, and applicant info', async () => {
  await render(<AdminVerificationScreen />);

  expect(screen.getByText('รอตรวจสอบ (1)')).toBeTruthy();
  expect(screen.getByText('ผู้ขาย สมหมาย')).toBeTruthy();
  expect(screen.getByText('#1')).toBeTruthy();
  expect(screen.getByText('seller@example.com')).toBeTruthy();
  expect(screen.getByText('ธนาคารกรุงไทย • สมหมาย ขายดี • เลขบัญชีลงท้าย 5678')).toBeTruthy();
});

test('switches status tabs to inspect APPROVED and REJECTED queues', async () => {
  await render(<AdminVerificationScreen />);

  const approvedTab = screen.getByRole('button', { name: 'อนุมัติแล้ว' });
  await fireEvent.press(approvedTab);
  expect(mockReviewStore.setStatus).toHaveBeenCalledWith('APPROVED');

  const rejectedTab = screen.getByRole('button', { name: 'ถูกปฏิเสธ' });
  await fireEvent.press(rejectedTab);
  expect(mockReviewStore.setStatus).toHaveBeenCalledWith('REJECTED');
});

test('shows empty queue message when items list is empty', async () => {
  mockReviewState = newReviewState({
    items: [],
    total: 0,
    status: 'PENDING',
  });

  await render(<AdminVerificationScreen />);

  expect(screen.getByText('ไม่มีคำขอรอตรวจในขณะนี้')).toBeTruthy();
});

test('shows load error with retry button on network failure', async () => {
  mockReviewState = newReviewState({
    loaded: false,
    loadError: 'network-error',
    items: [],
  });

  await render(<AdminVerificationScreen />);

  expect(screen.getByText('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่')).toBeTruthy();
  const retryBtn = screen.getByRole('button', { name: 'ลองใหม่อีกครั้ง' });
  await fireEvent.press(retryBtn);
  expect(mockReviewStore.retry).toHaveBeenCalledTimes(1);
});

test('opens application detail when an item is selected', async () => {
  await render(<AdminVerificationScreen />);

  const itemBtn = screen.getByRole('button', { name: 'เปิดคำขอของ ผู้ขาย สมหมาย' });
  await fireEvent.press(itemBtn);
  expect(mockReviewStore.select).toHaveBeenCalledWith(1);
});

test('renders detail view with masked details and lazy evidence loading button', async () => {
  mockReviewState = newReviewState({
    selectedId: 1,
    items: [sampleRequest(1)],
  });

  await render(<AdminVerificationScreen />);

  expect(screen.getByText('คำขอ #1 • รอตรวจสอบ')).toBeTruthy();
  expect(screen.getByText('ธนาคาร ธนาคารกรุงไทย')).toBeTruthy();
  expect(screen.getByText('ชื่อบัญชี สมหมาย ขายดี')).toBeTruthy();
  expect(screen.getByText('เลขบัญชีลงท้าย 5678')).toBeTruthy();

  const evidenceBtn = screen.getByRole('button', { name: 'เปิดดูรูปบัตรประชาชน' });
  expect(evidenceBtn).toBeTruthy();

  await fireEvent.press(evidenceBtn);
  expect(mockReviewStore.loadEvidence).toHaveBeenCalledTimes(1);
});

test('renders loaded evidence image with TTL note', async () => {
  mockReviewState = newReviewState({
    selectedId: 1,
    items: [sampleRequest(1)],
    evidence: {
      url: 'https://storage.test/id-card-signed.jpg?token=abc',
      expiresIn: 120,
    },
  });

  await render(<AdminVerificationScreen />);

  expect(screen.getByLabelText('รูปบัตรประชาชนของคำขอ 1')).toBeTruthy();
  expect(screen.getByText('ลิงก์รูปบัตรมีอายุ 2 นาที และใช้เพื่อการตรวจสอบเท่านั้น')).toBeTruthy();
});

test('displays evidence error message when signed URL fetch fails', async () => {
  mockReviewState = newReviewState({
    selectedId: 1,
    items: [sampleRequest(1)],
    evidenceError: 'server-error',
  });

  await render(<AdminVerificationScreen />);

  expect(screen.getByText('เปิดดูรูปบัตรประชาชนไม่ได้ กรุณาลองใหม่ภายหลัง')).toBeTruthy();
});

test('approves application on pressing approve button', async () => {
  mockReviewState = newReviewState({
    selectedId: 1,
    items: [sampleRequest(1)],
  });

  await render(<AdminVerificationScreen />);

  const approveBtn = screen.getByRole('button', { name: 'อนุมัติ' });
  await fireEvent.press(approveBtn);
  expect(mockReviewStore.decide).toHaveBeenCalledWith('APPROVED');
});

test('types reject reason and confirms store.setRejectReason() is called before rejecting', async () => {
  mockReviewState = newReviewState({
    selectedId: 1,
    items: [sampleRequest(1)],
    rejectReason: '',
  });

  await render(<AdminVerificationScreen />);

  const reasonInput = screen.getByLabelText('เหตุผลที่ปฏิเสธ');
  fireEvent.changeText(reasonInput, 'รูปถ่ายบัตรประชาชนไม่ชัดเจน ไม่เห็นชื่อ-สกุล');
  expect(mockReviewStore.setRejectReason).toHaveBeenCalledWith('รูปถ่ายบัตรประชาชนไม่ชัดเจน ไม่เห็นชื่อ-สกุล');

  const rejectBtn = screen.getByRole('button', { name: 'ปฏิเสธ' });
  await fireEvent.press(rejectBtn);
  expect(mockReviewStore.decide).toHaveBeenCalledWith('REJECTED');
});

test('rejects application and sends reject reason on pressing reject button', async () => {
  mockReviewState = newReviewState({
    selectedId: 1,
    items: [sampleRequest(1)],
    rejectReason: 'รูปถ่ายบัตรประชาชนไม่ชัดเจน ไม่เห็นชื่อ-สกุล',
  });

  await render(<AdminVerificationScreen />);

  const rejectBtn = screen.getByRole('button', { name: 'ปฏิเสธ' });
  await fireEvent.press(rejectBtn);
  expect(mockReviewStore.decide).toHaveBeenCalledWith('REJECTED');
});

test('shows reason validation error when rejecting without required reason', async () => {
  mockReviewState = newReviewState({
    selectedId: 1,
    items: [sampleRequest(1)],
    reasonError: 'กรุณากรอกเหตุผลการปฏิเสธอย่างน้อย 5 ตัวอักษร',
    decisionError: 'validation-error',
  });

  await render(<AdminVerificationScreen />);

  expect(screen.getByText('กรุณากรอกเหตุผลการปฏิเสธอย่างน้อย 5 ตัวอักษร')).toBeTruthy();
  expect(screen.getByText('ข้อมูลยังไม่ครบถ้วน กรุณาตรวจสอบช่องที่มีข้อความสีแดง')).toBeTruthy();
});

test('disables buttons during decision in-flight to prevent duplicate actions', async () => {
  mockReviewState = newReviewState({
    selectedId: 1,
    items: [sampleRequest(1)],
    deciding: 'APPROVED',
  });

  await render(<AdminVerificationScreen />);

  const approveBtn = screen.getByRole('button', { name: 'กำลังบันทึก' });
  expect(approveBtn.props.accessibilityState?.disabled).toBe(true);

  const rejectBtn = screen.getByRole('button', { name: 'ปฏิเสธ' });
  expect(rejectBtn.props.accessibilityState?.disabled).toBe(true);
});

test('displays 409 conflict message showing reviewer name when already reviewed', async () => {
  mockReviewState = newReviewState({
    selectedId: 1,
    items: [sampleRequest(1)],
    decisionError: 'conflict',
    alreadyReviewed: {
      status: 'APPROVED',
      reviewedBy: 99,
      reviewedByName: 'ผู้ดูแล สมศักดิ์',
      reviewedAt: '2026-09-18T09:00:00Z',
    },
  });

  await render(<AdminVerificationScreen />);

  expect(screen.getByText('คำขอนี้ถูกตรวจไปแล้ว โดย ผู้ดูแล สมศักดิ์')).toBeTruthy();
});

test('navigates back to list view from detail view', async () => {
  mockReviewState = newReviewState({
    selectedId: 1,
    items: [sampleRequest(1)],
  });

  await render(<AdminVerificationScreen />);

  const backToListBtn = screen.getByRole('button', { name: 'กลับไปที่รายการ' });
  await fireEvent.press(backToListBtn);
  expect(mockReviewStore.select).toHaveBeenCalledWith(null);
});

test('private queue and evidence disappear immediately when account owner changes', () => {
  mockReviewState.owner = 'previous-admin';
  render(<AdminVerificationScreen />);
  expect(screen.queryByText('seller@example.com')).toBeNull();
  expect(mockReviewStore.load).not.toHaveBeenCalled();
});
test('a previously known Admin with an auth failure cannot continue reviewing', () => {
  mockAuth.accountError = 'forbidden';
  render(<AdminVerificationScreen />);
  expect(screen.queryByText('seller@example.com')).toBeNull();
  expect(screen.getByText('ตรวจสอบสิทธิ์บัญชีไม่สำเร็จ')).toBeTruthy();
});
