import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  conditionLabels,
  createProductCatalogService,
  ProductCatalogError,
} from '../src/services/product-catalog-service.ts';
import { resolveProductCatalogServiceOptions } from '../src/products/product-catalog-config.ts';

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function recorder(respond) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return respond(url, init, calls.length);
  };
  return { calls, fetch };
}

const listItem = (extra = {}) => ({
  id: 101, product_name: 'เสื้อเชิ้ตสีฟ้า', price: '1290.00', condition: 'GOOD', status: 'AVAILABLE',
  main_image: { image_id: 801, image_url: 'https://storage.example.invalid/signed/801', url_expires_at: null },
  ...extra,
});

const detail = (extra = {}) => ({
  id: 101,
  product_name: 'เสื้อเชิ้ตสีฟ้า',
  description: 'เสื้อเชิ้ตมือสองสภาพดี',
  price: '1290.00',
  category_id: 1,
  category: { id: 1, category_name: 'เสื้อผ้า', parent_category_id: null },
  brand_id: 1,
  brand: { id: 1, brand_name: 'ไม่ระบุแบรนด์' },
  size: 'M',
  condition: 'GOOD',
  sale_type: 'FIXED_PRICE',
  status: 'AVAILABLE',
  images: [
    { image_id: 801, image_url: 'https://storage.example.invalid/signed/801', url_expires_at: null,
      file_size: 120000, uploaded_at: '2026-09-18T10:00:00Z', sort_order: 0, photo_type: 'MAIN' },
  ],
  created_at: '2026-09-18T10:00:00Z',
  updated_at: '2026-09-18T10:00:00Z',
  ...extra,
});

// ===== Explicit mock branch =====

test('mock products are available only when mock mode is selected explicitly', async () => {
  const service = createProductCatalogService({ mode: 'mock' });
  const page = await service.listProducts();
  assert.ok(page.items.length > 0);
});

test('the mock seed has 6-8 products', async () => {
  const service = createProductCatalogService({ mode: 'mock' });
  const page = await service.listProducts({ pageSize: 50 });
  // สินค้าที่ไม่ใช่ AVAILABLE ถูกกรองออกจาก public list ตาม contract จึงนับจาก total ของ list ไม่ได้ตรง ๆ
  // ตรวจว่าจำนวนที่แสดงต่อสาธารณะอยู่ในช่วงที่สมเหตุสมผลสำหรับ seed ~6-8 รายการ (1 รายการถูกยกเลิก)
  assert.ok(page.meta.total >= 6 && page.meta.total <= 8, `total=${page.meta.total}`);
});

test('the mock seed includes at least one non-AVAILABLE product excluded from the public list', async () => {
  const service = createProductCatalogService({ mode: 'mock' });
  const page = await service.listProducts({ pageSize: 50 });
  assert.ok(page.items.every(item => item.status === 'AVAILABLE'));
  // id 107 (หมวกแก๊ป) ถูกยกเลิกไว้ในข้อมูลจำลอง ต้องไม่ปรากฏใน public list
  assert.ok(!page.items.some(item => item.id === 107));
});

test('fetching the cancelled mock product by id reports not-found, like a real 404', async () => {
  const service = createProductCatalogService({ mode: 'mock' });
  await assert.rejects(service.getProduct(107), error => error instanceof ProductCatalogError && error.kind === 'not-found');
});

test('the mock seed includes a product whose image url is unreachable, for placeholder testing', async () => {
  const service = createProductCatalogService({ mode: 'mock' });
  const page = await service.listProducts({ pageSize: 50 });
  const broken = page.items.find(item => item.id === 104);
  assert.ok(broken, 'expected mock product 104 in the list');
  assert.ok(broken.mainImage?.imageUrl.includes('broken-host'));
});

test('mock search filters by product name, case-insensitively, among available products only', async () => {
  const service = createProductCatalogService({ mode: 'mock' });
  const page = await service.listProducts({ q: 'เสื้อ' });
  assert.ok(page.items.length >= 2);
  assert.ok(page.items.every(item => item.productName.includes('เสื้อ')));
});

test('mock search with no match returns an empty page, not an error', async () => {
  const service = createProductCatalogService({ mode: 'mock' });
  const page = await service.listProducts({ q: 'ไม่มีสินค้านี้แน่นอน' });
  assert.deepEqual(page.items, []);
  assert.equal(page.meta.total, 0);
  assert.equal(page.meta.totalPages, 0);
  assert.equal(page.meta.hasNext, false);
});

test('mock pagination meta is consistent with page size and has_next', async () => {
  const service = createProductCatalogService({ mode: 'mock' });
  const page1 = await service.listProducts({ page: 1, pageSize: 2 });
  assert.equal(page1.items.length, 2);
  assert.equal(page1.meta.page, 1);
  assert.equal(page1.meta.pageSize, 2);
  assert.equal(page1.meta.hasNext, true);

  const totalPages = page1.meta.totalPages;
  const lastPage = await service.listProducts({ page: totalPages, pageSize: 2 });
  assert.equal(lastPage.meta.hasNext, false);
});

test('mock rejects an out-of-range page or page_size like the real API would', async () => {
  const service = createProductCatalogService({ mode: 'mock' });
  await assert.rejects(service.listProducts({ page: 0 }), error => error.kind === 'validation-error');
  await assert.rejects(service.listProducts({ pageSize: 51 }), error => error.kind === 'validation-error');
});

test('getProduct returns a full detail for a visible mock product', async () => {
  const service = createProductCatalogService({ mode: 'mock' });
  const product = await service.getProduct(101);
  assert.equal(product.productName, 'เสื้อเชิ้ตสีฟ้า');
  assert.equal(product.category.categoryName, 'เสื้อผ้า');
  assert.equal(product.brand.brandName, 'ไม่ระบุแบรนด์');
  assert.equal(typeof product.price, 'string');
  assert.equal(product.images[0].sortOrder, 0);
});

test('an unknown mock id reports not-found', async () => {
  const service = createProductCatalogService({ mode: 'mock' });
  await assert.rejects(service.getProduct(999999), error => error.kind === 'not-found');
});

// ===== Build-time configuration =====

test('the EAS production profile selects the real service when its API URL is configured', async () => {
  const eas = JSON.parse(await readFile(new URL('../eas.json', import.meta.url), 'utf8'));
  assert.equal(eas.build.development.env.EXPO_PUBLIC_PRODUCT_CATALOG_ENV, 'development');
  assert.equal(eas.build.preview.env.EXPO_PUBLIC_PRODUCT_CATALOG_ENV, 'preview');
  assert.equal(eas.build.production.env.EXPO_PUBLIC_PRODUCT_CATALOG_ENV, 'production');
  assert.equal(eas.build.development.env.EXPO_PUBLIC_PRODUCT_CATALOG_MODE, 'api');
  assert.equal(eas.build.development.env.EXPO_PUBLIC_PRODUCT_MOCK_MODE, 'false');
  assert.equal(eas.build.mock.env.EXPO_PUBLIC_PRODUCT_CATALOG_MODE, 'mock');
  assert.equal(eas.build.mock.env.EXPO_PUBLIC_PRODUCT_MOCK_MODE, 'true');
  assert.equal(eas.build.preview.env.EXPO_PUBLIC_PRODUCT_CATALOG_MODE, 'api');
  assert.equal(eas.build.production.env.EXPO_PUBLIC_PRODUCT_CATALOG_MODE, 'api');

  const { calls, fetch } = recorder(() => json(200, {
    data: [], meta: { page: 1, page_size: 20, total: 0, total_pages: 0, has_next: false },
  }));
  const options = resolveProductCatalogServiceOptions({
    ...eas.build.production.env,
    baseUrl: 'https://api.test',
  });
  const service = createProductCatalogService({ ...options, fetch });

  await service.listProducts();
  assert.equal(options.mode, 'api');
  assert.equal(calls[0].url, 'https://api.test/products?page=1&page_size=20');
});

test('an API mode without a URL reports a configuration error instead of using mock data', async () => {
  const options = resolveProductCatalogServiceOptions({ mode: 'api' });
  const service = createProductCatalogService(options);

  await assert.rejects(service.listProducts(), error =>
    error instanceof ProductCatalogError && error.kind === 'unavailable'
      && error.code === 'PRODUCT_CATALOG_API_BASE_URL_MISSING');
});

test('an invalid API URL reports a configuration error instead of using mock data', async () => {
  const options = resolveProductCatalogServiceOptions({ mode: 'api', baseUrl: 'ftp://api.test' });
  const service = createProductCatalogService(options);

  await assert.rejects(service.getProduct(101), error =>
    error instanceof ProductCatalogError && error.kind === 'unavailable'
      && error.code === 'PRODUCT_CATALOG_API_BASE_URL_INVALID');
});

test('mock mode must be selected explicitly and remains mock even when an API URL exists', async () => {
  const options = resolveProductCatalogServiceOptions({
    mode: 'mock', baseUrl: 'https://api.test', buildEnvironment: 'development',
  });
  const service = createProductCatalogService(options);
  const page = await service.listProducts();

  assert.equal(options.mode, 'mock');
  assert.ok(page.items.length > 0);
});

test('production refuses explicitly requested mock mode and reports unavailable', async () => {
  const options = resolveProductCatalogServiceOptions({
    mode: 'mock', buildEnvironment: 'production',
  });
  const service = createProductCatalogService(options);

  await assert.rejects(service.listProducts(), error =>
    error instanceof ProductCatalogError && error.kind === 'unavailable'
      && error.code === 'PRODUCT_CATALOG_MOCK_DISABLED_IN_PRODUCTION');
});

test('the service default fails closed when both mode and API URL are absent', async () => {
  const service = createProductCatalogService();

  await assert.rejects(service.listProducts(), error =>
    error instanceof ProductCatalogError && error.kind === 'unavailable');
});

// ===== Condition label mapping =====

test('condition codes map to the agreed Thai labels', () => {
  assert.deepEqual(conditionLabels, { NEW: 'สภาพใหม่', LIKE_NEW: 'สภาพเหมือนใหม่', GOOD: 'สภาพดี', FAIR: 'สภาพพอใช้', UNKNOWN: 'ข้อมูลสภาพไม่พร้อมใช้งาน' });
});

// ===== Real branch: decode and error envelope (contract v1.0) =====

test('a list response decodes items and meta from the {data, meta} envelope', async () => {
  const { calls, fetch } = recorder(() => json(200, {
    data: [listItem()],
    meta: { page: 1, page_size: 20, total: 1, total_pages: 1, has_next: false },
  }));
  const service = createProductCatalogService({ baseUrl: 'https://api.test', fetch });
  const page = await service.listProducts({ q: 'เสื้อ', page: 1, pageSize: 20 });

  assert.equal(calls[0].url, 'https://api.test/products?q=%E0%B9%80%E0%B8%AA%E0%B8%B7%E0%B9%89%E0%B8%AD&page=1&page_size=20');
  assert.equal(page.items[0].productName, 'เสื้อเชิ้ตสีฟ้า');
  assert.equal(page.items[0].price, '1290.00');
  assert.equal(page.items[0].mainImage.imageId, 801);
  assert.equal(page.meta.hasNext, false);
});

test('an empty query string is not sent as a q parameter', async () => {
  const { calls, fetch } = recorder(() => json(200, {
    data: [], meta: { page: 1, page_size: 20, total: 0, total_pages: 0, has_next: false },
  }));
  const service = createProductCatalogService({ baseUrl: 'https://api.test', fetch });
  await service.listProducts({ q: '   ' });
  assert.equal(calls[0].url, 'https://api.test/products?page=1&page_size=20');
});

test('a detail response decodes the full product from the {data} envelope', async () => {
  const { fetch } = recorder(() => json(200, { data: detail() }));
  const service = createProductCatalogService({ baseUrl: 'https://api.test', fetch });
  const product = await service.getProduct(101);
  assert.equal(product.category.id, 1);
  assert.equal(product.brand.brandName, 'ไม่ระบุแบรนด์');
  assert.equal(product.images[0].photoType, 'MAIN');
  assert.equal(product.saleType, 'FIXED_PRICE');
});

test('a future condition remains readable without inventing a known condition', async () => {
  const { fetch } = recorder(() => json(200, { data: detail({ condition: 'FUTURE_CONDITION' }) }));
  const service = createProductCatalogService({ baseUrl: 'https://api.test', fetch });
  const product = await service.getProduct(101);
  assert.equal(product.condition, 'UNKNOWN');
  assert.equal(conditionLabels[product.condition], 'ข้อมูลสภาพไม่พร้อมใช้งาน');
});

test('price that is not a decimal string is treated as a malformed backend response', async () => {
  const { fetch } = recorder(() => json(200, { data: detail({ price: 1290 }) }));
  const service = createProductCatalogService({ baseUrl: 'https://api.test', fetch });
  await assert.rejects(service.getProduct(101), error => error.kind === 'server-error');
});

test('a 404 maps to not-found and carries the backend code and request id', async () => {
  const { fetch } = recorder(() => json(404, {
    error: { code: 'PRODUCT_NOT_FOUND', message: 'ไม่พบสินค้าที่สามารถแสดงได้', fields: {}, request_id: 'req-demo-003' },
  }));
  const service = createProductCatalogService({ baseUrl: 'https://api.test', fetch });
  await assert.rejects(
    service.getProduct(999),
    error => error instanceof ProductCatalogError && error.kind === 'not-found'
      && error.code === 'PRODUCT_NOT_FOUND' && error.requestId === 'req-demo-003',
  );
});

test('a 422 maps field errors from the error envelope', async () => {
  const { fetch } = recorder(() => json(422, {
    error: { code: 'VALIDATION_ERROR', message: 'x', fields: { page_size: ['page_size ต้องอยู่ระหว่าง 1-50'] }, request_id: 'r1' },
  }));
  const service = createProductCatalogService({ baseUrl: 'https://api.test', fetch });
  await assert.rejects(
    service.listProducts({ pageSize: 999 }),
    error => error.kind === 'validation-error' && Array.isArray(error.fields.page_size),
  );
});

test('status codes map to the expected error kinds', async () => {
  const cases = [[503, 'unavailable'], [500, 'server-error']];
  for (const [status, kind] of cases) {
    const service = createProductCatalogService({
      baseUrl: 'https://api.test',
      fetch: async () => json(status, { error: { code: null, message: 'x', fields: {}, request_id: null } }),
    });
    await assert.rejects(service.getProduct(1), error => error.kind === kind, `status ${status}`);
  }
});

test('a slow server is reported as timeout, not as failure or success', async () => {
  const fetch = (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('aborted')));
  });
  const service = createProductCatalogService({ baseUrl: 'https://api.test', fetch, timeoutMs: 20 });
  await assert.rejects(service.getProduct(1), error => error.kind === 'timeout');
});

test('network failure is reported distinctly from a missing API configuration', async () => {
  const offline = createProductCatalogService({ baseUrl: 'https://api.test', fetch: async () => { throw new Error('x'); } });
  await assert.rejects(offline.getProduct(1), error => error.kind === 'network-error');
  assert.throws(() => createProductCatalogService({ baseUrl: 'ftp://api.test' }));
});

test('caller abort rejects without waiting for the timeout', async () => {
  const stalledBody = { ok: true, status: 200, json: () => new Promise(() => {}) };
  const service = createProductCatalogService({
    baseUrl: 'https://api.test', fetch: async () => stalledBody, timeoutMs: 60000,
  });
  const controller = new AbortController();
  const pending = service.getProduct(1, controller.signal);
  setTimeout(() => controller.abort(), 10);
  const outcome = await Promise.race([
    pending.then(() => 'resolved', error => (error instanceof ProductCatalogError ? error.kind : 'aborted')),
    new Promise(resolve => setTimeout(() => resolve('hung'), 1000)),
  ]);
  assert.equal(outcome, 'aborted');
});
