import { useEffect, useState } from 'react';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider } from '@/auth/auth-provider';
import { ReviewProvider } from '@/admin/review-provider';
import { Colors } from '@/constants/theme';
import { OrdersProvider } from '@/orders/orders-provider';
import { BoundFulfillmentPortProvider } from '@/orders/fulfillment-binding';
import { VerificationProvider } from '@/verification/verification-provider';
import { WondeeThemeProvider, useThemePreference } from '@/theme/theme-provider';
import { SplashScreenView } from '@/components/wondee/splash-screen';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function TabLayout() {
  return <WondeeThemeProvider><AppLayout /></WondeeThemeProvider>;
}

function AppLayout() {
  const { scheme: colorScheme, ready } = useThemePreference();
  const [splashFinished, setSplashFinished] = useState(() => process.env.NODE_ENV === 'test');
  const [fontsLoaded, fontError] = useFonts({
    'Prompt-Regular': require('@/assets/fonts/Prompt-Regular.ttf'),
    'Prompt-Medium': require('@/assets/fonts/Prompt-Medium.ttf'),
    'Prompt-SemiBold': require('@/assets/fonts/Prompt-SemiBold.ttf'),
    'Prompt-Bold': require('@/assets/fonts/Prompt-Bold.ttf'),
    'Prompt-ExtraBold': require('@/assets/fonts/Prompt-ExtraBold.ttf'),
    'PlusJakartaSans': require('@/assets/fonts/PlusJakartaSans.ttf'),
  });
  useEffect(() => { if (ready && (fontsLoaded || fontError)) void SplashScreen.hideAsync(); }, [ready, fontsLoaded, fontError]);
  if (!ready || (!fontsLoaded && !fontError)) return null;
  const theme = Colors[colorScheme === 'dark' ? 'dark' : 'light'];
  return (
    <ThemeProvider value={{ ...(colorScheme === 'dark' ? DarkTheme : DefaultTheme), colors: { ...(colorScheme === 'dark' ? DarkTheme : DefaultTheme).colors, primary: theme.primary, background: theme.background, card: theme.surface, text: theme.text, border: theme.border } }}>
      <AuthProvider>
        <BoundFulfillmentPortProvider>
        <VerificationProvider>
          <ReviewProvider>
            <OrdersProvider>
              <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: theme.background },
                  animation: 'slide_from_right',
                  animationDuration: 250,
                }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="login" />
                <Stack.Screen name="profile" />
                <Stack.Screen name="sell" />
                <Stack.Screen name="auth/callback" />
                <Stack.Screen name="seller-verification" />
                <Stack.Screen name="admin-verifications" />
                <Stack.Screen name="buy-by-product-id" />
                <Stack.Screen name="products/index" />
                <Stack.Screen name="products/[id]" />
                <Stack.Screen name="product" />
                <Stack.Screen name="checkout/[productId]" />
                <Stack.Screen name="orders/index" />
                <Stack.Screen name="orders/[orderId]" />
                <Stack.Screen name="receipt/[orderId]" />
                <Stack.Screen name="orders/[orderId]/inspection" />
                <Stack.Screen name="orders/[orderId]/ship-to-center" />
                <Stack.Screen name="orders/[orderId]/review" />
                <Stack.Screen name="certificates/[token]" />
                {/* Staff route names supplied to UI2; screens and guards live in UI2 modules. */}
                <Stack.Screen name="inspections/index" />
                <Stack.Screen name="inspections/[inspectionId]" />
                <Stack.Screen name="admin-deliveries" />
                <Stack.Screen name="admin-legacy-couriers" />
                <Stack.Screen name="admin-certificates/index" />
                <Stack.Screen name="admin-certificates/[certificateId]" />
              </Stack>
              {!splashFinished ? (
                <SplashScreenView onFinish={() => setSplashFinished(true)} />
              ) : null}
            </OrdersProvider>
          </ReviewProvider>
        </VerificationProvider>
        </BoundFulfillmentPortProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
