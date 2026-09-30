import type { Session } from '@supabase/supabase-js';
import { makeRedirectUri } from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect,
  useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { parseAuthCallback } from './auth-callback';
import { createGoogleLoginAdapter } from './google-login-adapter';
import type { LoginAdapter, LoginResult } from './login-controller';
import { getSupabaseClient } from './supabase-client';
import { verifyAccountWithRefresh, withTokenRefresh } from './session-account';
import { createMeService, MeServiceError, type MeErrorKind, type MeResult,
  type SelectableRole } from '@/services/me-service';

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
  roleSaving: boolean;
  roleError: MeErrorKind | null;
  loginAdapter?: LoginAdapter;
  selectRole(role: SelectableRole): Promise<void>;
  retryAccount(): Promise<void>;
  logout(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const activeCallbacks = new Map<string, Promise<LoginResult>>();
const completedCallbacks = new Set<string>();
const callbackSessionTokens = new Set<string>();
let authEpoch = 0;

function getMeErrorKind(error: unknown): MeErrorKind | null {
  if (error instanceof MeServiceError) return error.kind;
  if (typeof error === 'object' && error !== null && 'kind' in error
    && typeof error.kind === 'string') {
    const kinds: MeErrorKind[] = ['unauthorized', 'forbidden', 'conflict', 'validation-error',
      'not-configured', 'network-error', 'server-error'];
    if (kinds.includes(error.kind as MeErrorKind)) return error.kind as MeErrorKind;
  }
  return null;
}

function mapMeError(error: unknown): LoginResult {
  const kind = getMeErrorKind(error);
  if (kind) {
    if (['unauthorized', 'forbidden', 'network-error', 'server-error'].includes(kind)) {
      return kind as LoginResult;
    }
    return 'backend-error';
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
  const [roleSaving, setRoleSaving] = useState(false);
  const [roleError, setRoleError] = useState<MeErrorKind | null>(null);
  const roleSavingRef = useRef(false);
  const roleAbortRef = useRef<AbortController | null>(null);
  const sessionUserIdRef = useRef<string | null>(null);
  const currentSessionRef = useRef<Session | null>(null);

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
      // The implicit OAuth callback contains credentials. Remove them from the
      // browser address/history after parsing, including failed callbacks.
      if (parsed && Platform.OS === 'web' && typeof window !== 'undefined') {
        window.history.replaceState(window.history.state, '', window.location.pathname);
      }
      if (!parsed || 'error' in parsed) return 'oauth-error';
      const fingerprint = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, url);
      if (completedCallbacks.has(fingerprint)) return 'success';
      if (signal?.aborted) return 'cancelled';
      callbackSessionTokens.add(parsed.accessToken);
      let sessionResult;
      try {
        sessionResult = await supabase.auth.setSession({
          access_token: parsed.accessToken,
          refresh_token: parsed.refreshToken,
        });
      } finally {
        callbackSessionTokens.delete(parsed.accessToken);
      }
      const { data, error } = sessionResult;
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
      currentSessionRef.current = data.session;
      sessionUserIdRef.current = data.session?.user.id ?? null;
      setSession(data.session);
      if (data.session) {
        try { await verifyAccount(data.session); } catch { setAccount(null); }
      }
      if (mounted) setInitializing(false);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      const previousUserId = sessionUserIdRef.current;
      const nextUserId = nextSession?.user.id ?? null;
      const callbackOwnsVerification = event === 'SIGNED_IN'
        && callbackSessionTokens.delete(nextSession?.access_token ?? '');
      if (sessionUserIdRef.current && sessionUserIdRef.current !== nextUserId) {
        authEpoch += 1;
        roleAbortRef.current?.abort();
        roleAbortRef.current = null;
        roleSavingRef.current = false;
        setRoleSaving(false);
        setRoleError(null);
        setAccount(null);
      }
      currentSessionRef.current = nextSession;
      sessionUserIdRef.current = nextUserId;
      setSession(nextSession);
      if (!nextSession) {
        setAccount(null);
        setAccountError(null);
        setAccountChecking(false);
        setRoleSaving(false);
        setRoleError(null);
      } else if (!callbackOwnsVerification && previousUserId !== nextUserId) {
        const expectedEpoch = authEpoch;
        void Promise.resolve().then(async () => {
          try {
            await verifyAccount(nextSession, undefined, expectedEpoch);
          } catch {
            if (mounted && expectedEpoch === authEpoch
              && sessionUserIdRef.current === nextUserId) setAccount(null);
          }
        });
      }
    });
    return () => {
      mounted = false;
      roleAbortRef.current?.abort();
      subscription.subscription.unsubscribe();
    };
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

  const clearSession = useCallback(async (scope: 'local' | 'global') => {
    authEpoch += 1;
    callbackSessionTokens.clear();
    currentSessionRef.current = null;
    sessionUserIdRef.current = null;
    roleAbortRef.current?.abort();
    roleAbortRef.current = null;
    roleSavingRef.current = false;
    try {
      if (supabase) await supabase.auth.signOut({ scope });
    } finally {
      setSession(null);
      setAccount(null);
      setAccountError(null);
      setAccountChecking(false);
      setRoleSaving(false);
      setRoleError(null);
      completedCallbacks.clear();
    }
  }, [supabase]);

  const selectRole = useCallback(async (role: SelectableRole) => {
    if (!supabase || !session || roleSavingRef.current) return;
    const expectedEpoch = authEpoch;
    const expectedUserId = session.user.id;
    let latestSession = currentSessionRef.current?.user.id === expectedUserId
      ? currentSessionRef.current
      : session;
    const controller = new AbortController();
    roleAbortRef.current?.abort();
    roleAbortRef.current = controller;
    roleSavingRef.current = true;
    setRoleSaving(true);
    setRoleError(null);
    try {
      const result = await withTokenRefresh({
        accessToken: latestSession.access_token,
        request: token => meService.setRole(token, role, controller.signal),
        refresh: async () => {
          const { data, error } = await supabase.auth.refreshSession();
          if (error || !data.session) return null;
          latestSession = data.session;
          currentSessionRef.current = data.session;
          return { accessToken: data.session.access_token };
        },
      });
      if (!controller.signal.aborted && expectedEpoch === authEpoch
        && sessionUserIdRef.current === expectedUserId) setAccount(result);
    } catch (error) {
      if (controller.signal.aborted || expectedEpoch !== authEpoch
        || sessionUserIdRef.current !== expectedUserId) return;
      const kind = getMeErrorKind(error) ?? 'server-error';
      if (kind === 'unauthorized') {
        await clearSession('local').catch(() => undefined);
        return;
      }
      if (kind === 'conflict') {
        try {
          const reloadSession = currentSessionRef.current?.user.id === expectedUserId
            ? currentSessionRef.current
            : latestSession;
          const latest = await loadAccount(reloadSession, controller.signal);
          if (!controller.signal.aborted && expectedEpoch === authEpoch
            && sessionUserIdRef.current === expectedUserId) setAccount(latest);
        } catch (reloadError) {
          if (!controller.signal.aborted) {
            setRoleError(reloadError instanceof MeServiceError ? reloadError.kind : 'server-error');
          }
        }
      } else {
        setRoleError(kind);
      }
    } finally {
      if (roleAbortRef.current === controller) roleAbortRef.current = null;
      if (!controller.signal.aborted && expectedEpoch === authEpoch
        && sessionUserIdRef.current === expectedUserId) {
        roleSavingRef.current = false;
        setRoleSaving(false);
      }
    }
  }, [clearSession, loadAccount, meService, session, supabase]);

  const logout = useCallback(async () => clearSession('global'), [clearSession]);

  const retryAccount = useCallback(async () => {
    if (!session || accountChecking) return;
    try { await verifyAccount(session); } catch { /* safe UI state set by verifyAccount */ }
  }, [accountChecking, session, verifyAccount]);

  return <AuthContext.Provider value={{ initializing, session, account, accountChecking,
    accountError, roleSaving, roleError, loginAdapter, selectRole, retryAccount, logout }}>
    {children}
  </AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}

export function useOptionalAuth() {
  return useContext(AuthContext);
}
