import test from 'node:test';
import assert from 'node:assert/strict';
import { createProfileService, POLICY_VERSION } from '../src/services/profile-service.ts';
const json = (status, body) => new Response(JSON.stringify(body), {status});

test('private profile requests preserve prefix, auth and exact editable fields', async () => {
  const calls = [];
  const service = createProfileService({baseUrl:'https://api.test/api/', fetch:async (url, init) => { calls.push({url,init}); return json(200, {full_name:'ใหม่'}); }});
  await service.get('token'); await service.save('token','ใหม่'); await service.acknowledge('token');
  assert.deepEqual(calls.map(c => c.url), ['https://api.test/api/profile','https://api.test/api/profile','https://api.test/api/profile/policy-acknowledgement']);
  assert(calls.every(c => c.init.headers.Authorization === 'Bearer token'));
  assert.deepEqual(JSON.parse(calls[1].init.body), {full_name:'ใหม่'});
  assert.deepEqual(JSON.parse(calls[2].init.body), {policy_version:POLICY_VERSION});
});
test('offline mode and failed writes never return mock profile success', async () => {
  await assert.rejects(createProfileService({}).get('t'), e => e.code === 'api_unavailable');
  const service = createProfileService({baseUrl:'https://api.test',fetch: async () => json(403,{detail:{code:'account_inactive'}})});
  await assert.rejects(service.save('t','Name'), e => e.code === 'account_inactive');
});
test('body read timeout and pre-aborted call are bounded', async () => {
  let calls = 0;
  const service = createProfileService({baseUrl:'https://api.test',timeoutMs:15,fetch:async () => { calls++; return {ok:true,json:() => new Promise(() => {})}; }});
  await assert.rejects(service.get('t'),e => e.code === 'request_cancelled');
  const controller = new AbortController(); controller.abort();
  await assert.rejects(service.get('t',controller.signal));
  assert.equal(calls,1);
});
