import { fireEvent, render, screen } from '@testing-library/react-native';

import MyProductsScreen from '@/app/product/mine';

const mockPush = jest.fn();
const mockGetMyProducts = jest.fn();

jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: jest.fn() },
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));
jest.mock('@/auth/auth-provider', () => ({
  useAuth: () => ({ session: { access_token: 'seller-token', user: { id: 'seller' } } }),
}));
jest.mock('@/profile/use-profile', () => ({ useProfile: () => ({ profile: { id: 3, role: 'SELLER' } }) }));
jest.mock('@/reviews/use-seller-reviews', () => ({ useSellerReviews: () => ({ page: { summary: { count: 2, average_rating: 4.5 } }, busy: false, error: false, load: jest.fn() }) }));
jest.mock('@/services/product-service', () => ({
  createProductService: () => ({ getMyProducts: (...args: unknown[]) => mockGetMyProducts(...args) }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockGetMyProducts.mockResolvedValue({
    items: [
      { id: '42', name: 'เสื้อพร้อมขาย', price: '250', status: 'AVAILABLE', mainImageUrl: null },
      { id: '43', name: 'เสื้อขายแล้ว', price: '300', status: 'SOLD', mainImageUrl: null },
    ],
    hasNext: false,
  });
});

test('loads seller inventory with the token and opens available product edit', async () => {
  render(<MyProductsScreen />);
  expect(await screen.findByText('เสื้อพร้อมขาย')).toBeTruthy();
  expect(screen.getByText('★ 4.5 (2 รีวิว) ›')).toBeTruthy();
  expect(mockGetMyProducts).toHaveBeenCalledWith(1, 'seller-token');
  await fireEvent.press(screen.getByRole('button', { name: 'แก้ไขสินค้า เสื้อพร้อมขาย' }));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/product/[id]/edit', params: { id: '42' } });
  const sold = screen.getByRole('button', { name: 'สินค้า เสื้อขายแล้ว ขายแล้ว' });
  expect(sold.props.accessibilityState?.disabled ?? sold.props.disabled).toBeTruthy();
});
