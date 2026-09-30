import { useEffect, useState } from 'react';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider } from '@/auth/auth-provider';
import { ReviewProvider } from '@/admin/review-provider';
import { Colors } from '@/constants/theme';
import { OrdersProvider } from '@/orders/orders-provider';
import { VerificationProvider } from '@/verification/verification-provider';
import { WondeeThemeProvider, useThemePreference } from '@/theme/theme-provider';
import { SplashScreenView } from '@/components/wondee/splash-screen';
import { isCatalogOnlyMode } from '@/runtime/catalog-capability';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function TabLayout() {
  return <WondeeThemeProvider><AppLayout /></WondeeThemeProvider>;
}

function AppLayout() {
  const { scheme: colorScheme, ready } = useThemePreference();
  const catalogOnly = isCatalogOnlyMode();
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
        {catalogOnly ? (
          <AppRoutes
            theme={theme}
            catalogOnly
            splashFinished={splashFinished}
            onSplashFinish={() => setSplashFinished(true)}
          />
        ) : (
          <VerificationProvider>
            <ReviewProvider>
              <OrdersProvider>
                <AppRoutes
                  theme={theme}
                  catalogOnly={false}
                  splashFinished={splashFinished}
                  onSplashFinish={() => setSplashFinished(true)}
                />
              </OrdersProvider>
            </ReviewProvider>
          </VerificationProvider>
        )}
      </AuthProvider>
    </ThemeProvider>
  );
}

const nonCatalogRoutes = [
  'admin-deliveries',
  'admin-verifications',
  'auth/callback',
  'buy-by-product-id',
  'certificates/[token]',
  'checkout/[productId]',
  'courier/index',
  'explore',
  'inspections/index',
  'inspections/[inspectionId]',
  'login',
  'orders/index',
  'orders/[orderId]',
  'orders/[orderId]/inspection',
  'orders/[orderId]/review',
  'orders/[orderId]/ship-to-center',
  'product',
  'profile',
  'receipt/[orderId]',
  'sell',
  'seller-verification',
] as const;

function AppRoutes({ theme, catalogOnly, splashFinished, onSplashFinish }: {
  theme: (typeof Colors)[keyof typeof Colors];
  catalogOnly: boolean;
  splashFinished: boolean;
  onSplashFinish(): void;
}) {
  return (
    <>
      <StatusBar style={theme === Colors.dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.background },
          animation: 'slide_from_right',
          animationDuration: 250,
        }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="products/index" />
        <Stack.Screen name="products/[id]" />
        <Stack.Protected guard={!catalogOnly}>
          {nonCatalogRoutes.map(name => <Stack.Screen key={name} name={name} />)}
        </Stack.Protected>
      </Stack>
      {!splashFinished ? <SplashScreenView onFinish={onSplashFinish} /> : null}
    </>
  );
}
