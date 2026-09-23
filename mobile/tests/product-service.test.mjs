import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createProductService, ProductServiceError, registerProductImage,
} from '../src/services/product-service.ts';
import { createImageUploadService } from '../src/services/image-upload-service.ts';

test('mock build uploads and creates only in memory even when the EAS environment has an API URL', async () => {
  const eas = JSON.parse(await readFile(new URL('../eas.json', import.meta.url), 'utf8'));
  const profile = eas.build.mock.env;
  assert.equal(profile.EXPO_PUBLIC_PRODUCT_CATALOG_MODE, 'mock');
  assert.equal(profile.EXPO_PUBLIC_PRODUCT_MOCK_MODE, 'true');

  const calls = [];
  const fetcher = async (url) => {
    calls.push(url);
    throw new Error('mock build must not call the backend');
  };
  const mockMode = profile.EXPO_PUBLIC_PRODUCT_MOCK_MODE === 'true';
  const baseUrl = 'https://configured-api.example.test';
  const uploadService = createImageUploadService({ baseUrl, mockMode, fetch: fetcher });
  const productService = createProductService({ baseUrl, mockMode, fetch: fetcher });

  const uploaded = await uploadService.uploadImage({ uri: 'file:///test-image.jpg' }, 'seller-token');
  const created = await productService.createProduct({
    name: 'ทดสอบ mock profile', description: 'ไม่ส่งข้อมูลไป API', size: 'M',
    condition: 'GOOD', price: 250, category: 'เสื้อผ้า', categoryId: 1,
    brand: 'Nike', brandId: 2, images: [uploaded.url],
  }, 'seller-token');
  const owner = await productService.getProductById(created.id, 'seller-token');

  assert.match(uploaded.url, /^mock:\/\/product-images\//);
  assert.match(created.id, /^mock-/);
  assert.equal(owner?.id, created.id);
  assert.deepEqual(calls, []);
});

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
