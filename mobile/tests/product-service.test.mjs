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
    condition: 'GOOD', price: '250', category: 'เสื้อผ้า', categoryId: 1,
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
  assert.deepEqual(page, { items: [{ id: '42', name: 'เสื้อ', price: '250.00', status: 'CANCELLED', mainImageUrl: null }], hasNext: true });
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
    name: 'เสื้อ', description: 'สภาพดี', size: 'M', condition: 'GOOD', price: '250',
    category: 'เสื้อผ้า', categoryId: 42, brand: 'Nike', brandId: 101, images: ['https://example.test/unknown.jpg'],
  };
  await assert.rejects(service.createProduct(input, 'seller-token'), error => error instanceof ProductServiceError && error.kind === 'validation-error');
  assert.equal(sent, 0);

  registerProductImage(input.images[0], { uploadId: 77 });
  await service.createProduct(input, 'seller-token');
  assert.equal(sent, 1);
});

test('create and edit send exact decimal text and required seller fields', async () => {
  const calls = [];
  const service = createProductService({ baseUrl: 'https://example.test', fetch: async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ data: { id: 1, product_name: 'เสื้อ', description: 'สภาพดี', size: 'M', price: '0.01', images: [] } }));
  } });
  const input = { name: ' เสื้อ ', description: ' สภาพดี ', size: ' M ', condition: 'GOOD', price: '0.01', category: 'เสื้อผ้า', categoryId: 1, brand: 'Nike', brandId: 2, images: ['https://example.test/image'] };
  registerProductImage(input.images[0], { uploadId: 11, imageId: 12 });
  await service.createProduct(input, 'token');
  await service.updateProduct('1', { ...input, price: '9999999999.99' }, 'token');
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(call => JSON.parse(call.init.body).price), ['0.01', '9999999999.99']);
  assert.deepEqual(JSON.parse(calls[0].init.body).description, 'สภาพดี');
  assert.deepEqual(JSON.parse(calls[1].init.body).size, 'M');
  assert.deepEqual(calls.map(call => call.init.method), ['POST', 'PATCH']);
});

test('create and edit reject missing description or size before sending', async () => {
  let sent = 0;
  const service = createProductService({ baseUrl: 'https://example.test', fetch: async () => { sent++; return new Response('{}'); } });
  const input = { name: 'เสื้อ', description: '', size: 'M', condition: 'GOOD', price: '1.2', category: 'เสื้อผ้า', categoryId: 1, brand: 'Nike', brandId: 2, images: ['image'] };
  await assert.rejects(service.createProduct(input, 'token'), error => error.kind === 'validation-error' && !!error.fields.description);
  await assert.rejects(service.updateProduct('1', { ...input, description: 'สภาพดี', size: '' }, 'token'), error => error.kind === 'validation-error' && !!error.fields.size);
  assert.equal(sent, 0);
});

test('create timeout covers response headers and body', async () => {
  const input = { name: 'เสื้อ', description: 'สภาพดี', size: 'M', condition: 'GOOD', price: '1', category: 'เสื้อผ้า', categoryId: 1, brand: 'Nike', brandId: 2, images: ['image-timeout'] };
  registerProductImage(input.images[0], { uploadId: 21 });
  for (const fetcher of [
    async () => new Promise(() => {}),
    async () => ({ ok: true, json: () => new Promise(() => {}) }),
  ]) {
    const service = createProductService({ baseUrl: 'https://example.test', timeoutMs: 10, fetch: fetcher });
    await assert.rejects(service.createProduct(input, 'token'), error => error.kind === 'timeout');
  }
});

test('image upload timeout covers response body', async () => {
  const service = createImageUploadService({ baseUrl: 'https://example.test', timeoutMs: 10, fetch: async () => ({ ok: true, json: () => new Promise(() => {}) }) });
  await assert.rejects(service.uploadImage({ uri: 'file:///image.jpg' }, 'token'), error => error.kind === 'timeout');
});

test('missing API configuration fails closed for product and image writes', async () => {
  const input = { name: 'เสื้อ', description: 'สภาพดี', size: 'M', condition: 'GOOD', price: '1', category: 'เสื้อผ้า', categoryId: 1, brand: 'Nike', brandId: 2, images: ['image'] };
  const service = createProductService();
  await assert.rejects(service.createProduct(input, 'token'), error => error.kind === 'unavailable');
  await assert.rejects(service.updateProduct('1', input, 'token'), error => error.kind === 'unavailable');
  await assert.rejects(service.cancelProduct('1', 'token'), error => error.kind === 'unavailable');
  await assert.rejects(createImageUploadService().uploadImage({ uri: 'file:///image.jpg' }, 'token'), error => error.kind === 'unavailable');
});
