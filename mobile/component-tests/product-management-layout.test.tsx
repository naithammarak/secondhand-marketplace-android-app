import { render, screen } from '@testing-library/react-native';
import ProductManagementLayout from '@/app/product/_layout';
let mockAuth: any;
let mockState: any;
const mockStore = { refresh: jest.fn() };
jest.mock('expo-router', () => ({ useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]), Slot: () => require('react').createElement(require('react-native').Text, null, 'PRIVATE PRODUCT FORM') }));
jest.mock('@/app/sell', () => ({ __esModule: true, default: () => require('react').createElement(require('react-native').Text, null, 'SELLER GATE') }));
jest.mock('@/auth/auth-provider', () => ({ useAuth: () => mockAuth }));
jest.mock('@/verification/verification-provider', () => ({ useVerification: () => ({ state: mockState, store: mockStore }) }));
beforeEach(() => {
  mockAuth = { session: { user: { id: 'seller' } }, account: { role: 'SELLER', source: 'backend' } };
  mockState = { owner: 'seller', record: { status: 'APPROVED' } };
});
test('approved server Seller may enter management through a deep link', () => {
  render(<ProductManagementLayout />); expect(screen.getByText('PRIVATE PRODUCT FORM')).toBeTruthy();
});
test.each(['BUYER','ADMIN','INSPECTOR'])('%s cannot use product management deep links', role => {
  mockAuth.account.role = role; render(<ProductManagementLayout />);
  expect(screen.queryByText('PRIVATE PRODUCT FORM')).toBeNull();
});
test.each(['PENDING','REJECTED','NOT_SUBMITTED'])('%s verification stays behind the gate', status => {
  mockState.record.status = status; render(<ProductManagementLayout />);
  expect(screen.queryByText('PRIVATE PRODUCT FORM')).toBeNull();
});
test('changing owner or losing backend authorization removes the private child immediately', () => {
  const view = render(<ProductManagementLayout />);
  mockAuth.session = { user: { id: 'other' } }; view.rerender(<ProductManagementLayout />);
  expect(screen.queryByText('PRIVATE PRODUCT FORM')).toBeNull();
  mockState.owner = 'other'; mockAuth.accountError = 'forbidden'; view.rerender(<ProductManagementLayout />);
  expect(screen.queryByText('PRIVATE PRODUCT FORM')).toBeNull();
});
