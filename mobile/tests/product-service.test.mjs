import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createProductService, ProductServiceError, registerProductImage,
} from '../src/services/product-service.ts';

test('loads seller products with bearer token and keeps pagination and statuses', async () => {
  const calls = [];
  const service = createProductService({
    baseUrl: 'https://example.test',
    fetch: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({
        data: [{ id: 42, product_name: 'เสื้อ', price: '250.00', status: 'CANCELLED', main_image: null }],
        meta: { has_next: true },
      }), { status: 200 });
    },
  });
  const page = await service.getMyProducts(2, 'seller-token');
  assert.deepEqual(page, { items: [{ id: '42', name: 'เสื้อ', price: 250, status: 'CANCELLED', mainImageUrl: null }], hasNext: true });
  assert.equal(calls[0].url, 'https://example.test/products/me?page=2&page_size=20');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer seller-token');
});

test('owner edit read does not fall back to public product after an expired session', async () => {
  const paths = [];
  const service = createProductService({
    baseUrl: 'https://example.test',
    fetch: async url => { paths.push(url); return new Response('{}', { status: 401 }); },
  });
  await assert.rejects(service.getProductById('42', 'expired'), error => error instanceof ProductServiceError && error.kind === 'unauthorized');
  assert.deepEqual(paths, ['https://example.test/products/me/42']);
});

test('real create refuses missing image upload metadata before sending', async () => {
  let sent = 0;
  const service = createProductService({ baseUrl: 'https://example.test', fetch: async () => { sent += 1; return new Response('{}'); } });
  const input = {
    name: 'เสื้อ', description: 'สภาพดี', size: 'M', condition: 'GOOD', price: 250,
    category: 'เสื้อผ้า', categoryId: 42, brand: 'Nike', brandId: 101, images: ['https://example.test/unknown.jpg'],
  };
  await assert.rejects(service.createProduct(input, 'seller-token'), error => error instanceof ProductServiceError && error.kind === 'validation-error');
  assert.equal(sent, 0);

  registerProductImage(input.images[0], { uploadId: 77 });
  await service.createProduct(input, 'seller-token');
  assert.equal(sent, 1);
});
