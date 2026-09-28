/**
 * API สาธารณะสำหรับรายการ/ค้นหา/รายละเอียดสินค้า (PRODUCT-07) ตาม Product Contract v1.0
 * (Issue #42 comment "PRODUCT-00 — Contract v1.0 สำหรับลงมือ") — GET /products และ GET /products/{id}
 * ไม่ต้อง login; error envelope เป็น {"error":{"code","message","fields","request_id"}} ซึ่งต่างจาก
 * order/verification service เดิมที่ใช้ {"detail":...} เพราะ Product API ใช้ envelope ใหม่นี้โดยเฉพาะ
 */

export type ProductCondition = 'NEW' | 'LIKE_NEW' | 'GOOD' | 'FAIR' | 'UNKNOWN';
export type ProductStatus = 'AVAILABLE' | 'RESERVED' | 'SOLD' | 'CANCELLED';

/** ข้อความภาษาไทยของ condition จาก backend หน้าจอแสดงตามนี้เท่านั้น ไม่คำนวณเอง */
export const conditionLabels: Record<ProductCondition, string> = {
  NEW: 'สภาพใหม่',
  LIKE_NEW: 'สภาพเหมือนใหม่',
  GOOD: 'สภาพดี',
  FAIR: 'สภาพพอใช้',
  UNKNOWN: 'ข้อมูลสภาพไม่พร้อมใช้งาน',
};

export type ProductMainImage = {
  imageId: number;
  imageUrl: string;
  urlExpiresAt: string | null;
};

export type ProductImage = ProductMainImage & {
  fileSize: number | null;
  uploadedAt: string | null;
  sortOrder: number;
  photoType: 'MAIN' | 'GALLERY';
};

export type PublicSeller = { displayName: string; verified: boolean };

export type ProductListItem = {
  seller?: PublicSeller | null;
  id: number;
  productName: string;
  /** ราคาเป็น string ทศนิยม 2 ตำแหน่งเสมอตาม contract ห้ามแปลงเป็น number เพื่อคำนวณในแอป */
  price: string;
  condition: ProductCondition;
  status: ProductStatus;
  mainImage: ProductMainImage | null;
  brand?: ProductBrand | null;
  brandName?: string | null;
};

export type ProductCategory = { id: number; categoryName: string; parentCategoryId: number | null };
export type ProductBrand = { id: number; brandName: string };

export type ProductDetail = {
  seller?: PublicSeller | null;
  id: number;
  productName: string;
  description: string;
  price: string;
  categoryId: number;
  category: ProductCategory;
  brandId: number;
  brand: ProductBrand;
  size: string;
  condition: ProductCondition;
  saleType: 'FIXED_PRICE';
  status: ProductStatus;
  images: ProductImage[];
  createdAt: string | null;
  updatedAt: string | null;
};

export type ProductPageMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
};

export type ProductPage = { items: ProductListItem[]; meta: ProductPageMeta };

export type ProductCatalogErrorKind =
  | 'not-found' | 'validation-error' | 'network-error' | 'timeout' | 'server-error' | 'unavailable';

export class ProductCatalogError extends Error {
  readonly kind: ProductCatalogErrorKind;
  /** code จาก backend เช่น PRODUCT_NOT_FOUND, VALIDATION_ERROR */
  readonly code: string | null;
  /** map field path -> ข้อความ ตาม error envelope ของ contract */
  readonly fields: Record<string, string[]>;
  readonly requestId: string | null;

  constructor(kind: ProductCatalogErrorKind, options: {
    code?: string | null; fields?: Record<string, string[]>; requestId?: string | null;
  } = {}) {
    super(kind);
    this.name = 'ProductCatalogError';
    this.kind = kind;
    this.code = options.code ?? null;
    this.fields = options.fields ?? {};
    this.requestId = options.requestId ?? null;
  }
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

const DEFAULT_TIMEOUT_MS = 15000;
const MONEY = /^-?\d+\.\d{2}$/;
const CONDITIONS: ProductCondition[] = ['NEW', 'LIKE_NEW', 'GOOD', 'FAIR'];
const STATUSES: ProductStatus[] = ['AVAILABLE', 'RESERVED', 'SOLD', 'CANCELLED'];
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

function bad(): never {
  throw new ProductCatalogError('server-error');
}

function obj(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) bad();
  return value as Record<string, unknown>;
}

function str(value: unknown): string {
  if (typeof value !== 'string') bad();
  return value;
}

function optStr(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function int(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) bad();
  return value;
}

/** เงินต้องเป็น string ทศนิยม 2 ตำแหน่งเสมอ ถ้าไม่ใช่ถือว่า backend ตอบผิดรูปแบบ */
function money(value: unknown): string {
  const text = str(value);
  if (!MONEY.test(text)) bad();
  return text;
}

function toCondition(value: unknown): ProductCondition {
  return CONDITIONS.find(condition => condition === value) ?? (typeof value === 'string' && value.length > 0 ? 'UNKNOWN' : bad());
}

function toStatus(value: unknown): ProductStatus {
  return STATUSES.find(status => status === value) ?? bad();
}

function toMainImage(value: unknown): ProductMainImage | null {
  if (value === null || value === undefined) return null;
  const data = obj(value);
  return { imageId: int(data.image_id), imageUrl: str(data.image_url), urlExpiresAt: optStr(data.url_expires_at) };
}

function toImage(value: unknown): ProductImage {
  const data = obj(value);
  const photoType = data.photo_type === 'MAIN' ? 'MAIN' : data.photo_type === 'GALLERY' ? 'GALLERY' : bad();
  return {
    imageId: int(data.image_id),
    imageUrl: str(data.image_url),
    urlExpiresAt: optStr(data.url_expires_at),
    fileSize: typeof data.file_size === 'number' ? data.file_size : null,
    uploadedAt: optStr(data.uploaded_at),
    sortOrder: int(data.sort_order),
    photoType,
  };
}

function toCategory(value: unknown): ProductCategory {
  const data = obj(value);
  return {
    id: int(data.id),
    categoryName: str(data.category_name),
    parentCategoryId: typeof data.parent_category_id === 'number' ? data.parent_category_id : null,
  };
}

function toBrand(value: unknown): ProductBrand {
  const data = obj(value);
  return { id: int(data.id), brandName: str(data.brand_name) };
}

function toSeller(value: unknown): PublicSeller | null {
  if (value === null || value === undefined) return null;
  const data = obj(value);
  if (typeof data.display_name !== 'string' || !data.display_name.trim() || typeof data.verified !== 'boolean') return null;
  return { displayName: data.display_name, verified: data.verified };
}

function toListItem(value: unknown): ProductListItem {
  const data = obj(value);
  return {
    id: int(data.id),
    productName: str(data.product_name),
    seller: toSeller(data.seller),
    price: money(data.price),
    condition: toCondition(data.condition),
    status: toStatus(data.status),
    mainImage: toMainImage(data.main_image),
    brand: data.brand && typeof data.brand === 'object' ? toBrand(data.brand) : null,
    brandName: typeof data.brand_name === 'string' ? data.brand_name : null,
  };
}

function toDetail(value: unknown): ProductDetail {
  const data = obj(value);
  if (!Array.isArray(data.images)) bad();
  return {
    id: int(data.id),
    productName: str(data.product_name),
    seller: toSeller(data.seller),
    description: str(data.description),
    price: money(data.price),
    categoryId: int(data.category_id),
    category: toCategory(data.category),
    brandId: int(data.brand_id),
    brand: toBrand(data.brand),
    size: str(data.size),
    condition: toCondition(data.condition),
    saleType: data.sale_type === 'FIXED_PRICE' ? 'FIXED_PRICE' : bad(),
    status: toStatus(data.status),
    images: data.images.map(toImage),
    createdAt: optStr(data.created_at),
    updatedAt: optStr(data.updated_at),
  };
}

function toMeta(value: unknown): ProductPageMeta {
  const data = obj(value);
  return {
    page: int(data.page),
    pageSize: int(data.page_size),
    total: int(data.total),
    totalPages: int(data.total_pages),
    hasNext: data.has_next === true,
  };
}

function toPage(value: unknown): ProductPage {
  const data = obj(value);
  if (!Array.isArray(data.data)) bad();
  return { items: data.data.map(toListItem), meta: toMeta(data.meta) };
}

/** แปลง fields ของ error envelope (map -> array ของข้อความ) เป็นรูปที่ใช้ในแอป */
function toFieldErrors(fields: unknown): Record<string, string[]> {
  if (typeof fields !== 'object' || fields === null) return {};
  const result: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(fields as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue;
    const messages = value.filter((item): item is string => typeof item === 'string');
    if (messages.length > 0) result[key] = messages;
  }
  return result;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export type ListProductsParams = { q?: string; page?: number; pageSize?: number; categoryId?: number | null };

// MOCK: explicit development/test fixture for GET /products and GET /products/{id}.
// สินค้า id 107 มี status CANCELLED เพื่อทดสอบว่าไม่โผล่ใน public list และ detail ตอบ 404
// สินค้า id 104 มีรูปที่ url ใช้งานไม่ได้จริงเพื่อทดสอบ placeholder ตอนโหลดรูปไม่สำเร็จ
type MockSeedProduct = ProductDetail & { publicListMainImage: ProductMainImage | null };

const MOCK_SEED: MockSeedProduct[] = [
  {
    id: 101,
    productName: 'เสื้อเชิ้ตสีฟ้า',
    description: 'เสื้อเชิ้ตมือสองสภาพดี ใส่ไม่กี่ครั้ง',
    price: '1290.00',
    categoryId: 1,
    category: { id: 1, categoryName: 'เสื้อผ้า', parentCategoryId: null },
    brandId: 1,
    brand: { id: 1, brandName: 'ไม่ระบุแบรนด์' },
    size: 'M',
    condition: 'GOOD',
    saleType: 'FIXED_PRICE',
    status: 'AVAILABLE',
    images: [
      { imageId: 801, imageUrl: 'https://storage.example.invalid/signed/801', urlExpiresAt: null,
        fileSize: 120000, uploadedAt: '2026-09-18T10:00:00Z', sortOrder: 0, photoType: 'MAIN' },
    ],
    createdAt: '2026-09-18T10:00:00Z',
    updatedAt: '2026-09-18T10:00:00Z',
    publicListMainImage: { imageId: 801, imageUrl: 'https://storage.example.invalid/signed/801', urlExpiresAt: null },
  },
  {
    id: 102,
    productName: 'กระเป๋าสะพายหนัง',
    description: 'กระเป๋าสะพายหนังแท้ สภาพเหมือนใหม่',
    price: '1990.00',
    categoryId: 3,
    category: { id: 3, categoryName: 'กระเป๋า', parentCategoryId: null },
    brandId: 5,
    brand: { id: 5, brandName: 'Zara' },
    size: 'ไม่ระบุขนาด',
    condition: 'LIKE_NEW',
    saleType: 'FIXED_PRICE',
    status: 'AVAILABLE',
    images: [
      { imageId: 802, imageUrl: 'https://storage.example.invalid/signed/802', urlExpiresAt: null,
        fileSize: 98000, uploadedAt: '2026-09-18T09:50:00Z', sortOrder: 0, photoType: 'MAIN' },
    ],
    createdAt: '2026-09-18T09:50:00Z',
    updatedAt: '2026-09-18T09:50:00Z',
    publicListMainImage: { imageId: 802, imageUrl: 'https://storage.example.invalid/signed/802', urlExpiresAt: null },
  },
  {
    id: 103,
    productName: 'รองเท้าผ้าใบ',
    description: 'รองเท้าผ้าใบมือหนึ่ง ยังไม่แกะกล่อง',
    price: '2490.00',
    categoryId: 2,
    category: { id: 2, categoryName: 'รองเท้า', parentCategoryId: null },
    brandId: 2,
    brand: { id: 2, brandName: 'Nike' },
    size: '42',
    condition: 'NEW',
    saleType: 'FIXED_PRICE',
    status: 'AVAILABLE',
    images: [
      { imageId: 803, imageUrl: 'https://storage.example.invalid/signed/803', urlExpiresAt: null,
        fileSize: 150000, uploadedAt: '2026-09-18T09:40:00Z', sortOrder: 0, photoType: 'MAIN' },
    ],
    createdAt: '2026-09-18T09:40:00Z',
    updatedAt: '2026-09-18T09:40:00Z',
    publicListMainImage: { imageId: 803, imageUrl: 'https://storage.example.invalid/signed/803', urlExpiresAt: null },
  },
  {
    // MOCK: รูปนี้จงใจให้ url ใช้งานไม่ได้จริง เพื่อให้ทดสอบ placeholder ตอนรูปโหลดไม่สำเร็จ (Phase 4)
    id: 104,
    productName: 'นาฬิกาข้อมือ',
    description: 'นาฬิกาข้อมือมือสอง สภาพพอใช้ มีรอยขีดข่วนเล็กน้อย',
    price: '590.00',
    categoryId: 4,
    category: { id: 4, categoryName: 'เครื่องประดับ', parentCategoryId: null },
    brandId: 1,
    brand: { id: 1, brandName: 'ไม่ระบุแบรนด์' },
    size: 'ไม่ระบุขนาด',
    condition: 'FAIR',
    saleType: 'FIXED_PRICE',
    status: 'AVAILABLE',
    images: [
      { imageId: 804, imageUrl: 'https://storage.invalid.broken-host.test/does-not-exist/804.jpg', urlExpiresAt: null,
        fileSize: 80000, uploadedAt: '2026-09-18T09:30:00Z', sortOrder: 0, photoType: 'MAIN' },
    ],
    createdAt: '2026-09-18T09:30:00Z',
    updatedAt: '2026-09-18T09:30:00Z',
    publicListMainImage: {
      imageId: 804, imageUrl: 'https://storage.invalid.broken-host.test/does-not-exist/804.jpg', urlExpiresAt: null,
    },
  },
  {
    id: 105,
    productName: 'เสื้อแจ็คเก็ตกันหนาว',
    description: 'เสื้อแจ็คเก็ตกันหนาวสีดำ สภาพดี',
    price: '890.00',
    categoryId: 1,
    category: { id: 1, categoryName: 'เสื้อผ้า', parentCategoryId: null },
    brandId: 3,
    brand: { id: 3, brandName: 'Adidas' },
    size: 'L',
    condition: 'GOOD',
    saleType: 'FIXED_PRICE',
    status: 'AVAILABLE',
    images: [
      { imageId: 805, imageUrl: 'https://storage.example.invalid/signed/805', urlExpiresAt: null,
        fileSize: 110000, uploadedAt: '2026-09-18T09:20:00Z', sortOrder: 0, photoType: 'MAIN' },
    ],
    createdAt: '2026-09-18T09:20:00Z',
    updatedAt: '2026-09-18T09:20:00Z',
    publicListMainImage: { imageId: 805, imageUrl: 'https://storage.example.invalid/signed/805', urlExpiresAt: null },
  },
  {
    id: 106,
    productName: 'กางเกงยีนส์ขายาว',
    description: 'กางเกงยีนส์ขายาว สภาพเหมือนใหม่ ไม่ขาด',
    price: '450.00',
    categoryId: 1,
    category: { id: 1, categoryName: 'เสื้อผ้า', parentCategoryId: null },
    brandId: 4,
    brand: { id: 4, brandName: 'Uniqlo' },
    size: '32',
    condition: 'LIKE_NEW',
    saleType: 'FIXED_PRICE',
    status: 'AVAILABLE',
    images: [
      { imageId: 806, imageUrl: 'https://storage.example.invalid/signed/806', urlExpiresAt: null,
        fileSize: 105000, uploadedAt: '2026-09-18T09:10:00Z', sortOrder: 0, photoType: 'MAIN' },
    ],
    createdAt: '2026-09-18T09:10:00Z',
    updatedAt: '2026-09-18T09:10:00Z',
    publicListMainImage: { imageId: 806, imageUrl: 'https://storage.example.invalid/signed/806', urlExpiresAt: null },
  },
  {
    // MOCK: สินค้านี้ถูกยกเลิกแล้ว ต้องไม่โผล่ใน public list และ GET detail ต้องตอบ 404 PRODUCT_NOT_FOUND
    id: 107,
    productName: 'หมวกแก๊ป',
    description: 'หมวกแก๊ปสีขาว สภาพดี (ประกาศนี้ถูกยกเลิกแล้ว)',
    price: '190.00',
    categoryId: 4,
    category: { id: 4, categoryName: 'เครื่องประดับ', parentCategoryId: null },
    brandId: 1,
    brand: { id: 1, brandName: 'ไม่ระบุแบรนด์' },
    size: 'ไม่ระบุขนาด',
    condition: 'GOOD',
    saleType: 'FIXED_PRICE',
    status: 'CANCELLED',
    images: [
      { imageId: 807, imageUrl: 'https://storage.example.invalid/signed/807', urlExpiresAt: null,
        fileSize: 60000, uploadedAt: '2026-09-18T09:05:00Z', sortOrder: 0, photoType: 'MAIN' },
    ],
    createdAt: '2026-09-18T09:05:00Z',
    updatedAt: '2026-09-18T09:35:00Z',
    publicListMainImage: null,
  },
  {
    id: 108,
    productName: 'กระเป๋าสตางค์หนัง',
    description: 'กระเป๋าสตางค์หนังแท้ ยังไม่แกะป้าย',
    price: '690.00',
    categoryId: 3,
    category: { id: 3, categoryName: 'กระเป๋า', parentCategoryId: null },
    brandId: 1,
    brand: { id: 1, brandName: 'ไม่ระบุแบรนด์' },
    size: 'ไม่ระบุขนาด',
    condition: 'NEW',
    saleType: 'FIXED_PRICE',
    status: 'AVAILABLE',
    images: [
      { imageId: 808, imageUrl: 'https://storage.example.invalid/signed/808', urlExpiresAt: null,
        fileSize: 70000, uploadedAt: '2026-09-18T09:00:00Z', sortOrder: 0, photoType: 'MAIN' },
    ],
    createdAt: '2026-09-18T09:00:00Z',
    updatedAt: '2026-09-18T09:00:00Z',
    publicListMainImage: { imageId: 808, imageUrl: 'https://storage.example.invalid/signed/808', urlExpiresAt: null },
  },
];

function mockSortedAvailable(): MockSeedProduct[] {
  // เรียง created_at DESC, id DESC เสมอ ตาม contract
  return MOCK_SEED
    .filter(product => product.status === 'AVAILABLE')
    .slice()
    .sort((a, b) => {
      const byDate = (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
      return byDate !== 0 ? byDate : b.id - a.id;
    });
}

function mockValidatePage(page: number, pageSize: number): void {
  if (!Number.isInteger(page) || page < 1) {
    throw new ProductCatalogError('validation-error', { code: 'VALIDATION_ERROR', fields: { page: ['หน้าต้องเป็นจำนวนเต็มตั้งแต่ 1'] } });
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new ProductCatalogError('validation-error', {
      code: 'VALIDATION_ERROR', fields: { page_size: [`page_size ต้องอยู่ระหว่าง 1-${MAX_PAGE_SIZE}`] },
    });
  }
}

async function mockListProducts(params: ListProductsParams): Promise<ProductPage> {
  await new Promise(resolve => setTimeout(resolve, 200));
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
  mockValidatePage(page, pageSize);

  const query = (params.q ?? '').trim().toLowerCase();
  const filtered = mockSortedAvailable()
    .filter(product => (!query || product.productName.toLowerCase().includes(query))
      && (!params.categoryId || product.categoryId === params.categoryId));

  const total = filtered.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize).map(product => ({
    id: product.id,
    productName: product.productName,
    price: product.price,
    condition: product.condition,
    status: product.status,
    mainImage: product.publicListMainImage,
    brand: product.brand,
    brandName: product.brand.brandName,
  }));

  return {
    items,
    meta: { page, pageSize, total, totalPages, hasNext: start + items.length < total },
  };
}

async function mockGetProduct(id: number): Promise<ProductDetail> {
  await new Promise(resolve => setTimeout(resolve, 200));
  const found = MOCK_SEED.find(product => product.id === id);
  if (!found || found.status !== 'AVAILABLE') {
    throw new ProductCatalogError('not-found', { code: 'PRODUCT_NOT_FOUND' });
  }
  const { publicListMainImage: _publicListMainImage, ...detail } = found;
  return { ...detail, images: detail.images.map(image => ({ ...image })) };
}

export type ProductCatalogServiceOptions = {
  mode?: 'api' | 'mock';
  baseUrl?: string;
  unavailableCode?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
};

export function createProductCatalogService(options: ProductCatalogServiceOptions = {}) {
  const mode = options.mode ?? 'api';
  const unavailableCode = options.unavailableCode ?? 'PRODUCT_CATALOG_API_BASE_URL_MISSING';
  let baseUrl: string | undefined;
  if (mode === 'api' && options.baseUrl) {
    const parsed = new URL(options.baseUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Invalid API origin');
    baseUrl = parsed.origin;
  }
  const fetcher = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const request = async (path: string, init: RequestInit, signal?: AbortSignal): Promise<unknown> => {
    if (!baseUrl) throw new ProductCatalogError('unavailable', { code: unavailableCode });
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort);
    const aborted = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
    aborted.catch(() => {});
    let response: Response;
    let body: unknown;
    try {
      response = await Promise.race([fetcher(`${baseUrl}${path}`, { ...init, signal: controller.signal }), aborted]);
      body = await Promise.race([readJson(response), aborted]);
    } catch (error) {
      if (signal?.aborted) throw error;
      if (timedOut) throw new ProductCatalogError('timeout');
      throw new ProductCatalogError('network-error');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
    if (timedOut) throw new ProductCatalogError('timeout');

    if (response.ok) return body;
    const envelope = (body as { error?: unknown } | null)?.error;
    const errorObject = typeof envelope === 'object' && envelope !== null ? envelope as Record<string, unknown> : {};
    const code = typeof errorObject.code === 'string' ? errorObject.code : null;
    const requestId = typeof errorObject.request_id === 'string' ? errorObject.request_id : null;
    const fields = toFieldErrors(errorObject.fields);
    if (response.status === 404) throw new ProductCatalogError('not-found', { code, requestId });
    if (response.status === 422) throw new ProductCatalogError('validation-error', { code, fields, requestId });
    if (response.status === 503) throw new ProductCatalogError('unavailable', { code, requestId });
    throw new ProductCatalogError('server-error', { code, requestId });
  };

  return {
    async listProducts(params: ListProductsParams = {}, signal?: AbortSignal): Promise<ProductPage> {
      // Mock catalog data must always be selected explicitly; missing API configuration is unavailable.
      if (mode === 'mock') return mockListProducts(params);

      const query = new URLSearchParams();
      const q = (params.q ?? '').trim();
      if (q) query.set('q', q);
      if (params.categoryId != null) query.set('category_id', String(params.categoryId));
      query.set('page', String(params.page ?? 1));
      query.set('page_size', String(params.pageSize ?? DEFAULT_PAGE_SIZE));
      return toPage(await request(`/products?${query.toString()}`, { method: 'GET' }, signal));
    },

    async getCategories(signal?: AbortSignal): Promise<ProductCategory[]> {
      if (mode === 'mock') return [...new Map(MOCK_SEED.map(p => [p.category.id, p.category])).values()];
      const body = obj(await request('/categories', { method: 'GET' }, signal));
      if (!Array.isArray(body.data)) throw new ProductCatalogError('server-error');
      return body.data.map(toCategory);
    },

    async getProduct(id: number, signal?: AbortSignal): Promise<ProductDetail> {
      if (mode === 'mock') return mockGetProduct(id);

      const body = obj(await request(`/products/${encodeURIComponent(id)}`, { method: 'GET' }, signal));
      return toDetail(body.data);
    },
  };
}

export type ProductCatalogService = ReturnType<typeof createProductCatalogService>;
