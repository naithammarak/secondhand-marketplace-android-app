import test from 'node:test';
import assert from 'node:assert/strict';
import { createMeService } from '../src/services/me-service.ts';

test('GET /me sends the Supabase access token in Authorization only', async () => {
  let received;
  const service = createMeService({ baseUrl: 'https://api.example.test/', fetch: async (url, init) => {
    received = { url, init };
    return new Response(JSON.stringify({ role: null }), { status: 200 });
  }});
  assert.deepEqual(await service.getMe('supabase-token'), { role: null, source: 'backend' });
  assert.equal(received.url, 'https://api.example.test/me');
  assert.equal(received.init.method, 'GET');
  assert.equal(received.init.headers.Authorization, 'Bearer supabase-token');
  assert.equal(received.url.includes('supabase-token'), false);
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
  let receivedUrl;
  const service = createMeService({ baseUrl: 'https://api.example.test/untrusted/path?token=no', fetch: async url => {
    receivedUrl = url;
    return new Response(JSON.stringify({ role: 'BUYER' }));
  }});
  await service.getMe('token');
  assert.equal(receivedUrl, 'https://api.example.test/me');
});

test('rejects a non-http backend origin', () => {
  assert.throws(() => createMeService({ baseUrl: 'file:///private' }));
});
