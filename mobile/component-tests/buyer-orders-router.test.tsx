import fs from 'node:fs';
import path from 'node:path';
import { Text } from 'react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import TabLayout from '@/app/_layout';

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

// Exercise the installed Expo Router, including discovered nested routes, so
// unregistered/unsupported screens cannot silently bypass the buyer boundary.
const allowed = new Set([
  'index', 'products/index', 'products/[id]', 'auth/callback', 'checkout/[productId]',
  'login', 'orders/index', 'orders/[orderId]', 'profile', 'receipt/[orderId]',
]);
const mockUnsupportedRender = jest.fn();
const appRoot = path.resolve(__dirname, '../src/app');
const routes: Record<string, any> = {};
for (const file of fs.readdirSync(appRoot, { recursive: true })) {
  if (typeof file !== 'string' || !file.endsWith('.tsx')) continue;
  const route = file.slice(0, -4);
  if (route === '_layout') routes[route] = TabLayout;
  else if (allowed.has(route)) {
    routes[route] = () => <Text testID={`allowed:${route}`}>{route}</Text>;
  } else {
    routes[route] = () => {
      mockUnsupportedRender(route);
      return <Text>Unsupported: {route}</Text>;
    };
  }
}
const urlFor = (route: string) => '/' + route
  .replace(/\[(?:orderId|productId|inspectionId|id)\]/g, '42')
  .replace('[token]', 'public-token').replace(/\/index$/, '').replace(/^index$/, '');
const unsupported = Object.keys(routes).filter(route =>
  !allowed.has(route) && !route.endsWith('_layout'));

beforeEach(() => {
  process.env.EXPO_PUBLIC_CATALOG_ONLY = 'false';
  process.env.EXPO_PUBLIC_BUYER_ORDERS = 'true';
  mockUnsupportedRender.mockClear();
});
afterEach(() => {
  delete process.env.EXPO_PUBLIC_CATALOG_ONLY;
  delete process.env.EXPO_PUBLIC_BUYER_ORDERS;
  jest.useRealTimers();
});

test.each(unsupported)('buyer runtime redirects %s without mounting it', route => {
  const view = renderRouter(routes, { initialUrl: urlFor(route) });
  expect(view.getPathname()).toBe('/');
  expect(screen.getByTestId('allowed:index')).toBeTruthy();
  expect(mockUnsupportedRender).not.toHaveBeenCalled();
});

test.each([...allowed])('buyer runtime allows %s', route => {
  const url = urlFor(route);
  const view = renderRouter(routes, { initialUrl: url });
  expect(view.getPathname()).toBe(url);
  expect(screen.getByTestId(`allowed:${route}`)).toBeTruthy();
  expect(mockUnsupportedRender).not.toHaveBeenCalled();
});
