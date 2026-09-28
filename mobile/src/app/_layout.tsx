import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { WondeeThemeProvider, useThemePreference } from '@/theme/theme-provider';

import { useEffect } from 'react';
import { useFonts } from 'expo-font';
import { Colors } from '@/constants/theme';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '@/auth/auth-provider';
import { ReviewProvider } from '@/admin/review-provider';
import { OrdersProvider } from '@/orders/orders-provider';
import { VerificationProvider } from '@/verification/verification-provider';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function TabLayout() {
  return <WondeeThemeProvider><AppLayout /></WondeeThemeProvider>;
}

function AppLayout() {
  const { scheme: colorScheme, ready } = useThemePreference();
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
        <VerificationProvider>
          <ReviewProvider>
            <OrdersProvider>
              <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }}>
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
              </Stack>
            </OrdersProvider>
          </ReviewProvider>
        </VerificationProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
