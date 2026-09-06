import type { Session } from '@supabase/supabase-js';
import { makeRedirectUri } from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect,
  useMemo, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { parseAuthCallback } from './auth-callback';
import { createGoogleLoginAdapter } from './google-login-adapter';
import type { LoginAdapter, LoginResult } from './login-controller';
import { getSupabaseClient } from './supabase-client';
import { verifyAccountWithRefresh } from './session-account';
import { createMeService, MeServiceError, type MeResult } from '@/services/me-service';

function getAuthRedirectUri(): string | null {
  if (Platform.OS === 'web' && typeof window === 'undefined') return null;
  return makeRedirectUri({
    scheme: 'secondhandmarketplace',
    path: 'auth/callback',
  });
}

type AuthContextValue = {
  initializing: boolean;
  session: Session | null;
  account: MeResult | null;
  accountChecking: boolean;
  accountError: LoginResult | null;
  loginAdapter?: LoginAdapter;
  retryAccount(): Promise<void>;
  logout(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const activeCallbacks = new Map<string, Promise<LoginResult>>();
const completedCallbacks = new Set<string>();
let authEpoch = 0;

function mapMeError(error: unknown): LoginResult {
  if (error instanceof MeServiceError) return error.kind;
  if (typeof error === 'object' && error !== null && 'kind' in error && error.kind === 'unauthorized') {
    return 'unauthorized';
  }
  return 'backend-error';
}

export function AuthProvider({ children }: PropsWithChildren) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const redirectTo = useMemo(() => getAuthRedirectUri(), []);
  const meService = useMemo(() => createMeService({ baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL }), []);
  const [initializing, setInitializing] = useState(supabase !== null);
  const [session, setSession] = useState<Session | null>(null);
  const [account, setAccount] = useState<MeResult | null>(null);
  const [accountChecking, setAccountChecking] = useState(false);
  const [accountError, setAccountError] = useState<LoginResult | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      WebBrowser.maybeCompleteAuthSession();
    }
  }, []);

  const loadAccount = useCallback(async (nextSession: Session, signal?: AbortSignal) => {
    if (!supabase) throw new MeServiceError('unauthorized');
    let result: MeResult;
    try {
      result = await verifyAccountWithRefresh({
        accessToken: nextSession.access_token,
        getMe: token => meService.getMe(token, signal),
        refresh: async () => {
          const { data, error } = await supabase.auth.refreshSession();
          return error || !data.session ? null : { accessToken: data.session.access_token };
        },
      });
    } catch (error) {
      if (mapMeError(error) === 'unauthorized') await supabase.auth.signOut({ scope: 'local' });
      throw error;
    }
    return result;
  }, [meService, supabase]);

  const verifyAccount = useCallback(async (
    nextSession: Session,
    signal?: AbortSignal,
    expectedEpoch = authEpoch,
  ) => {
    setAccountChecking(true);
    setAccountError(null);
    try {
      const result = await loadAccount(nextSession, signal);
      if (!signal?.aborted && expectedEpoch === authEpoch) setAccount(result);
      return result;
    } catch (error) {
      if (!signal?.aborted && expectedEpoch === authEpoch) setAccountError(mapMeError(error));
      throw error;
    } finally {
      if (!signal?.aborted && expectedEpoch === authEpoch) setAccountChecking(false);
    }
  }, [loadAccount]);

  const processCallback = useCallback(async (url: string, signal?: AbortSignal): Promise<LoginResult> => {
    if (!supabase || !redirectTo) return 'oauth-error';
    const existing = activeCallbacks.get(url);
    if (existing) return existing;
    const epoch = authEpoch;
    const operation = (async () => {
      const parsed = parseAuthCallback(url, redirectTo);
      if (!parsed || 'error' in parsed) return 'oauth-error';
      const fingerprint = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, url);
      if (completedCallbacks.has(fingerprint)) return 'success';
      if (signal?.aborted) return 'cancelled';
      const { data, error } = await supabase.auth.setSession({
        access_token: parsed.accessToken,
        refresh_token: parsed.refreshToken,
      });
      if (error || !data.session) return 'oauth-error';
      if (signal?.aborted) return 'cancelled';
      try {
        await verifyAccount(data.session, signal, epoch);
        if (signal?.aborted || epoch !== authEpoch) return 'cancelled';
        completedCallbacks.add(fingerprint);
        return 'success';
      } catch (error) {
        if (signal?.aborted) return 'cancelled';
        return mapMeError(error);
      }
    })().finally(() => activeCallbacks.delete(url));
    activeCallbacks.set(url, operation);
    return operation;
  }, [redirectTo, supabase, verifyAccount]);

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session) {
        try { await verifyAccount(data.session); } catch { setAccount(null); }
      }
      if (mounted) setInitializing(false);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      if (!nextSession) {
        setAccount(null);
        setAccountError(null);
        setAccountChecking(false);
      }
    });
    return () => { mounted = false; subscription.subscription.unsubscribe(); };
  }, [supabase, verifyAccount]);

  useEffect(() => {
    if (!supabase || Platform.OS === 'web') return;
    const updateRefresh = (state: string) => {
      if (state === 'active') void supabase.auth.startAutoRefresh();
      else void supabase.auth.stopAutoRefresh();
    };
    updateRefresh(AppState.currentState);
    const subscription = AppState.addEventListener('change', updateRefresh);
    return () => { subscription.remove(); void supabase.auth.stopAutoRefresh(); };
  }, [supabase]);

  useEffect(() => {
    const handleUrl = ({ url }: { url: string }) => { void processCallback(url); };
    const subscription = Linking.addEventListener('url', handleUrl);
    void Linking.getInitialURL().then(url => { if (url) void processCallback(url); });
    return () => subscription.remove();
  }, [processCallback]);

  const loginAdapter = useMemo(() => {
    if (!supabase || !redirectTo) return undefined;
    return createGoogleLoginAdapter({
      platform: Platform.OS === 'web' ? 'web' : 'native',
      redirectTo,
      signIn: async options => {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: options.provider,
          options: { redirectTo: options.redirectTo, skipBrowserRedirect: options.skipBrowserRedirect },
        });
        if (error) return {};
        return { url: data.url };
      },
      openBrowser: Platform.OS === 'web' ? undefined : WebBrowser.openAuthSessionAsync,
      processCallback,
      dismissBrowser: Platform.OS === 'web' ? undefined : () => {
        try { WebBrowser.dismissAuthSession(); } catch { /* no active session */ }
      },
    });
  }, [processCallback, redirectTo, supabase]);

  const logout = useCallback(async () => {
    authEpoch += 1;
    try {
      if (supabase) await supabase.auth.signOut();
    } finally {
      setSession(null);
      setAccount(null);
      setAccountError(null);
      setAccountChecking(false);
      completedCallbacks.clear();
    }
  }, [supabase]);

  const retryAccount = useCallback(async () => {
    if (!session || accountChecking) return;
    try { await verifyAccount(session); } catch { /* safe UI state set by verifyAccount */ }
  }, [accountChecking, session, verifyAccount]);

  return <AuthContext.Provider value={{ initializing, session, account, accountChecking,
    accountError, loginAdapter, retryAccount, logout }}>
    {children}
  </AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
