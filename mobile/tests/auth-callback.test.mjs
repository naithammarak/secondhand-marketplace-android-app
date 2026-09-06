import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAuthCallback } from '../src/auth/auth-callback.ts';

test('accepts the exact configured callback and extracts a Supabase session', () => {
  assert.deepEqual(
    parseAuthCallback('secondhandmarketplace://auth/callback#access_token=access&refresh_token=refresh'),
    { accessToken: 'access', refreshToken: 'refresh' },
  );
});

test('rejects callback lookalikes before reading credentials', () => {
  for (const url of [
    'secondhandmarketplace://evil/callback#access_token=a&refresh_token=r',
    'secondhandmarketplace://auth/other#access_token=a&refresh_token=r',
    'https://auth/callback#access_token=a&refresh_token=r',
  ]) assert.equal(parseAuthCallback(url), null);
});

test('reports provider errors without returning raw callback details', () => {
  assert.deepEqual(
    parseAuthCallback('secondhandmarketplace://auth/callback#error=access_denied&error_description=private'),
    { error: 'oauth-error' },
  );
});

test('provider error in either query or fragment wins over token fields', () => {
  assert.deepEqual(
    parseAuthCallback('secondhandmarketplace://auth/callback?error=access_denied#access_token=a&refresh_token=r'),
    { error: 'oauth-error' },
  );
});

test('requires both tokens for the selected implicit callback flow', () => {
  assert.deepEqual(
    parseAuthCallback('secondhandmarketplace://auth/callback#access_token=access'),
    { error: 'oauth-error' },
  );
});
