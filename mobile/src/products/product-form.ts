import { CATEGORY_OPTIONS, CONDITION_OPTIONS, type ProductInput } from '../services/product-service.ts';

export type ProductFormValues = ProductInput;

export const emptyProductFormValues: ProductFormValues = {
  name: '',
  description: '',
  size: '',
  condition: CONDITION_OPTIONS[0],
  price: 0,
  category: CATEGORY_OPTIONS[0],
  brand: '',
  images: [],
};

export type ProductFieldErrors = { name?: string; price?: string };

export function validateProductForm(values: ProductFormValues, priceText: string): ProductFieldErrors {
  const errors: ProductFieldErrors = {};
  if (!values.name.trim()) errors.name = 'กรุณากรอกชื่อสินค้า';
  const price = Number(priceText);
  if (!priceText.trim() || !Number.isFinite(price) || price <= 0) {
    errors.price = 'กรุณากรอกราคาที่มากกว่า 0';
  }
  return errors;
}

export type AddProductImageResult = { values: ProductFormValues; error: string | null };

/** ห่อการอัปโหลดรูปไว้แยกจาก React state เพื่อให้ทดสอบกรณีอัปโหลดล้มเหลวได้โดยไม่ต้อง render component */
export async function addProductImage(
  values: ProductFormValues,
  uploadImage: () => Promise<{ url: string }>,
): Promise<AddProductImageResult> {
  try {
    const uploaded = await uploadImage();
    return { values: { ...values, images: [...values.images, uploaded.url] }, error: null };
  } catch {
    return { values, error: 'อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่' };
  }
}
