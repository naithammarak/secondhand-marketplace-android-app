import {
  CONDITION_OPTIONS,
  ProductServiceError,
  type BrandOption,
  type CategoryOption,
  type ProductInput,
} from '../services/product-service.ts';
import { validateProductBrand, validateProductWriteFields } from './product-write-validation.ts';

export type ProductFormValues = ProductInput;

export const emptyProductFormValues: ProductFormValues = {
  name: '',
  description: '',
  size: '',
  condition: CONDITION_OPTIONS[0],
  price: '',
  category: '',
  categoryId: undefined,
  brand: '',
  brandId: undefined,
  images: [],
};

export type ProductFieldErrors = {
  name?: string;
  description?: string;
  size?: string;
  price?: string;
  category?: string;
  brand?: string;
  images?: string;
};

export const MAX_PRODUCT_IMAGES = 10;
export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;

export function validateProductImageFile(file: { type: string; size?: number }): string | null {
  if (file.type !== 'image/jpeg' && file.type !== 'image/png') {
    return 'รองรับเฉพาะรูป JPEG หรือ PNG';
  }
  if (typeof file.size === 'number' && (file.size <= 0 || file.size > MAX_PRODUCT_IMAGE_BYTES)) {
    return 'รูปภาพต้องมีขนาดไม่เกิน 5 MiB';
  }
  return null;
}

export function validateProductForm(
  values: ProductFormValues,
  priceText: string,
  options?: { categories?: CategoryOption[]; brands?: BrandOption[] },
): ProductFieldErrors {
  const errors: ProductFieldErrors = {};
  Object.assign(errors, validateProductWriteFields({ ...values, price: priceText }));
  if (options?.categories && options.categories.length > 0) {
    if (!values.categoryId || !options.categories.some(c => c.id === values.categoryId)) {
      errors.category = 'กรุณาเลือกหมวดหมู่สินค้า';
    }
  }
  const brandError = validateProductBrand(values.brand);
  if (brandError) errors.brand = brandError;
  if (values.brandId && options?.brands && options.brands.length > 0) {
    if (!options.brands.some(b => b.id === values.brandId)) {
      errors.brand = 'กรุณาเลือกแบรนด์สินค้า';
    }
  }
  if (values.images.length < 1 || values.images.length > MAX_PRODUCT_IMAGES) {
    errors.images = `กรุณาแนบรูปภาพ 1–${MAX_PRODUCT_IMAGES} รูป`;
  }
  return errors;
}

export type UploadProductImageResult =
  | { url: string; error: null }
  | { url: null; error: string };

/** ห่อการอัปโหลดรูปไว้แยกจาก React state เพื่อให้ทดสอบกรณีอัปโหลดล้มเหลวได้โดยไม่ต้อง render component */
export async function uploadProductImage(
  uploadImage: () => Promise<{ url: string }>,
): Promise<UploadProductImageResult> {
  try {
    const uploaded = await uploadImage();
    return { url: uploaded.url, error: null };
  } catch (error) {
    return { url: null, error: error instanceof ProductServiceError ? error.message : 'อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่' };
  }
}

export type AddProductImageResult = { values: ProductFormValues; error: string | null };

export function addProductImage(values: ProductFormValues, imageUrl: string): ProductFormValues;
export function addProductImage(
  values: ProductFormValues,
  uploadImage: () => Promise<{ url: string }>,
): Promise<AddProductImageResult>;
export function addProductImage(
  values: ProductFormValues,
  second: string | (() => Promise<{ url: string }>),
): ProductFormValues | Promise<AddProductImageResult> {
  if (typeof second === 'string') {
    return { ...values, images: [...values.images, second] };
  }
  return uploadProductImage(second).then(result => {
    if (result.url) {
      return { values: { ...values, images: [...values.images, result.url] }, error: null };
    }
    return { values, error: result.error };
  });
}
