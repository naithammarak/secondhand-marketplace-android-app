import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { AuthProvider, useAuth } from '@/auth/auth-provider';

let mockSupabase: any;
let authStateChange: ((event: string, nextSession: any) => void) | undefined;
let currentLoginAdapter: ReturnType<typeof useAuth>['loginAdapter'];

jest.mock('expo-auth-session', () => ({
  makeRedirectUri: () => 'secondhandmarketplace://auth/callback',
}));
jest.mock('expo-web-browser', () => ({
  dismissAuthSession: jest.fn(),
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(),
}));
jest.mock('@/auth/supabase-client', () => ({ getSupabaseClient: () => mockSupabase }));

const session = {
  access_token: 'old-token',
  refresh_token: 'refresh-token',
  user: { id: 'user-1' },
};

function response(fullName: string, role: string | null, status = 200) {
  return new Response(JSON.stringify({ full_name: fullName, role }), { status });
}

function makeSupabase() {
  return {
    auth: {
      getSession: jest.fn(async () => ({ data: { session } })),
      onAuthStateChange: jest.fn((callback) => {
        authStateChange = callback;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      }),
      refreshSession: jest.fn(async () => ({
        data: { session: { ...session, access_token: 'fresh-token' } }, error: null,
      })),
      signOut: jest.fn(async () => ({ error: null })),
      startAutoRefresh: jest.fn(),
      stopAutoRefresh: jest.fn(),
      setSession: jest.fn(),
      signInWithOAuth: jest.fn(),
    },
  };
}

function Probe() {
  const auth = useAuth();
  useEffect(() => { currentLoginAdapter = auth.loginAdapter; }, [auth.loginAdapter]);
  return (
    <View>
      <Text>{auth.session ? 'SIGNED_IN' : 'SIGNED_OUT'}</Text>
      <Text testID="account">{auth.account ? `${auth.account.fullName}:${auth.account.role ?? 'NONE'}` : 'NO_ACCOUNT'}</Text>
      <Text testID="saving">{auth.roleSaving ? 'SAVING' : 'IDLE'}</Text>
      <Text testID="role-error">{auth.roleError ?? 'NO_ERROR'}</Text>
      <Text testID="login-adapter">{auth.loginAdapter ? 'AVAILABLE' : 'DISABLED'}</Text>
      <TouchableOpacity accessibilityRole="button" onPress={() => void auth.selectRole('BUYER')}>
        <Text>SELECT_BUYER</Text>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" onPress={() => void auth.selectRole('SELLER')}>
        <Text>SELECT_SELLER</Text>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" onPress={() => void auth.logout()}>
        <Text>LOGOUT</Text>
      </TouchableOpacity>
    </View>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  authStateChange = undefined;
  currentLoginAdapter = undefined;
  mockSupabase = makeSupabase();
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.test';
  delete process.env.EXPO_PUBLIC_CATALOG_ONLY;
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.EXPO_PUBLIC_CATALOG_ONLY;
});

test('catalog-only mode ignores a persisted session and does not initialize auth', async () => {
  process.env.EXPO_PUBLIC_CATALOG_ONLY = 'true';
  const fetch = jest.spyOn(global, 'fetch');

  await render(<AuthProvider><Probe /></AuthProvider>);

  expect(screen.getByText('SIGNED_OUT')).toBeTruthy();
  expect(screen.getByTestId('account').props.children).toBe('NO_ACCOUNT');
  expect(screen.getByTestId('login-adapter').props.children).toBe('DISABLED');
  expect(mockSupabase.auth.getSession).not.toHaveBeenCalled();
  expect(mockSupabase.auth.onAuthStateChange).not.toHaveBeenCalled();
  expect(mockSupabase.auth.refreshSession).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

test('saves a role and refreshes an expired token only once', async () => {
  const calls: Array<{ url: string; authorization?: string }> = [];
  jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    calls.push({ url, authorization: (init?.headers as Record<string, string>)?.Authorization });
    if (url.endsWith('/auth/google')) return response('Provider User', null);
    if (url.endsWith('/auth/me')) return response('Provider User', null);
    const roleCalls = calls.filter(call => call.url.endsWith('/auth/role'));
    if (roleCalls.length === 1) return new Response('', { status: 401 });
    return response('Provider User', 'BUYER');
  });

  await render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(screen.getByTestId('account').props.children).toBe('Provider User:NONE'));
  await fireEvent.press(screen.getByText('SELECT_BUYER'));
  await waitFor(() => expect(screen.getByTestId('account').props.children).toBe('Provider User:BUYER'));

  expect(mockSupabase.auth.refreshSession).toHaveBeenCalledTimes(1);
  expect(calls.filter(call => call.url.endsWith('/auth/role')).map(call => call.authorization))
    .toEqual(['Bearer old-token', 'Bearer fresh-token']);
});

test.each([
  ['refresh returns an error', { data: { session: null }, error: new Error('refresh failed') }],
  ['refresh returns no session', { data: { session: null }, error: null }],
])('signs out instead of showing server-error when %s', async (_caseName, refreshResult) => {
  mockSupabase.auth.refreshSession.mockResolvedValue(refreshResult);
  const calls: string[] = [];
  jest.spyOn(global, 'fetch').mockImplementation(async input => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith('/auth/google') || url.endsWith('/auth/me')) return response('Expired User', null);
    return new Response('', { status: 401 });
  });

  await render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(screen.getByTestId('account').props.children).toBe('Expired User:NONE'));
  await fireEvent.press(screen.getByText('SELECT_BUYER'));

  await waitFor(() => expect(screen.getByText('SIGNED_OUT')).toBeTruthy());
  expect(screen.getByTestId('role-error').props.children).not.toBe('server-error');
  expect(mockSupabase.auth.refreshSession).toHaveBeenCalledTimes(1);
  expect(mockSupabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  expect(calls.filter(url => url.endsWith('/auth/role'))).toHaveLength(1);
});

test('reloads the stored backend role after a 409 conflict', async () => {
  let meCalls = 0;
  jest.spyOn(global, 'fetch').mockImplementation(async input => {
    const url = String(input);
    if (url.endsWith('/auth/google')) return response('Conflict User', null);
    if (url.endsWith('/auth/me')) {
      meCalls += 1;
      return response('Conflict User', meCalls === 1 ? null : 'SELLER');
    }
    return new Response('', { status: 409 });
  });

  await render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(screen.getByTestId('account').props.children).toBe('Conflict User:NONE'));
  await fireEvent.press(screen.getByText('SELECT_BUYER'));
  await waitFor(() => expect(screen.getByTestId('account').props.children).toBe('Conflict User:SELLER'));
  expect(screen.getByTestId('role-error').props.children).toBe('NO_ERROR');
});

test('uses the refreshed access token when reloading after a role conflict', async () => {
  const calls: Array<{ url: string; authorization?: string }> = [];
  jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const authorization = (init?.headers as Record<string, string>)?.Authorization;
    calls.push({ url, authorization });
    if (url.endsWith('/auth/role') && authorization === 'Bearer old-token') {
      return new Response('', { status: 401 });
    }
    if (url.endsWith('/auth/role')) return new Response('', { status: 409 });
    return response('Conflict User', url.endsWith('/auth/me') ? 'SELLER' : null);
  });

  await render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(screen.getByTestId('account').props.children).toBe('Conflict User:SELLER'));
  await fireEvent.press(screen.getByText('SELECT_BUYER'));
  await waitFor(() => expect(screen.getByTestId('saving').props.children).toBe('IDLE'));

  const reloadCalls = calls.slice(calls.findIndex(call => call.url.endsWith('/auth/role')) + 2);
  expect(reloadCalls.filter(call => call.url.endsWith('/auth/google') || call.url.endsWith('/auth/me'))
    .map(call => call.authorization)).toEqual(['Bearer fresh-token', 'Bearer fresh-token']);
});

test('loads the account when a signed-in session arrives from an auth event', async () => {
  mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null } });
  jest.spyOn(global, 'fetch').mockImplementation(async input => {
    const url = String(input);
    return response('Event User', url.endsWith('/auth/me') ? 'BUYER' : null);
  });

  await render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(screen.getByText('SIGNED_OUT')).toBeTruthy());
  await act(async () => {
    authStateChange?.('SIGNED_IN', { ...session, user: { id: 'event-user' } });
  });

  await waitFor(() => expect(screen.getByText('SIGNED_IN')).toBeTruthy());
  await waitFor(() => expect(screen.getByTestId('account').props.children).toBe('Event User:BUYER'));
});

test('Google callback and its SIGNED_IN event verify the account only once', async () => {
  const callbackSession = {
    access_token: 'callback-token',
    refresh_token: 'callback-refresh',
    user: { id: 'callback-user' },
  };
  mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null } });
  mockSupabase.auth.signInWithOAuth.mockResolvedValue({
    data: { url: 'https://accounts.google.test/authorize' }, error: null,
  });
  mockSupabase.auth.setSession.mockImplementation(async () => {
    authStateChange?.('SIGNED_IN', callbackSession);
    return { data: { session: callbackSession }, error: null };
  });
  jest.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValue({
    type: 'success',
    url: 'secondhandmarketplace://auth/callback#access_token=callback-token&refresh_token=callback-refresh',
  });
  const calls: string[] = [];
  jest.spyOn(global, 'fetch').mockImplementation(async input => {
    const url = String(input);
    calls.push(url);
    return response('Callback User', url.endsWith('/auth/me') ? 'BUYER' : null);
  });

  await render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(screen.getByText('SIGNED_OUT')).toBeTruthy());
  let result: string | undefined;
  await act(async () => {
    result = await currentLoginAdapter?.run({
      signal: new AbortController().signal,
      processing: jest.fn(),
    });
  });

  expect(result).toBe('success');
  await waitFor(() => expect(screen.getByTestId('account').props.children).toBe('Callback User:BUYER'));
  expect(calls.filter(url => url.endsWith('/auth/google'))).toHaveLength(1);
  expect(calls.filter(url => url.endsWith('/auth/me'))).toHaveLength(1);
  await fireEvent.press(screen.getByText('LOGOUT'));
  await waitFor(() => expect(screen.getByText('SIGNED_OUT')).toBeTruthy());
});

test('a rejected callback session does not suppress a later external SIGNED_IN', async () => {
  const callbackSession = {
    access_token: 'failed-callback-token',
    refresh_token: 'failed-callback-refresh',
    user: { id: 'callback-user' },
  };
  mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null } });
  mockSupabase.auth.signInWithOAuth.mockResolvedValue({
    data: { url: 'https://accounts.google.test/authorize' }, error: null,
  });
  mockSupabase.auth.setSession.mockRejectedValueOnce(new Error('transport failed'));
  jest.mocked(WebBrowser.openAuthSessionAsync).mockResolvedValue({
    type: 'success',
    url: 'secondhandmarketplace://auth/callback#access_token=failed-callback-token&refresh_token=failed-callback-refresh',
  });
  const calls: string[] = [];
  jest.spyOn(global, 'fetch').mockImplementation(async input => {
    const url = String(input);
    calls.push(url);
    return response('External User', url.endsWith('/auth/me') ? 'BUYER' : null);
  });

  await render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(screen.getByText('SIGNED_OUT')).toBeTruthy());
  await expect(currentLoginAdapter?.run({
    signal: new AbortController().signal,
    processing: jest.fn(),
  })).rejects.toThrow('transport failed');
  await act(async () => {
    authStateChange?.('SIGNED_IN', callbackSession);
  });

  await waitFor(() => expect(screen.getByTestId('account').props.children).toBe('External User:BUYER'));
  expect(calls.filter(url => url.endsWith('/auth/google'))).toHaveLength(1);
  expect(calls.filter(url => url.endsWith('/auth/me'))).toHaveLength(1);
});

test('a repeated SIGNED_IN for the current user does not reload the account', async () => {
  const calls: string[] = [];
  jest.spyOn(global, 'fetch').mockImplementation(async input => {
    const url = String(input);
    calls.push(url);
    return response('Existing User', url.endsWith('/auth/me') ? 'BUYER' : null);
  });

  await render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(screen.getByTestId('account').props.children).toBe('Existing User:BUYER'));
  const callsBeforeEvent = calls.length;
  await act(async () => {
    authStateChange?.('SIGNED_IN', session);
  });

  expect(calls).toHaveLength(callsBeforeEvent);
});

test('ignores a role response that arrives after logout and prevents duplicate saves', async () => {
  let resolveRole!: (value: Response) => void;
  const pendingRole = new Promise<Response>(resolve => { resolveRole = resolve; });
  let roleRequests = 0;
  jest.spyOn(global, 'fetch').mockImplementation(async input => {
    const url = String(input);
    if (url.endsWith('/auth/google') || url.endsWith('/auth/me')) return response('Old Account', null);
    roleRequests += 1;
    return pendingRole;
  });

  await render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(screen.getByTestId('account').props.children).toBe('Old Account:NONE'));
  await fireEvent.press(screen.getByText('SELECT_BUYER'));
  await fireEvent.press(screen.getByText('SELECT_SELLER'));
  expect(roleRequests).toBe(1);
  await waitFor(() => expect(screen.getByTestId('saving').props.children).toBe('SAVING'));

  await fireEvent.press(screen.getByText('LOGOUT'));
  resolveRole(response('Old Account', 'BUYER'));
  await waitFor(() => expect(screen.getByText('SIGNED_OUT')).toBeTruthy());
  expect(screen.getByTestId('account').props.children).toBe('NO_ACCOUNT');
  expect(screen.getByTestId('saving').props.children).toBe('IDLE');
  expect(screen.getByTestId('role-error').props.children).toBe('NO_ERROR');
});
