import 'react-native-url-polyfill/auto.js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | undefined;

export function getSupabaseClient(): SupabaseClient | null {
  if (process.env.EXPO_PUBLIC_INSPECT_DEMO === 'true') return null;
  const isWeb = process.env.EXPO_OS === 'web';
  const isWebServer = isWeb && typeof window === 'undefined';
  if (isWebServer) return null;
  if (client) return client;

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) return null;

  client = createClient(url, publishableKey, {
    auth: {
      storage: isWeb ? window.localStorage : AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'implicit',
    },
  });
  return client;
}
