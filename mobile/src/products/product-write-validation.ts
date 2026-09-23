export type ProductWriteFields = {
  name: string;
  description: string;
  size: string;
  price: string;
};

export type ProductWriteErrors = Partial<Record<keyof ProductWriteFields, string>>;

const PRICE_PATTERN = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/;
const ZERO_PRICE = /^0(?:\.0{1,2})?$/;

/** Mirrors the product request schema without converting the seller's decimal text to a number. */
export function validateProductWriteFields(values: ProductWriteFields): ProductWriteErrors {
  const errors: ProductWriteErrors = {};
  if (values.name.trim().length < 1 || values.name.trim().length > 255) {
    errors.name = 'ชื่อต้องมีความยาว 1–255 ตัวอักษร';
  }
  if (values.description.trim().length < 1 || values.description.trim().length > 1000) {
    errors.description = 'รายละเอียดต้องมีความยาว 1–1000 ตัวอักษร';
  }
  if (values.size.trim().length < 1 || values.size.trim().length > 100) {
    errors.size = 'ขนาดต้องมีความยาว 1–100 ตัวอักษร';
  }
  if (typeof values.price !== 'string' || !PRICE_PATTERN.test(values.price) || ZERO_PRICE.test(values.price)) {
    errors.price = 'ราคาต้องมากกว่า 0 ไม่เกิน 9999999999.99 และมีทศนิยมไม่เกิน 2 ตำแหน่ง';
  }
  return errors;
}
