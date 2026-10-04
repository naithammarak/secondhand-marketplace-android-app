import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SellerVerificationScreen } from '@/components/seller-verification-screen';
import * as picker from '@/verification/pick-id-card';
const mockPush = jest.fn();
let mockAuth: any;
let mockState: any;
const mockStore = { load: jest.fn(), refresh: jest.fn(), retry: jest.fn(), clearFieldError: jest.fn(),
  submit: jest.fn(), getSnapshot: () => mockState };
jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
  useRouter: () => ({ push: mockPush, canGoBack: () => false, replace: mockPush }),
  router: { canGoBack: () => false, replace: mockPush }, Redirect: () => null,
}));
jest.mock('@/auth/auth-provider', () => ({ useAuth: () => mockAuth }));
jest.mock('@/verification/verification-provider', () => ({ useVerification: () => ({ state: mockState, store: mockStore }) }));
beforeEach(() => {
  jest.clearAllMocks();
  mockAuth = { session: { user: { id: 'buyer' } }, account: { role: 'BUYER', source: 'backend' }, retryAccount: jest.fn() };
  mockState = { owner: 'buyer', record: { id: null, status: 'NOT_SUBMITTED', canSubmit: true }, fieldErrors: {},
    loading: false, refreshing: false, submitting: false, loadError: null, submitError: null };
  mockStore.submit.mockResolvedValue(undefined);
});
afterEach(() => jest.restoreAllMocks());
test('Buyer can apply with shop, bank and private image but no optimistic promotion', async () => {
  const file = { uri: 'file:///id.jpg', name: 'id.jpg', type: 'image/jpeg', size: 500 };
  jest.spyOn(picker, 'pickIdCardImage').mockResolvedValue({ status: 'picked', file });
  render(<SellerVerificationScreen />);
  for (const [label, value] of [['ชื่อร้านค้า', 'ร้านวนดี'], ['ชื่อธนาคาร', 'ธนาคารทดสอบ'], ['ชื่อบัญชี', 'สมใจ ทดสอบ'], ['เลขที่บัญชี', '1234567890']]) fireEvent.changeText(screen.getByLabelText(label), value);
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'เลือกรูปบัตรประชาชน' })); });
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'ส่งคำขอยืนยันตัวตน' })); });
  expect(mockStore.submit).toHaveBeenCalledWith({ shopName: 'ร้านวนดี', bankName: 'ธนาคารทดสอบ', bankAccountName: 'สมใจ ทดสอบ', bankAccountNumber: '1234567890', idCard: file });
  expect(screen.queryByText('ลงขายสินค้า')).toBeNull();
});
test.each(['ADMIN', 'INSPECTOR'])('%s cannot apply', role => {
  mockAuth.account.role = role;
  render(<SellerVerificationScreen />);
  expect(screen.getByText('บัญชีนี้ยังไม่พร้อมขอเปิดร้าน')).toBeTruthy();
  expect(screen.queryByLabelText('ชื่อร้านค้า')).toBeNull();
  expect(mockStore.load).not.toHaveBeenCalled();
});
test('checking account hides form', () => {
  mockAuth.accountChecking = true; mockAuth.account = null;
  render(<SellerVerificationScreen />);
  expect(screen.getByLabelText('กำลังตรวจสอบสิทธิ์บัญชี')).toBeTruthy();
  expect(screen.queryByLabelText('ชื่อร้านค้า')).toBeNull();
});
test('account error offers retry even when account is null', () => {
  mockAuth.accountError = 'network-error'; mockAuth.account = null;
  render(<SellerVerificationScreen />);
  fireEvent.press(screen.getByRole('button', { name: 'ลองใหม่อีกครั้ง' }));
  expect(mockAuth.retryAccount).toHaveBeenCalledTimes(1);
});
test('unknown or stale verification does not expose form or private fields', () => {
  mockState.owner = 'another'; mockState.record.shopName = 'PRIVATE';
  render(<SellerVerificationScreen />);
  expect(screen.queryByText('PRIVATE')).toBeNull();
  expect(screen.queryByLabelText('ชื่อร้านค้า')).toBeNull();
});
test('pending shows masked details and refresh, no resubmit', () => {
  mockState.record = { id: 1, status: 'PENDING', canSubmit: false, shopName: 'ร้านวนดี', bankName: 'ธนาคารทดสอบ', bankAccountName: 'สมใจ', bankAccountLast4: '4567' };
  render(<SellerVerificationScreen />);
  expect(screen.getByText(/เลขบัญชีลงท้าย 4567/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'ส่งคำขอยืนยันตัวตน' })).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'รีเฟรชสถานะ' }));
  expect(mockStore.refresh).toHaveBeenCalledTimes(1);
  expect(mockAuth.retryAccount).toHaveBeenCalledTimes(1);
});
test('approval refreshes me and waits for the Seller role', () => {
  mockState.record = { id: 1, status: 'APPROVED', canSubmit: false };
  const view = render(<SellerVerificationScreen />);
  expect(mockAuth.retryAccount).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: 'ลงขายสินค้า' })).toBeNull();
  mockAuth.account.role = 'SELLER'; view.rerender(<SellerVerificationScreen />);
  fireEvent.press(screen.getByRole('button', { name: 'ลงขายสินค้า' }));
  expect(mockPush).toHaveBeenCalledWith('/product/new');
  expect(mockAuth.retryAccount).toHaveBeenCalledTimes(1);
});
test('rejection displays actual reason and permits a fresh application', () => {
  mockState.record = { id: 1, status: 'REJECTED', canSubmit: true, rejectReason: 'ชื่อบัญชีไม่ตรงกับบัตร กรุณาตรวจสอบ' };
  render(<SellerVerificationScreen />);
  expect(screen.getByText('ชื่อบัญชีไม่ตรงกับบัตร กรุณาตรวจสอบ')).toBeTruthy();
  expect(screen.getByLabelText('ชื่อร้านค้า')).toBeTruthy();
});
test('busy prevents duplicate submits', () => {
  mockState.submitting = true;
  render(<SellerVerificationScreen />);
  fireEvent.press(screen.getByRole('button', { name: 'ส่งคำขอยืนยันตัวตน' }));
  expect(mockStore.submit).not.toHaveBeenCalled();
});
test('permission denial is actionable and is not an uploaded image', async () => {
  jest.spyOn(picker, 'pickIdCardImage').mockResolvedValue({ status: 'permission-denied' });
  render(<SellerVerificationScreen />);
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'เลือกรูปบัตรประชาชน' })); });
  expect(screen.getByText(/ไม่ได้รับอนุญาตให้เข้าถึงคลังรูปภาพ/)).toBeTruthy();
  expect(screen.queryByLabelText('รูปบัตรที่เลือก')).toBeNull();
});
test('account switch resets form and ignores a late private picker result', async () => {
  let resolve!: (value: any) => void;
  jest.spyOn(picker, 'pickIdCardImage').mockImplementation(() => new Promise(r => { resolve = r; }));
  const view = render(<SellerVerificationScreen />);
  fireEvent.changeText(screen.getByLabelText('ชื่อบัญชี'), 'ชื่อส่วนตัว');
  fireEvent.press(screen.getByRole('button', { name: 'เลือกรูปบัตรประชาชน' }));
  mockAuth.session = { user: { id: 'buyer-2' } }; mockState.owner = 'buyer-2';
  view.rerender(<SellerVerificationScreen />);
  await act(async () => { resolve({ status: 'picked', file: { uri: 'file:///old-private.jpg' } }); });
  expect(screen.getByLabelText('ชื่อบัญชี').props.value).toBe('');
  expect(screen.queryByLabelText('รูปบัตรที่เลือก')).toBeNull();
});
test('load errors prevent writing while preserving retry', () => {
  mockState.loadError = 'forbidden';
  render(<SellerVerificationScreen />);
  expect(screen.getByText('บัญชีนี้ไม่มีสิทธิ์ส่งคำขอ')).toBeTruthy();
  expect(screen.queryByLabelText('ชื่อร้านค้า')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'ลองใหม่อีกครั้ง' }));
  expect(mockStore.retry).toHaveBeenCalledTimes(1);
});
test('field validation and submission conflicts stay visible', () => {
  mockState.fieldErrors.shopName = 'กรุณาระบุชื่อร้าน 2–100 ตัวอักษร';
  const view = render(<SellerVerificationScreen />);
  expect(screen.getByText('กรุณาระบุชื่อร้าน 2–100 ตัวอักษร')).toBeTruthy();
  mockState.record = { status: 'PENDING', canSubmit: false }; mockState.submitError = 'conflict';
  view.rerender(<SellerVerificationScreen />);
  expect(screen.getByText('ส่งคำขอไว้แล้ว ระบบกำลังแสดงสถานะล่าสุด')).toBeTruthy();
});

test('a deep link waits for session restore instead of redirecting to login', () => {
  mockAuth = { initializing: true, session: null, account: null, retryAccount: jest.fn() };
  render(<SellerVerificationScreen />);
  expect(screen.getByText('กำลังตรวจสอบบัญชี')).toBeTruthy();
});

test('status uses Thai labels from the API state, not raw enum text', () => {
  mockState.record = { id: 1, status: 'PENDING', canSubmit: false, shopName: 'ร้านวนดี', bankName: 'ธนาคารทดสอบ', bankAccountName: 'สมใจ', bankAccountLast4: '4567' };
  render(<SellerVerificationScreen />);
  expect(screen.getByText('รอตรวจสอบ')).toBeTruthy();
  expect(screen.queryByText('PENDING')).toBeNull();
  expect(screen.getByText('กำลังตรวจสอบคำขอของคุณ')).toBeTruthy();
});

test('a first application shows only the form, without a status block', () => {
  render(<SellerVerificationScreen />);
  expect(screen.queryByText('เตรียมร้านของคุณให้พร้อม')).toBeNull();
  expect(screen.getByLabelText('ชื่อร้านค้า')).toBeTruthy();
});
