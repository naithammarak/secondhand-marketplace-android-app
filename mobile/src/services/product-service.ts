// PRODUCT-06: Product listing (create/edit/cancel) with real Backend API & fallback Mock.

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
  price: number;
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

export type ProductInput = Omit<Product, 'id' | 'saleType'>;

export const SALE_TYPE: SaleType = 'FIXED_PRICE';

// Standardized condition codes matching backend constraint ck_products_condition
export const CONDITION_OPTIONS = ['NEW', 'LIKE_NEW', 'GOOD', 'FAIR'] as const;
export type ProductCondition = (typeof CONDITION_OPTIONS)[number];

export const CONDITION_LABELS: Record<string, string> = {
  NEW: 'ใหม่',
  LIKE_NEW: 'เหมือนใหม่',
  GOOD: 'สภาพดี',
  FAIR: 'พอใช้',
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
  fetch?: FetchLike;
  getAccessToken?: () => Promise<string | null | undefined> | string | null | undefined;
};

let mockProducts: Product[] = [];
let mockIdCounter = 0;

function cloneProduct(product: Product): Product {
  return { ...product, images: [...product.images] };
}

function parseNumericSuffix(val: string): number | null {
  const match = val.match(/\d+$/);
  return match ? parseInt(match[0], 10) : null;
}

function toBackendCategoryId(categoryName: string): number {
  return CATEGORY_NAME_TO_ID[categoryName] ?? 5;
}

function toBackendBrandId(brandName: string): number {
  return BRAND_NAME_TO_ID[brandName] ?? 1;
}

function formatBackendPrice(price: number): string {
  return Number.isFinite(price) && price > 0 ? price.toFixed(2) : '0.00';
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
    price: typeof data.price === 'string' ? parseFloat(data.price) : Number(data.price || 0),
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
  let baseUrl: string | undefined;
  if (options.baseUrl) {
    const parsed = new URL(options.baseUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Invalid API origin');
    baseUrl = parsed.origin;
  }

  const fetcher = options.fetch ?? fetch;

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
    signal?: AbortSignal,
  ): Promise<Response> => {
    if (!baseUrl) throw new ProductServiceError('network-error', 'API baseUrl not configured');
    const token = await resolveAccessToken(accessToken);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...((init.headers as Record<string, string>) || {}),
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    let response: Response;
    try {
      response = await fetcher(`${baseUrl}${path}`, { ...init, headers, signal });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new ProductServiceError('network-error', 'เครือข่ายขัดข้อง กรุณาลองใหม่');
    }

    if (response.ok) return response;
    if (response.status === 401) {
      throw new ProductServiceError('unauthorized', 'กรุณาเข้าสู่ระบบใหม่');
    }
    if (response.status === 403) {
      throw new ProductServiceError('forbidden', 'บัญชีผู้ขายยังไม่ได้รับอนุมัติหรือไม่มีสิทธิ์ทำรายการ');
    }
    if (response.status === 404) {
      throw new ProductServiceError('not-found', 'ไม่พบข้อมูลสินค้านี้');
    }
    if (response.status === 409) {
      throw new ProductServiceError('conflict', 'สถานะปัจจุบันไม่อนุญาตให้ทำรายการนี้');
    }
    if (response.status === 422) {
      let fields: Record<string, string> = {};
      try {
        const errJson = await response.json();
        if (errJson?.error?.fields && typeof errJson.error.fields === 'object') {
          for (const [k, v] of Object.entries(errJson.error.fields)) {
            fields[k] = Array.isArray(v) ? v.join(', ') : String(v);
          }
        }
      } catch {
        // ignore parse error
      }
      throw new ProductServiceError('validation-error', 'ข้อมูลสินค้าไม่ถูกต้อง', fields);
    }
    throw new ProductServiceError('server-error', 'เกิดข้อผิดพลาดจากเซิร์ฟเวอร์ กรุณาลองใหม่');
  };

  return {
    async createProduct(input: ProductInput, explicitToken?: string): Promise<Product> {
      if (!baseUrl) {
        mockIdCounter += 1;
        const product: Product = {
          ...input,
          images: [...input.images],
          id: `mock-${mockIdCounter}`,
          saleType: SALE_TYPE,
        };
        mockProducts = [...mockProducts, product];
        return cloneProduct(product);
      }

      const imageRefs = input.images.map(url => {
        const meta = getProductImageMeta(url);
        const uploadId = meta?.uploadId ?? parseNumericSuffix(url) ?? 1;
        return { upload_id: uploadId };
      });

      const categoryId = input.categoryId ?? toBackendCategoryId(input.category);
      const brandId = input.brandId ?? toBackendBrandId(input.brand);

      const body = {
        product_name: input.name.trim(),
        description: input.description.trim() || input.name.trim(),
        price: formatBackendPrice(input.price),
        category_id: categoryId,
        brand_id: brandId,
        size: input.size.trim() || 'M',
        condition: input.condition,
        sale_type: SALE_TYPE,
        images: imageRefs,
      };

      const res = await request(
        '/products',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        explicitToken,
      );

      const json = await res.json();
      return transformBackendProduct(json.data ?? json);
    },

    async updateProduct(id: string, input: ProductInput, explicitToken?: string): Promise<Product> {
      if (!baseUrl) {
        const index = mockProducts.findIndex(product => product.id === id);
        if (index === -1) throw new ProductServiceError('not-found');
        const updated: Product = { ...input, images: [...input.images], id, saleType: SALE_TYPE };
        mockProducts = [...mockProducts.slice(0, index), updated, ...mockProducts.slice(index + 1)];
        return cloneProduct(updated);
      }

      const imageRefs = input.images.map(url => {
        const meta = getProductImageMeta(url);
        if (meta?.imageId) return { image_id: meta.imageId };
        if (meta?.uploadId) return { upload_id: meta.uploadId };
        const num = parseNumericSuffix(url);
        return num ? { upload_id: num } : { upload_id: 1 };
      });

      const categoryId = input.categoryId ?? toBackendCategoryId(input.category);
      const brandId = input.brandId ?? toBackendBrandId(input.brand);

      const body: Record<string, any> = {
        product_name: input.name.trim(),
        description: input.description.trim() || input.name.trim(),
        price: formatBackendPrice(input.price),
        category_id: categoryId,
        brand_id: brandId,
        size: input.size.trim() || 'M',
        condition: input.condition,
        sale_type: SALE_TYPE,
        images: imageRefs,
      };

      const res = await request(
        `/products/${id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        explicitToken,
      );

      const json = await res.json();
      return transformBackendProduct(json.data ?? json);
    },

    async getProductById(id: string, explicitToken?: string): Promise<Product | null> {
      if (!baseUrl) {
        const found = mockProducts.find(product => product.id === id);
        return found ? cloneProduct(found) : null;
      }

      const token = await resolveAccessToken(explicitToken);
      // For sellers editing/managing their products, prefer the owner endpoint /products/me/{id}
      if (token) {
        try {
          const res = await request(`/products/me/${id}`, { method: 'GET' }, token);
          const json = await res.json();
          return transformBackendProduct(json.data ?? json);
        } catch (error) {
          if (error instanceof ProductServiceError && error.kind === 'not-found') {
            return null;
          }
          // If forbidden (e.g. non-owner or buyer), fall back to public read below
        }
      }

      try {
        const res = await request(`/products/${id}`, { method: 'GET' }, explicitToken);
        const json = await res.json();
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
        return [
          { id: 1, name: 'เสื้อผ้า' },
          { id: 2, name: 'รองเท้า' },
          { id: 3, name: 'กระเป๋า' },
          { id: 4, name: 'เครื่องประดับ' },
          { id: 5, name: 'อื่น ๆ' },
        ];
      }

      try {
        const res = await request('/categories', { method: 'GET' });
        const json = await res.json();
        const list = json.data ?? [];
        return list.map((c: any) => ({ id: c.id, name: c.category_name }));
      } catch {
        // Return standard fallback options on temporary connection failure
        return [
          { id: 1, name: 'เสื้อผ้า' },
          { id: 2, name: 'รองเท้า' },
          { id: 3, name: 'กระเป๋า' },
          { id: 4, name: 'เครื่องประดับ' },
          { id: 5, name: 'อื่น ๆ' },
        ];
      }
    },

    async getBrands(): Promise<BrandOption[]> {
      if (!baseUrl) {
        return [
          { id: 1, name: 'ไม่ระบุแบรนด์' },
          { id: 2, name: 'Nike' },
          { id: 3, name: 'Adidas' },
          { id: 4, name: 'Uniqlo' },
          { id: 5, name: 'Zara' },
        ];
      }

      try {
        const res = await request('/brands', { method: 'GET' });
        const json = await res.json();
        const list = json.data ?? [];
        return list.map((b: any) => ({ id: b.id, name: b.brand_name }));
      } catch {
        // Return standard fallback options on temporary connection failure
        return [
          { id: 1, name: 'ไม่ระบุแบรนด์' },
          { id: 2, name: 'Nike' },
          { id: 3, name: 'Adidas' },
          { id: 4, name: 'Uniqlo' },
          { id: 5, name: 'Zara' },
        ];
      }
    },

    async cancelProduct(id: string, explicitToken?: string): Promise<Product> {
      if (!baseUrl) {
        const index = mockProducts.findIndex(product => product.id === id);
        if (index === -1) throw new ProductServiceError('not-found');
        const cancelled: Product = { ...mockProducts[index], status: 'CANCELLED' };
        mockProducts = [...mockProducts.slice(0, index), cancelled, ...mockProducts.slice(index + 1)];
        return cloneProduct(cancelled);
      }

      const res = await request(
        `/products/${id}/cancel`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        },
        explicitToken,
      );

      const json = await res.json();
      return transformBackendProduct(json.data ?? json);
    },
  };
}

export type ProductService = ReturnType<typeof createProductService>;
