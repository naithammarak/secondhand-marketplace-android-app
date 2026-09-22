// PRODUCT-06: Product listing (create/edit) — backend not connected yet.
export type SaleType = 'FIXED_PRICE';

export interface Product {
  id: string;
  name: string;
  description: string;
  size: string;
  condition: string;
  price: number;
  category: string;
  brand: string;
  images: string[];
  saleType: SaleType;
}

export type ProductInput = Omit<Product, 'id' | 'saleType'>;

// Auction is out of scope for PRODUCT-06: every product is created as FIXED_PRICE.
export const SALE_TYPE: SaleType = 'FIXED_PRICE';

// TODO(PRODUCT-06): placeholder option lists until the backend exposes real
// category/condition values (from the Product model / class diagram).
export const CONDITION_OPTIONS = ['ใหม่', 'เหมือนใหม่', 'สภาพดี', 'พอใช้', 'มีตำหนิ'];
export const CATEGORY_OPTIONS = ['เสื้อผ้า', 'รองเท้า', 'กระเป๋า', 'เครื่องประดับ', 'อิเล็กทรอนิกส์', 'อื่น ๆ'];

export type ProductServiceErrorKind = 'not-found';

export class ProductServiceError extends Error {
  readonly kind: ProductServiceErrorKind;

  constructor(kind: ProductServiceErrorKind) {
    super(kind);
    this.name = 'ProductServiceError';
    this.kind = kind;
  }
}

// TODO(PRODUCT-06): Mock only. This in-memory store resets on every app
// reload/restart and is never shared across devices or with a real backend.
// Replace the mock branch below with real HTTP calls once the product API
// exists, following the createMeService pattern in me-service.ts.
let mockProducts: Product[] = [];
let mockIdCounter = 0;

function cloneProduct(product: Product): Product {
  return { ...product, images: [...product.images] };
}

export function createProductService(options: { baseUrl?: string } = {}) {
  let baseUrl: string | undefined;
  if (options.baseUrl) {
    const parsed = new URL(options.baseUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Invalid API origin');
    baseUrl = parsed.origin;
  }

  return {
    async createProduct(input: ProductInput): Promise<Product> {
      if (baseUrl) throw new Error('Backend product API is not implemented yet');
      mockIdCounter += 1;
      const product: Product = { ...input, images: [...input.images], id: `mock-${mockIdCounter}`, saleType: SALE_TYPE };
      mockProducts = [...mockProducts, product];
      return cloneProduct(product);
    },

    async updateProduct(id: string, input: ProductInput): Promise<Product> {
      if (baseUrl) throw new Error('Backend product API is not implemented yet');
      const index = mockProducts.findIndex(product => product.id === id);
      if (index === -1) throw new ProductServiceError('not-found');
      const updated: Product = { ...input, images: [...input.images], id, saleType: SALE_TYPE };
      mockProducts = [...mockProducts.slice(0, index), updated, ...mockProducts.slice(index + 1)];
      return cloneProduct(updated);
    },

    async getProductById(id: string): Promise<Product | null> {
      if (baseUrl) throw new Error('Backend product API is not implemented yet');
      const found = mockProducts.find(product => product.id === id);
      return found ? cloneProduct(found) : null;
    },
  };
}
