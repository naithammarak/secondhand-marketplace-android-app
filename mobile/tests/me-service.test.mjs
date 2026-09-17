import test from 'node:test';
import assert from 'node:assert/strict';
import { createMeService } from '../src/services/me-service.ts';

test('registers the Google account before reading /auth/me with the Supabase token', async () => {
  const received = [];
  const service = createMeService({ baseUrl: 'https://api.example.test/', fetch: async (url, init) => {
    received.push({ url, init });
    return new Response(JSON.stringify({ role: null }), { status: 200 });
  }});
  assert.deepEqual(await service.getMe('supabase-token'), { role: null, source: 'backend' });
  assert.deepEqual(received.map(call => [call.url, call.init.method]), [
    ['https://api.example.test/auth/google', 'POST'],
    ['https://api.example.test/auth/me', 'GET'],
  ]);
  assert.equal(received[0].init.body, '{}');
  assert.equal(received[0].init.headers.Authorization, 'Bearer supabase-token');
  assert.equal(received[1].init.headers.Authorization, 'Bearer supabase-token');
  assert.equal(received.every(call => !call.url.includes('supabase-token')), true);
});

for (const [status, expected] of [[401, 'unauthorized'], [403, 'forbidden'], [500, 'server-error']]) {
  test(`maps backend ${status} without exposing its response body`, async () => {
    const service = createMeService({ baseUrl: 'https://api.example.test',
      fetch: async () => new Response('sensitive backend message', { status }) });
    await assert.rejects(service.getMe('token'), error => error.kind === expected);
  });
}

test('maps transport failures and supports cancellation', async () => {
  const service = createMeService({ baseUrl: 'https://api.example.test', fetch: async () => { throw new Error('offline'); } });
  await assert.rejects(service.getMe('token'), error => error.kind === 'network-error');
});

test('mock service returns a new user without assigning privileged roles', async () => {
  const service = createMeService({});
  assert.deepEqual(await service.getMe('ignored'), { role: null, source: 'mock' });
});

test('backend base URL is reduced to its http origin', async () => {
  const receivedUrls = [];
  const service = createMeService({ baseUrl: 'https://api.example.test/untrusted/path?token=no', fetch: async url => {
    receivedUrls.push(url);
    return new Response(JSON.stringify({ role: 'BUYER' }));
  }});
  await service.getMe('token');
  assert.deepEqual(receivedUrls, [
    'https://api.example.test/auth/google',
    'https://api.example.test/auth/me',
  ]);
});

test('does not read /auth/me when account registration fails', async () => {
  let requests = 0;
  const service = createMeService({ baseUrl: 'https://api.example.test', fetch: async () => {
    requests += 1;
    return new Response('unavailable', { status: 500 });
  }});
  await assert.rejects(service.getMe('token'), error => error.kind === 'server-error');
  assert.equal(requests, 1);
});

test('rejects a non-http backend origin', () => {
  assert.throws(() => createMeService({ baseUrl: 'file:///private' }));
});
