import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleLoginAdapter } from '../src/auth/google-login-adapter.ts';

test('starts Google OAuth once with the approved redirect and processes success', async () => {
  let options;
  let callback;
  const adapter = createGoogleLoginAdapter({
    redirectTo: 'secondhandmarketplace://auth/callback',
    signIn: async value => { options = value; return { url: 'https://supabase.test/oauth' }; },
    openBrowser: async () => ({ type: 'success', url: 'secondhandmarketplace://auth/callback#access_token=a&refresh_token=r' }),
    processCallback: async value => { callback = value; return 'success'; },
    dismissBrowser: () => {},
  });
  let processing = 0;
  assert.equal(await adapter.run({ signal: new AbortController().signal, processing: () => processing++ }), 'success');
  assert.deepEqual(options, { provider: 'google', redirectTo: 'secondhandmarketplace://auth/callback', skipBrowserRedirect: true });
  assert.equal(callback.startsWith('secondhandmarketplace://auth/callback'), true);
  assert.equal(processing, 1);
});

test('browser cancel is retryable and does not process a callback', async () => {
  let processed = false;
  const adapter = createGoogleLoginAdapter({
    redirectTo: 'secondhandmarketplace://auth/callback',
    signIn: async () => ({ url: 'https://supabase.test/oauth' }),
    openBrowser: async () => ({ type: 'cancel' }),
    processCallback: async () => { processed = true; return 'success'; },
    dismissBrowser: () => {},
  });
  assert.equal(await adapter.run({ signal: new AbortController().signal, processing: () => {} }), 'cancelled');
  assert.equal(processed, false);
});

test('unexpected browser failure is distinct from user cancellation', async () => {
  const adapter = createGoogleLoginAdapter({
    redirectTo: 'secondhandmarketplace://auth/callback',
    signIn: async () => ({ url: 'https://supabase.test/oauth' }),
    openBrowser: async () => ({ type: 'locked' }),
    processCallback: async () => 'success',
    dismissBrowser: () => {},
  });
  assert.equal(await adapter.run({ signal: new AbortController().signal, processing: () => {} }), 'oauth-error');
});

test('aborting dismisses the browser and ignores its later success', async () => {
  let resolveBrowser;
  const browser = new Promise(resolve => { resolveBrowser = resolve; });
  let dismissed = 0;
  let processed = false;
  const adapter = createGoogleLoginAdapter({
    redirectTo: 'secondhandmarketplace://auth/callback',
    signIn: async () => ({ url: 'https://supabase.test/oauth' }),
    openBrowser: async () => browser,
    processCallback: async () => { processed = true; return 'success'; },
    dismissBrowser: () => { dismissed++; },
  });
  const abort = new AbortController();
  const result = adapter.run({ signal: abort.signal, processing: () => {} });
  await Promise.resolve();
  abort.abort();
  resolveBrowser({ type: 'success', url: 'secondhandmarketplace://auth/callback#access_token=a&refresh_token=r' });
  assert.equal(await result, 'cancelled');
  assert.equal(dismissed, 1);
  assert.equal(processed, false);
});
