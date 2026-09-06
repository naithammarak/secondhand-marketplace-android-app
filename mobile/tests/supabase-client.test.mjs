import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('does not create or cache a static web client and uses browser storage at runtime', async () => {
  const childScript = String.raw`
    import { mock } from 'node:test';
    let nativeReads = 0;
    let browserReads = 0;
    const nativeStorage = {
      getItem: async () => { nativeReads++; return null; },
      setItem: async () => {},
      removeItem: async () => {},
    };
    mock.module('react-native-url-polyfill/auto.js', { exports: { default: {} } });
    mock.module('@react-native-async-storage/async-storage', { exports: { default: nativeStorage } });
    process.env.EXPO_OS = 'web';
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
    const { getSupabaseClient } = await import('./src/auth/supabase-client.ts');
    if (getSupabaseClient() !== null) throw new Error('static rendering created a Supabase client');
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: {
          getItem: async () => { browserReads++; return null; },
          setItem: () => {},
          removeItem: () => {},
        },
      },
    });
    const client = getSupabaseClient();
    if (!client) throw new Error('browser runtime reused the static null result');
    await client.auth.getSession();
    if (browserReads === 0 || nativeReads !== 0) {
      throw new Error('wrong storage selected');
    }
  `;
  const result = spawnSync(process.execPath, [
    '--experimental-test-module-mocks',
    '--input-type=module',
    '--eval',
    childScript,
  ], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    encoding: 'utf8',
    env: process.env,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
