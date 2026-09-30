import { render, screen } from '@testing-library/react-native';
import PublicCertificateScreen from '@/app/certificates/[token]';

const mockPublicCertificate = jest.fn();
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ token: 'opaque-token-123456789012' }) }));
jest.mock('@/services/inspection-service', () => {
  const actual = jest.requireActual('@/services/inspection-service');
  return { ...actual, createInspectionService: () => ({ publicCertificate: mockPublicCertificate }) };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPublicCertificate.mockResolvedValue({ certificate_no: 'CERT-42', result: 'PASS', issued_at: '2026-09-28T00:00:00Z', status: 'REVOKED' });
});

test('revoked public certificates are marked invalid without presenting the positive result', async () => {
  render(<PublicCertificateScreen />);
  expect(await screen.findByText('ใบรับรองนี้ถูกเพิกถอน')).toBeTruthy();
  expect(screen.getByText('CERT-42')).toBeTruthy();
  expect(screen.queryByText('ผ่านการตรวจตามรายงาน')).toBeNull();
});
