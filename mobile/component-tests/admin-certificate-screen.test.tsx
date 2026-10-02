import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AdminCertificateScreen } from '@/components/admin-certificate-screen';
import { InspectionServiceError } from '@/services/inspection-service';

let mockAuth: any;
const mockPush = jest.fn();
const mockList = jest.fn();
const mockDetail = jest.fn();
const mockRevoke = jest.fn();
const mockApi = { call: (operation: any) => operation('admin-token'), token: 'admin-token',
  service: { adminCertificates: mockList, adminCertificate: mockDetail, revokeCertificate: mockRevoke } };
jest.mock('@/auth/auth-provider', () => ({ useAuth: () => mockAuth }));
jest.mock('expo-router', () => ({
  router: { push: (...args: any[]) => mockPush(...args) }, Redirect: () => null,
  useFocusEffect: (callback: () => void) => { require('react').useEffect(callback, [callback]); },
}));
jest.mock('@/inspections/use-inspection-api', () => ({
  ...jest.requireActual('@/inspections/use-inspection-api'), useInspectionApi: () => mockApi,
}));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'revoke-client-key-0001') }));

const certificate = { id: 42, certificate_no: 'CERT-42', status: 'ISSUED', result: 'PASS',
  issued_at: '2026-10-02T00:00:00Z', revoked_at: null, can_revoke: true,
  public_url: 'https://cert.test/certificates/opaque-token-123456789012' };
const revoked = { ...certificate, status: 'REVOKED', can_revoke: false, revoked_at: '2026-10-02T01:00:00Z' };
const reason = '  ตรวจพบหลักฐานที่ต้องเพิกถอนใบรับรอง  ';

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth = { session: { user: { id: 'admin-a' } }, initializing: false, accountChecking: false,
    account: { role: 'ADMIN', source: 'backend' }, accountError: null, retryAccount: jest.fn() };
  mockList.mockReset().mockResolvedValue({ items: [certificate], next_before_id: null });
  mockDetail.mockReset().mockResolvedValue(certificate);
  mockRevoke.mockReset().mockImplementation(async () => { mockDetail.mockResolvedValue(revoked); return revoked; });
});

async function confirmRevoke() {
  fireEvent.changeText(await screen.findByLabelText('เหตุผลส่วนตัวสำหรับบันทึกตรวจสอบ'), reason);
  fireEvent.press(screen.getByRole('button', { name: 'เพิกถอนใบรับรอง' }));
  fireEvent.press(screen.getByRole('button', { name: 'ยืนยันเพิกถอน' }));
}

test.each(['BUYER', 'SELLER', 'INSPECTOR', 'COURIER'])('denies %s before any Admin API', role => {
  mockAuth.account.role = role;
  render(<AdminCertificateScreen certificateId={42} />);
  expect(screen.getByText('เฉพาะผู้ดูแลระบบที่ใช้งานได้เท่านั้น')).toBeTruthy();
  expect(mockDetail).not.toHaveBeenCalled();
});

test('guest, checking and unverified Admin cannot load certificates', () => {
  mockAuth.session = null;
  const view = render(<AdminCertificateScreen />);
  expect(mockList).not.toHaveBeenCalled();
  mockAuth.session = { user: { id: 'admin-a' } }; mockAuth.accountChecking = true;
  view.rerender(<AdminCertificateScreen />);
  expect(mockList).not.toHaveBeenCalled();
  mockAuth.accountChecking = false; mockAuth.account.source = 'mock';
  view.rerender(<AdminCertificateScreen />);
  expect(mockList).not.toHaveBeenCalled();
});

test('list opens actual detail route and consumes bounded cursors', async () => {
  mockList.mockResolvedValueOnce({ items: [certificate], next_before_id: 42 })
    .mockResolvedValue({ items: [{ ...certificate, id: 41, certificate_no: 'CERT-41' }], next_before_id: null });
  render(<AdminCertificateScreen />);
  fireEvent.press(await screen.findByRole('button', { name: 'รายละเอียด CERT-42' }));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/admin-certificates/[certificateId]', params: { certificateId: 42 } });
  fireEvent.press(screen.getByRole('button', { name: 'หน้าถัดไป' }));
  expect(await screen.findByText('CERT-41')).toBeTruthy();
  expect(screen.queryByText('CERT-42')).toBeNull();
  expect(mockList).toHaveBeenLastCalledWith('admin-token', 42);
});

test('validates reason and confirms once before showing committed revoked state', async () => {
  render(<AdminCertificateScreen certificateId={42} />);
  const input = await screen.findByLabelText('เหตุผลส่วนตัวสำหรับบันทึกตรวจสอบ');
  for (const value of ['short', 'x'.repeat(1001)]) {
    fireEvent.changeText(input, value);
    expect(screen.getByRole('button', { name: 'เพิกถอนใบรับรอง' }).props.accessibilityState.disabled).toBe(true);
  }
  await confirmRevoke();
  expect(await screen.findByText('เพิกถอนใบรับรองแล้ว')).toBeTruthy();
  expect(await screen.findByText('เพิกถอนแล้ว (REVOKED)')).toBeTruthy();
  expect(mockRevoke).toHaveBeenCalledTimes(1);
  expect(mockRevoke).toHaveBeenCalledWith('admin-token', 42, reason.trim(), 'revoke-client-key-0001');
  expect(screen.queryByLabelText('เหตุผลส่วนตัวสำหรับบันทึกตรวจสอบ')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'ดูหน้าสาธารณะ' }));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/certificates/[token]', params: { token: 'opaque-token-123456789012' } });
});

test('timeout freezes submitted reason and reuses the key for retry', async () => {
  mockRevoke.mockRejectedValueOnce(new InspectionServiceError(0, 'timeout'));
  render(<AdminCertificateScreen certificateId={42} />);
  await confirmRevoke();
  expect(await screen.findByText('ยังไม่ได้รับคำตอบจากระบบ กดลองใหม่เพื่อส่งคำขอเดิมอย่างปลอดภัย')).toBeTruthy();
  expect(screen.queryByText('เพิกถอนใบรับรองแล้ว')).toBeNull();
  expect(screen.queryByLabelText('เหตุผลส่วนตัวสำหรับบันทึกตรวจสอบ')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'ลองส่งคำขอเดิม' }));
  expect(await screen.findByText('เพิกถอนใบรับรองแล้ว')).toBeTruthy();
  expect(mockRevoke.mock.calls[1]).toEqual(mockRevoke.mock.calls[0]);
});

test('409 reloads committed server state and does not claim our command succeeded', async () => {
  mockRevoke.mockImplementationOnce(async () => {
    mockDetail.mockResolvedValue(revoked);
    throw new InspectionServiceError(409, 'certificate_already_revoked');
  });
  render(<AdminCertificateScreen certificateId={42} />);
  await confirmRevoke();
  expect(await screen.findByText('เพิกถอนแล้ว (REVOKED)')).toBeTruthy();
  expect(screen.queryByText('เพิกถอนใบรับรองแล้ว')).toBeNull();
  expect(screen.queryByRole('button', { name: 'เพิกถอนใบรับรอง' })).toBeNull();
});

test('late mutation from a previous account cannot show success on the new account', async () => {
  let finish!: (value: any) => void;
  mockRevoke.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const view = render(<AdminCertificateScreen certificateId={42} />);
  await confirmRevoke();
  await waitFor(() => expect(mockRevoke).toHaveBeenCalledTimes(1));
  mockAuth.session = { user: { id: 'admin-b' } };
  view.rerender(<AdminCertificateScreen certificateId={42} />);
  expect(await screen.findByLabelText('เหตุผลส่วนตัวสำหรับบันทึกตรวจสอบ')).toBeTruthy();
  await act(async () => finish(revoked));
  expect(screen.queryByText('เพิกถอนใบรับรองแล้ว')).toBeNull();
  expect(screen.queryByRole('button', { name: 'ลองส่งคำขอเดิม' })).toBeNull();
});

test('loading failure offers a retry without a stale revoke form', async () => {
  mockDetail.mockRejectedValueOnce(new InspectionServiceError(404, 'certificate_not_found'));
  render(<AdminCertificateScreen certificateId={42} />);
  fireEvent.press(await screen.findByRole('button', { name: 'ลองโหลดอีกครั้ง' }));
  expect(await screen.findByLabelText('เหตุผลส่วนตัวสำหรับบันทึกตรวจสอบ')).toBeTruthy();
});
