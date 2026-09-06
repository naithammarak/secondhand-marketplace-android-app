import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyAccountWithRefresh } from '../src/auth/session-account.ts';
import { MeServiceError } from '../src/services/me-service.ts';

test('401 refreshes the Supabase session once before retrying GET /me', async () => {
  const tokens = [];
  const result = await verifyAccountWithRefresh({
    accessToken: 'old',
    getMe: async token => {
      tokens.push(token);
      if (token === 'old') throw new MeServiceError('unauthorized');
      return { role: null, source: 'backend' };
    },
    refresh: async () => ({ accessToken: 'new' }),
  });
  assert.deepEqual(tokens, ['old', 'new']);
  assert.equal(result.source, 'backend');
});

test('403 does not refresh or loop login', async () => {
  let refreshes = 0;
  await assert.rejects(verifyAccountWithRefresh({
    accessToken: 'token',
    getMe: async () => { throw new MeServiceError('forbidden'); },
    refresh: async () => { refreshes++; return { accessToken: 'new' }; },
  }), error => error.kind === 'forbidden');
  assert.equal(refreshes, 0);
});

test('failed refresh ends as unauthorized', async () => {
  await assert.rejects(verifyAccountWithRefresh({
    accessToken: 'old',
    getMe: async () => { throw new MeServiceError('unauthorized'); },
    refresh: async () => null,
  }), error => error.kind === 'unauthorized');
});
