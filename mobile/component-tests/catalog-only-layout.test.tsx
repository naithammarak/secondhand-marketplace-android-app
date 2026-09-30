import { render, screen } from '@testing-library/react-native';

import TabLayout from '@/app/_layout';

jest.mock('expo-router', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const Fragment = React.Fragment;
  const Stack: any = ({ children }: { children: React.ReactNode }) => React.createElement(Fragment, null, children);
  const MockStackScreen: React.FC<{ name: string }> = ({ name }) =>
    React.createElement(Text, { testID: `route:${name}` }, name);
  MockStackScreen.displayName = 'MockStackScreen';
  Stack.Screen = MockStackScreen;
  const MockStackProtected: React.FC<{ guard: boolean; children: React.ReactNode }> = ({ guard, children }) =>
    guard ? React.createElement(Fragment, null, children) : null;
  MockStackProtected.displayName = 'MockStackProtected';
  Stack.Protected = MockStackProtected;
  const Provider = ({ children }: { children: React.ReactNode }) => React.createElement(Fragment, null, children);
  return {
    DarkTheme: { colors: {} },
    DefaultTheme: { colors: {} },
    Stack,
    ThemeProvider: Provider,
  };
});

jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn().mockResolvedValue(undefined),
  hideAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('@/auth/auth-provider', () => ({ AuthProvider: ({ children }: any) => children }));
jest.mock('@/admin/review-provider', () => ({ ReviewProvider: ({ children }: any) => children }));
jest.mock('@/orders/orders-provider', () => ({ OrdersProvider: ({ children }: any) => children }));
jest.mock('@/verification/verification-provider', () => ({ VerificationProvider: ({ children }: any) => children }));
jest.mock('@/theme/theme-provider', () => ({
  WondeeThemeProvider: ({ children }: any) => children,
  useThemePreference: () => ({ scheme: 'light', ready: true }),
}));
jest.mock('@/components/wondee/splash-screen', () => ({ SplashScreenView: () => null }));

beforeEach(() => {
  process.env.EXPO_PUBLIC_CATALOG_ONLY = 'true';
});

afterEach(() => {
  delete process.env.EXPO_PUBLIC_CATALOG_ONLY;
});

test('catalog-only stack keeps browsing and removes direct links to unsupported screens', () => {
  render(<TabLayout />);

  expect(screen.getByTestId('route:index')).toBeTruthy();
  expect(screen.getByTestId('route:products/index')).toBeTruthy();
  expect(screen.getByTestId('route:products/[id]')).toBeTruthy();

  // These are the Expo Router screen names for direct paths such as /orders/42,
  // /checkout/42, /product/42/edit (nested under product), /login, and /sell.
  for (const route of [
    'login',
    'profile',
    'sell',
    'orders/[orderId]',
    'orders/[orderId]/inspection',
    'checkout/[productId]',
    'product',
    'auth/callback',
    'certificates/[token]',
  ]) {
    expect(screen.queryByTestId(`route:${route}`)).toBeNull();
  }
});

test('full mode continues to register login, profile, selling and order screens', () => {
  delete process.env.EXPO_PUBLIC_CATALOG_ONLY;
  render(<TabLayout />);

  for (const route of ['login', 'profile', 'sell', 'orders/[orderId]', 'checkout/[productId]']) {
    expect(screen.getByTestId(`route:${route}`)).toBeTruthy();
  }
});
