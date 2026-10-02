import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewService } from '../src/services/review-service.ts';

test('review API transmits only seller rating/comment and stable key; public list sends no bearer', async () => {
  const calls=[];const service=createReviewService({baseUrl:'https://api.test/api',fetch:async(url,init)=>{calls.push({url,init});return new Response('{}');}});
  await service.submit('token',42,{rating:5,comment:'ดี',buyer_id:666,productStars:4},'attempt-key-0001');
  await service.get('token',42);await service.publicList(7,20,20);
  assert.deepEqual(JSON.parse(calls[0].init.body),{rating:5,comment:'ดี'});
  assert.equal(calls[0].init.headers['Idempotency-Key'],'attempt-key-0001');
  assert.equal(calls[2].url,'https://api.test/api/sellers/7/reviews?limit=20&offset=20');
  assert.equal(calls[2].init.headers.Authorization,undefined);
});
