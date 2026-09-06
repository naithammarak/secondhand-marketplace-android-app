import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAuthCallback } from '../src/auth/auth-callback.ts';

const NATIVE_REDIRECT_URI = 'secondhandmarketplace://auth/callback';
const WEB_REDIRECT_URI = 'http://localhost:8081/auth/callback';

test('accepts the exact configured callback and extracts a Supabase session', () => {
  assert.deepEqual(
    parseAuthCallback(
      'secondhandmarketplace://auth/callback#access_token=access&refresh_token=refresh',
      NATIVE_REDIRECT_URI,
    ),
    { accessToken: 'access', refreshToken: 'refresh' },
  );
});

test('rejects callback lookalikes before reading credentials', () => {
  for (const url of [
    'secondhandmarketplace://evil/callback#access_token=a&refresh_token=r',
    'secondhandmarketplace://auth/other#access_token=a&refresh_token=r',
    'https://auth/callback#access_token=a&refresh_token=r',
  ]) assert.equal(parseAuthCallback(url, NATIVE_REDIRECT_URI), null);
});

test('accepts a web callback when it matches the current configured origin', () => {
  assert.deepEqual(
    parseAuthCallback(
      'http://localhost:8081/auth/callback#access_token=access&refresh_token=refresh',
      WEB_REDIRECT_URI,
    ),
    { accessToken: 'access', refreshToken: 'refresh' },
  );
});

test('rejects web callbacks with a different origin, port, or path', () => {
  for (const url of [
    'http://127.0.0.1:8081/auth/callback#access_token=a&refresh_token=r',
    'http://localhost:8082/auth/callback#access_token=a&refresh_token=r',
    'http://localhost:8081/other#access_token=a&refresh_token=r',
    'https://localhost:8081/auth/callback#access_token=a&refresh_token=r',
  ]) assert.equal(parseAuthCallback(url, WEB_REDIRECT_URI), null);
});

test('reports provider errors without returning raw callback details', () => {
  assert.deepEqual(
    parseAuthCallback(
      'secondhandmarketplace://auth/callback#error=access_denied&error_description=private',
      NATIVE_REDIRECT_URI,
    ),
    { error: 'oauth-error' },
  );
});

test('provider error in either query or fragment wins over token fields', () => {
  assert.deepEqual(
    parseAuthCallback(
      'secondhandmarketplace://auth/callback?error=access_denied#access_token=a&refresh_token=r',
      NATIVE_REDIRECT_URI,
    ),
    { error: 'oauth-error' },
  );
});

test('requires both tokens for the selected implicit callback flow', () => {
  assert.deepEqual(
    parseAuthCallback(
      'secondhandmarketplace://auth/callback#access_token=access',
      NATIVE_REDIRECT_URI,
    ),
    { error: 'oauth-error' },
  );
});
