// PRODUCT-06: Product listing (create/edit/cancel) with real API; in-memory data is opt-in for development.
import { validateProductBrand, validateProductWriteFields } from '../products/product-write-validation.ts';
import { ProductRequestCancelledError, ProductRequestTimeoutError, withProductRequestDeadline } from '../products/product-request-deadline.ts';

export type SaleType = 'FIXED_PRICE';

export interface CategoryOption {
  id: number;
  name: string;
}

export interface BrandOption {
  id: number;
  name: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  size: string;
  condition: string;
  price: string;
  category: string;
  categoryId?: number;
  brand: string;
  brandId?: number;
  images: string[];
  saleType: SaleType;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type MyProductSummary = {
  id: string;
  name: string;
  price: string;
  status: string;
  mainImageUrl: string | null;
};

export type MyProductPage = { items: MyProductSummary[]; hasNext: boolean };

export type ProductInput = Omit<Product, 'id' | 'saleType'>;

function validateWriteInput(input: ProductInput): void {
  const fields: Record<string, string> = { ...validateProductWriteFields(input) };
  if (!input.categoryId) fields.category_id = 'กรุณาเลือกหมวดหมู่สินค้า';
  const brandError = validateProductBrand(input.brand);
  if (brandError) fields.brand_name = brandError;
  if (input.images.length < 1 || input.images.length > 10) fields.images = 'กรุณาแนบรูปภาพ 1–10 รูป';
  if (Object.keys(fields).length > 0) {
    throw new ProductServiceError('validation-error', 'ข้อมูลสินค้าไม่ถูกต้อง', fields);
  }
}

function brandRequestFields(input: ProductInput) {
  return input.brandId ? { brand_id: input.brandId } : { brand_name: input.brand.trim() };
}

export const SALE_TYPE: SaleType = 'FIXED_PRICE';

// Standardized condition codes matching backend constraint ck_products_condition
export const CONDITION_OPTIONS = ['NEW', 'LIKE_NEW', 'GOOD', 'FAIR'] as const;
export type ProductCondition = (typeof CONDITION_OPTIONS)[number];

export const CONDITION_LABELS: Record<string, string> = {
  NEW: 'สภาพใหม่',
  LIKE_NEW: 'สภาพเหมือนใหม่',
  GOOD: 'สภาพดี',
  FAIR: 'สภาพพอใช้',
};

export const CATEGORY_OPTIONS = ['เสื้อผ้า', 'รองเท้า', 'กระเป๋า', 'เครื่องประดับ', 'อื่น ๆ'] as const;
export const BRAND_OPTIONS = ['ไม่ระบุแบรนด์', 'Nike', 'Adidas', 'Uniqlo', 'Zara'] as const;

export const CATEGORY_NAME_TO_ID: Record<string, number> = {
  'เสื้อผ้า': 1,
  'รองเท้า': 2,
  'กระเป๋า': 3,
  'เครื่องประดับ': 4,
  'อื่น ๆ': 5,
  'อิเล็กทรอนิกส์': 5,
};

export const CATEGORY_ID_TO_NAME: Record<number, string> = {
  1: 'เสื้อผ้า',
  2: 'รองเท้า',
  3: 'กระเป๋า',
  4: 'เครื่องประดับ',
  5: 'อื่น ๆ',
};

export const BRAND_NAME_TO_ID: Record<string, number> = {
  'ไม่ระบุแบรนด์': 1,
  'Nike': 2,
  'Adidas': 3,
  'Uniqlo': 4,
  'Zara': 5,
};

export const BRAND_ID_TO_NAME: Record<number, string> = {
  1: 'ไม่ระบุแบรนด์',
  2: 'Nike',
  3: 'Adidas',
  4: 'Uniqlo',
  5: 'Zara',
};

export type ProductServiceErrorKind =
  | 'not-found'
  | 'unauthorized'
  | 'forbidden'
  | 'conflict'
  | 'validation-error'
  | 'network-error'
  | 'timeout'
  | 'unavailable'
  | 'server-error';

export class ProductServiceError extends Error {
  readonly kind: ProductServiceErrorKind;
  readonly fields: Record<string, string>;

  constructor(kind: ProductServiceErrorKind, message?: string, fields: Record<string, string> = {}) {
    super(message ?? kind);
    this.name = 'ProductServiceError';
    this.kind = kind;
    this.fields = fields;
  }
}

export type ProductImageMeta = {
  uploadId?: number;
  imageId?: number;
};

const imageMetaRegistry = new Map<string, ProductImageMeta>();

export function registerProductImage(url: string, meta: ProductImageMeta): void {
  imageMetaRegistry.set(url, meta);
}

export function getProductImageMeta(url: string): ProductImageMeta | undefined {
  return imageMetaRegistry.get(url);
}

export function clearProductImageRegistry(): void {
  imageMetaRegistry.clear();
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type ProductServiceOptions = {
  baseUrl?: string;
  mockMode?: boolean;
  fetch?: FetchLike;
  getAccessToken?: () => Promise<string | null | undefined> | string | null | undefined;
  timeoutMs?: number;
};

let mockProducts: Product[] = [];
let mockIdCounter = 0;

function cloneProduct(product: Product): Product {
  return { ...product, images: [...product.images] };
}

function transformBackendProduct(data: any): Product {
  const images: string[] = [];
  if (Array.isArray(data.images)) {
    for (const img of data.images) {
      const url = img.image_url ?? img.url;
      if (url) {
        images.push(url);
        registerProductImage(url, {
          imageId: typeof img.image_id === 'number' ? img.image_id : undefined,
          uploadId: typeof img.upload_id === 'number' ? img.upload_id : undefined,
        });
      }
    }
  }

  const categoryId = data.category?.id ?? data.category_id ?? 1;
  const categoryName =
    data.category?.category_name ??
    CATEGORY_ID_TO_NAME[categoryId] ??
    'อื่น ๆ';
  const brandId = data.brand?.id ?? data.brand_id ?? 1;
  const brandName =
    data.brand?.brand_name ??
    BRAND_ID_TO_NAME[brandId] ??
    'ไม่ระบุแบรนด์';

  return {
    id: String(data.id),
    name: data.product_name ?? '',
    description: data.description ?? '',
    size: data.size ?? '',
    condition: data.condition ?? 'GOOD',
    price: typeof data.price === 'string' ? data.price : '',
    category: categoryName,
    categoryId,
    brand: brandName,
    brandId,
    images,
    saleType: data.sale_type ?? SALE_TYPE,
    status: data.status,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export function createProductService(options: ProductServiceOptions = {}) {
  const mockMode = options.mockMode === true;
  let baseUrl: string | undefined;
  if (!mockMode && options.baseUrl) {
    const parsed = new URL(options.baseUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Invalid API origin');
    baseUrl = parsed.origin;
  }

  const fetcher = options.fetch ?? fetch;
  const unavailable = () => new ProductServiceError('unavailable', 'ยังไม่ได้ตั้งค่า API สำหรับสินค้า');

  async function resolveAccessToken(explicitToken?: string): Promise<string | null> {
    if (explicitToken) return explicitToken;
    if (options.getAccessToken) {
      const token = await options.getAccessToken();
      if (token) return token;
    }
    try {
      const { getSupabaseClient } = await import('../auth/supabase-client.ts');
      const supabase = getSupabaseClient();
      if (supabase) {
        const sessionRes = await supabase.auth.getSession();
        return sessionRes.data.session?.access_token ?? null;
      }
    } catch {
      // ignore
    }
    return null;
  }

  const request = async (
    path: string,
    init: RequestInit,
    accessToken?: string,
    callerSignal?: AbortSignal,
  ): Promise<any> => {
    if (!baseUrl) throw unavailable();
    try {
      return await withProductRequestDeadline(async signal => {
        const token = await resolveAccessToken(accessToken);
        const headers: Record<string, string> = {
          Accept: 'application/json',
          ...((init.headers as Record<string, string>) || {}),
        };
        if (token) headers.Authorization = 'Bearer ' + token;
        const response = await fetcher(baseUrl + path, { ...init, headers, signal });
        if (response.ok) return response.json();
        if (response.status === 401) throw new ProductServiceError('unauthorized', 'กรุณาเข้าสู่ระบบใหม่');
        if (response.status === 403) throw new ProductServiceError('forbidden', 'บัญชีผู้ขายยังไม่ได้รับอนุมัติหรือไม่มีสิทธิ์ทำรายการ');
        if (response.status === 404) throw new ProductServiceError('not-found', 'ไม่พบข้อมูลสินค้านี้');
        if (response.status === 409) throw new ProductServiceError('conflict', 'สถานะปัจจุบันไม่อนุญาตให้ทำรายการนี้');
        if (response.status === 422) {
          const errJson = await response.json();
          const fields: Record<string, string> = {};
          if (errJson?.error?.fields && typeof errJson.error.fields === 'object') {
            for (const [key, value] of Object.entries(errJson.error.fields)) {
              fields[key] = Array.isArray(value) ? value.join(', ') : String(value);
            }
          }
          throw new ProductServiceError('validation-error', 'ข้อมูลสินค้าไม่ถูกต้อง', fields);
        }
        throw new ProductServiceError('server-error', 'เกิดข้อผิดพลาดจากเซิร์ฟเวอร์ กรุณาลองใหม่');
      }, options.timeoutMs, callerSignal);
    } catch (error) {
      if (error instanceof ProductRequestCancelledError) throw error;
      if (error instanceof ProductRequestTimeoutError) {
        throw new ProductServiceError('timeout', error.message);
      }
      if (error instanceof ProductServiceError) throw error;
      if (callerSignal?.aborted) throw new ProductRequestCancelledError();
      if (error instanceof SyntaxError) {
        throw new ProductServiceError('server-error', 'ข้อมูลตอบกลับจากเซิร์ฟเวอร์ไม่ถูกต้อง');
      }
      throw new ProductServiceError('network-error', 'เครือข่ายขัดข้อง กรุณาตรวจสอบผลรายการก่อนลองใหม่');
    }
  };

  return {
    async getMyProducts(page = 1, explicitToken?: string): Promise<MyProductPage> {
      if (!baseUrl) {
        if (!mockMode) throw unavailable();
        const start = (page - 1) * 20;
        return {
          items: mockProducts.slice(start, start + 20).map(product => ({
            id: product.id, name: product.name, price: product.price,
            status: product.status ?? 'AVAILABLE', mainImageUrl: product.images[0] ?? null,
          })),
          hasNext: start + 20 < mockProducts.length,
        };
      }
      const json = await request(`/products/me?page=${page}&page_size=20`, { method: 'GET' }, explicitToken);
      return {
        items: json.data.map((item: any) => ({
          id: String(item.id), name: item.product_name, price: item.price,
          status: item.status, mainImageUrl: item.main_image?.image_url ?? null,
        })),
        hasNext: json.meta.has_next === true,
      };
    },
    async createProduct(input: ProductInput, explicitToken?: string, signal?: AbortSignal): Promise<Product> {
      validateWriteInput(input);
      if (!baseUrl) {
        if (!mockMode) throw unavailable();
        mockIdCounter += 1;
        const product: Product = {
          ...input,
          images: [...input.images],
          id: `mock-${mockIdCounter}`,
          saleType: SALE_TYPE,
          status: 'AVAILABLE',
        };
        mockProducts = [...mockProducts, product];
        return cloneProduct(product);
      }

      const imageRefs = input.images.map(url => {
        const meta = getProductImageMeta(url);
        if (!meta?.uploadId) throw new ProductServiceError('validation-error', 'กรุณาอัปโหลดรูปภาพใหม่');
        return { upload_id: meta.uploadId };
      });

      const body = {
        product_name: input.name.trim(),
        description: input.description.trim(),
        price: input.price,
        category_id: input.categoryId,
        ...brandRequestFields(input),
        size: input.size.trim(),
        condition: input.condition,
        sale_type: SALE_TYPE,
        images: imageRefs,
      };

      const json = await request(
        '/products',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        explicitToken,
        signal,
      );

      return transformBackendProduct(json.data ?? json);
    },

    async updateProduct(id: string, input: ProductInput, explicitToken?: string, signal?: AbortSignal): Promise<Product> {
      validateWriteInput(input);
      if (!baseUrl) {
        if (!mockMode) throw unavailable();
        const index = mockProducts.findIndex(product => product.id === id);
        if (index === -1) throw new ProductServiceError('not-found');
        const updated: Product = { ...input, images: [...input.images], id, saleType: SALE_TYPE, status: 'AVAILABLE' };
        mockProducts = [...mockProducts.slice(0, index), updated, ...mockProducts.slice(index + 1)];
        return cloneProduct(updated);
      }

      const imageRefs = input.images.map(url => {
        const meta = getProductImageMeta(url);
        if (meta?.imageId) return { image_id: meta.imageId };
        if (meta?.uploadId) return { upload_id: meta.uploadId };
        throw new ProductServiceError('validation-error', 'กรุณาโหลดรูปภาพสินค้าใหม่');
      });

      const body: Record<string, any> = {
        product_name: input.name.trim(),
        description: input.description.trim(),
        price: input.price,
        category_id: input.categoryId,
        ...brandRequestFields(input),
        size: input.size.trim(),
        condition: input.condition,
        sale_type: SALE_TYPE,
        images: imageRefs,
      };

      const json = await request(
        `/products/${id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        explicitToken,
        signal,
      );

      return transformBackendProduct(json.data ?? json);
    },

    async getProductById(id: string, explicitToken?: string, signal?: AbortSignal): Promise<Product | null> {
      if (!baseUrl) {
        if (!mockMode) throw unavailable();
        const found = mockProducts.find(product => product.id === id);
        return found ? cloneProduct(found) : null;
      }

      const token = await resolveAccessToken(explicitToken);
      if (!token) throw new ProductServiceError('unauthorized', 'กรุณาเข้าสู่ระบบใหม่');
      try {
        const json = await request(`/products/me/${id}`, { method: 'GET' }, token, signal);
        return transformBackendProduct(json.data ?? json);
      } catch (error) {
        if (error instanceof ProductServiceError && error.kind === 'not-found') {
          return null;
        }
        throw error;
      }
    },

    async getCategories(): Promise<CategoryOption[]> {
      if (!baseUrl) {
        if (!mockMode) throw unavailable();
        return [
          { id: 1, name: 'เสื้อผ้า' },
          { id: 2, name: 'รองเท้า' },
          { id: 3, name: 'กระเป๋า' },
          { id: 4, name: 'เครื่องประดับ' },
          { id: 5, name: 'อื่น ๆ' },
        ];
      }

      const json = await request('/categories', { method: 'GET' });
      const list = json.data ?? [];
      return list.map((c: any) => ({ id: c.id, name: c.category_name }));
    },

    async getBrands(): Promise<BrandOption[]> {
      if (!baseUrl) {
        if (!mockMode) throw unavailable();
        return [
          { id: 1, name: 'ไม่ระบุแบรนด์' },
          { id: 2, name: 'Nike' },
          { id: 3, name: 'Adidas' },
          { id: 4, name: 'Uniqlo' },
          { id: 5, name: 'Zara' },
        ];
      }

      const json = await request('/brands', { method: 'GET' });
      const list = json.data ?? [];
      return list.map((b: any) => ({ id: b.id, name: b.brand_name }));
    },

    async cancelProduct(id: string, explicitToken?: string, signal?: AbortSignal): Promise<Product> {
      if (!baseUrl) {
        if (!mockMode) throw unavailable();
        const index = mockProducts.findIndex(product => product.id === id);
        if (index === -1) throw new ProductServiceError('not-found');
        const cancelled: Product = { ...mockProducts[index], status: 'CANCELLED' };
        mockProducts = [...mockProducts.slice(0, index), cancelled, ...mockProducts.slice(index + 1)];
        return cloneProduct(cancelled);
      }

      const json = await request(
        `/products/${id}/cancel`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        },
        explicitToken,
        signal,
      );

      return transformBackendProduct(json.data ?? json);
    },
  };
}

export type ProductService = ReturnType<typeof createProductService>;
