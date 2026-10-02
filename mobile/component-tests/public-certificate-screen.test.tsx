import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import PublicCertificateScreen from '@/app/certificates/[token]';

const mockPublicCertificate = jest.fn();
let mockToken = 'opaque-token-123456789012';
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ token: mockToken }),
  useFocusEffect: (callback: () => void) => { require('react').useEffect(callback, [callback]); },
}));
jest.mock('@/services/inspection-service', () => {
  const actual = jest.requireActual('@/services/inspection-service');
  return { ...actual, createInspectionService: () => ({ publicCertificate: mockPublicCertificate }) };
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() }));
  mockToken = 'opaque-token-123456789012';
  mockPublicCertificate.mockResolvedValue({ certificate_no: 'CERT-42', result: 'PASS', issued_at: '2026-09-28T00:00:00Z', status: 'REVOKED' });
});

test('refresh hides old issued status and replaces it with the server revocation', async () => {
  mockPublicCertificate.mockResolvedValueOnce({ certificate_no: 'CERT-42', result: 'PASS', issued_at: '2026-09-28T00:00:00Z', status: 'ISSUED' });
  render(<PublicCertificateScreen />);
  expect(await screen.findByText('ใบรับรองนี้ใช้งานได้')).toBeTruthy();
  let finish!: (value: any) => void;
  mockPublicCertificate.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  fireEvent.press(screen.getByRole('button', { name: 'ตรวจสอบสถานะล่าสุด' }));
  expect(screen.queryByText('ใบรับรองนี้ใช้งานได้')).toBeNull();
  await act(async () => { finish({ certificate_no: 'CERT-42', result: 'PASS', issued_at: '2026-09-28T00:00:00Z', status: 'REVOKED', reason: 'private test note', actor_id: 999 }); });
  expect(await screen.findByText('ใบรับรองนี้ถูกเพิกถอน')).toBeTruthy();
  expect(screen.queryByText('private test note')).toBeNull();
  expect(screen.queryByText('✓ ของแท้')).toBeNull();
});

test('backgrounding clears validity and foreground reload failure does not revive it', async () => {
  const changes: ((state: string) => void)[] = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, callback) => {
    changes.push(callback as (state: string) => void);
    return { remove: jest.fn() };
  });
  mockPublicCertificate.mockResolvedValueOnce({ certificate_no: 'CERT-42', result: 'PASS', issued_at: '2026-09-28T00:00:00Z', status: 'ISSUED' });
  const view = render(<PublicCertificateScreen />);
  expect(await screen.findByText('ใบรับรองนี้ใช้งานได้')).toBeTruthy();
  act(() => changes.forEach(change => change('background')));
  expect(screen.queryByText('ใบรับรองนี้ใช้งานได้')).toBeNull();
  mockPublicCertificate.mockRejectedValueOnce(new Error('offline'));
  act(() => changes.forEach(change => change('active')));
  expect(await screen.findByRole('button', { name: 'ลองใหม่' })).toBeTruthy();
  expect(screen.queryByText('ใบรับรองนี้ใช้งานได้')).toBeNull();
  view.unmount();
});

test('a late response for an old public token cannot overwrite a new certificate', async () => {
  let old!: (value: any) => void;
  mockPublicCertificate.mockImplementationOnce(() => new Promise(resolve => { old = resolve; }));
  const view = render(<PublicCertificateScreen />);
  await waitFor(() => expect(mockPublicCertificate).toHaveBeenCalledTimes(1));
  mockToken = 'different-token-123456789';
  view.rerender(<PublicCertificateScreen />);
  expect(await screen.findByText('ใบรับรองนี้ถูกเพิกถอน')).toBeTruthy();
  await act(async () => { old({ certificate_no: 'OLD', status: 'ISSUED', result: 'PASS', issued_at: '2026-09-28T00:00:00Z' }); });
  expect(screen.queryByText('OLD')).toBeNull();
  expect(screen.queryByText('ใบรับรองนี้ใช้งานได้')).toBeNull();
});

test('revoked public certificates are marked invalid without presenting the positive result', async () => {
  render(<PublicCertificateScreen />);
  expect(await screen.findByText('ใบรับรองนี้ถูกเพิกถอน')).toBeTruthy();
  expect(screen.getByText('CERT-42')).toBeTruthy();
  expect(screen.queryByText('ผ่านการตรวจตามรายงาน')).toBeNull();
});
