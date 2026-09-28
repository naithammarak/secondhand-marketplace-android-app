import { render, screen } from '@testing-library/react-native';
import SellScreen from '@/app/sell';
let mockAuth: any;
let mockState: any;
const mockStore = { refresh: jest.fn() };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useFocusEffect: (callback: () => unknown) => jest.requireActual('react').useEffect(callback, [callback]),
}));
jest.mock('@/auth/auth-provider', () => ({ useAuth: () => mockAuth }));
jest.mock('@/verification/verification-provider', () => ({ useVerification: () => ({ state: mockState, store: mockStore }) }));
beforeEach(() => {
  mockAuth = { session: { user: { id: 'seller-test' } }, account: { source: 'backend', role: 'SELLER' } };
  mockState = { owner: 'seller-test', record: { status: 'APPROVED' } };
});
test('approved current sellers can open the real listing form', () => {
  render(<SellScreen />);
  expect(screen.getByRole('button', { name: 'ลงขายสินค้า' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'สินค้าของฉัน' })).toBeTruthy();
});
test.each(['PENDING', 'REJECTED'])('a %s seller cannot access listing actions', status => {
  mockState.record.status = status;
  render(<SellScreen />);
  expect(screen.queryByRole('button', { name: 'ลงขายสินค้า' })).toBeNull();
  expect(screen.getByRole('button', { name: 'ดูการยืนยันตัวตน' })).toBeTruthy();
});
test('stale approval from a different account cannot unlock listing actions', () => {
  mockState.owner = 'previous-seller';
  render(<SellScreen />);
  expect(screen.queryByRole('button', { name: 'ลงขายสินค้า' })).toBeNull();
});
