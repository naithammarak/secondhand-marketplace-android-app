import { render, waitFor } from '@testing-library/react-native';
import CallbackScreen from '@/app/auth/callback';
const mockReplace = jest.fn();
const mockPeek = jest.fn();
const mockClear = jest.fn();
let mockAuth: any;
jest.mock('expo-router', () => ({ router: { replace: (...args: any[]) => mockReplace(...args) } }));
jest.mock('@/auth/auth-provider', () => ({ useAuth: () => mockAuth }));
jest.mock('@/auth/marketplace-return-instance', () => ({ marketplaceReturn: { peek: () => mockPeek(), clear: () => mockClear() } }));
beforeEach(() => {
  jest.clearAllMocks();
  mockAuth = { session: { user: { id: 'a' } }, account: { source: 'backend', role: 'BUYER' }, accountChecking: false, accountError: null };
  mockPeek.mockResolvedValue({ kind: 'checkout', productId: 42 }); mockClear.mockResolvedValue(undefined);
});
test('OAuth callback waits for backend verification and restores checkout intent', async () => {
  mockAuth.accountChecking = true;
  const view = render(<CallbackScreen />);
  expect(mockReplace).not.toHaveBeenCalled();
  mockAuth.accountChecking = false;
  view.rerender(<CallbackScreen />);
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({ pathname: '/checkout/[productId]', params: { productId: '42' } }));
  expect(mockClear).toHaveBeenCalledTimes(1);
});
test('backend denial does not report success or redirect into the app', async () => {
  mockAuth.accountError = 'forbidden';
  render(<CallbackScreen />);
  expect(mockPeek).not.toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
});
