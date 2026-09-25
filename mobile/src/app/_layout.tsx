import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

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
  const colorScheme = useColorScheme();
  const [fontsLoaded, fontError] = useFonts({
    'Kanit-Medium': require('@/assets/fonts/Kanit-Medium.ttf'),
    'Kanit-SemiBold': require('@/assets/fonts/Kanit-SemiBold.ttf'),
    'NotoSansThai-Regular': require('@/assets/fonts/NotoSansThai-Regular.ttf'),
    'NotoSansThai-Medium': require('@/assets/fonts/NotoSansThai-Medium.ttf'),
  });
  useEffect(() => { if (fontsLoaded || fontError) void SplashScreen.hideAsync(); }, [fontsLoaded, fontError]);
  if (!fontsLoaded && !fontError) return null;
  const theme = Colors[colorScheme === 'dark' ? 'dark' : 'light'];
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
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
