import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider } from '@/auth/auth-provider';
import { ReviewProvider } from '@/admin/review-provider';
import { OrdersProvider } from '@/orders/orders-provider';
import { VerificationProvider } from '@/verification/verification-provider';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <VerificationProvider>
          <ReviewProvider>
            <OrdersProvider>
              <AnimatedSplashOverlay />
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="auth/callback" />
                <Stack.Screen name="seller-verification" />
                <Stack.Screen name="admin-verifications" />
                <Stack.Screen name="buy-by-product-id" />
                <Stack.Screen name="products/index" />
                <Stack.Screen name="products/[id]" />
                <Stack.Screen name="product/new" />
                <Stack.Screen name="product/mine" />
                <Stack.Screen name="product/[id]/edit" />
                <Stack.Screen name="checkout/[productId]" />
                <Stack.Screen name="orders/index" />
                <Stack.Screen name="orders/[orderId]" />
                <Stack.Screen name="receipt/[orderId]" />
              </Stack>
            </OrdersProvider>
          </ReviewProvider>
        </VerificationProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
