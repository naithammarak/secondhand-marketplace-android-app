import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addProductImage,
  emptyProductFormValues,
  uploadProductImage,
  validateProductImageFile,
  validateProductForm,
} from '../src/products/product-form.ts';
import { ProductServiceError } from '../src/services/product-service.ts';

const validValues = { ...emptyProductFormValues, name: 'เสื้อยืด', description: 'สภาพดี', size: 'M', brand: 'ไม่ระบุแบรนด์', images: ['mock://product-images/one'] };

test('an empty name is rejected', () => {
  const errors = validateProductForm(emptyProductFormValues, '100');
  assert.equal(errors.name, 'ชื่อต้องมีความยาว 1–255 ตัวอักษร');
});

test('a whitespace-only name is rejected', () => {
  const errors = validateProductForm({ ...validValues, name: '   ' }, '100');
  assert.equal(errors.name, 'ชื่อต้องมีความยาว 1–255 ตัวอักษร');
});

for (const price of ['', '0', '-5', 'abc']) {
  test(`price "${price}" is rejected`, () => {
    const errors = validateProductForm(validValues, price);
    assert.equal(typeof errors.price, 'string');
  });
}

test('a valid name and price pass validation', () => {
  assert.deepEqual(validateProductForm(validValues, '150'), {});
});

test('price follows the backend decimal text contract', () => {
  for (const price of ['0.01', '1', '1.2', '9999999999.99']) {
    assert.equal(validateProductForm(validValues, price).price, undefined, price);
  }
  for (const price of ['0', '0.00', '1.001', '1e2', '1,000', '10000000000', ' 1 ']) {
    assert.equal(typeof validateProductForm(validValues, price).price, 'string', price);
  }
});

test('description and size are required and enforce backend lengths', () => {
  for (const field of ['description', 'size']) {
    assert.equal(typeof validateProductForm({ ...validValues, [field]: '  ' }, '1')[field], 'string');
  }
  assert.equal(typeof validateProductForm({ ...validValues, name: 'x'.repeat(256) }, '1').name, 'string');
  assert.equal(typeof validateProductForm({ ...validValues, description: 'x'.repeat(1001) }, '1').description, 'string');
  assert.equal(typeof validateProductForm({ ...validValues, size: 'x'.repeat(101) }, '1').size, 'string');
});

test('category is required when categories options are provided', () => {
  const categories = [{ id: 42, name: 'เสื้อผ้า' }, { id: 43, name: 'รองเท้า' }];
  const errors = validateProductForm({ ...validValues, categoryId: undefined }, '150', { categories });
  assert.equal(errors.category, 'กรุณาเลือกหมวดหมู่สินค้า');
});

test('invalid categoryId not in categories is rejected', () => {
  const categories = [{ id: 42, name: 'เสื้อผ้า' }, { id: 43, name: 'รองเท้า' }];
  const errors = validateProductForm({ ...validValues, categoryId: 999 }, '150', { categories });
  assert.equal(errors.category, 'กรุณาเลือกหมวดหมู่สินค้า');
});

test('a brand name is required and stale selected IDs are rejected', () => {
  const brands = [{ id: 1, name: 'ไม่ระบุแบรนด์' }, { id: 2, name: 'Nike' }];
  const errorsMissing = validateProductForm({ ...validValues, brand: '   ', brandId: undefined }, '150', { brands });
  assert.equal(errorsMissing.brand, 'ชื่อแบรนด์ต้องมีความยาว 1–255 ตัวอักษร');
  const errorsInvalid = validateProductForm({ ...validValues, brandId: 999 }, '150', { brands });
  assert.equal(errorsInvalid.brand, 'กรุณาเลือกแบรนด์สินค้า');
});

test('custom brand names pass validation without an option ID', () => {
  const brands = [{ id: 2, name: 'Nike' }];
  assert.equal(validateProductForm({ ...validValues, brand: ' แบรนด์ท้องถิ่น ', brandId: undefined }, '150', { brands }).brand, undefined);
  assert.equal(validateProductForm({ ...validValues, brand: '😀'.repeat(255) }, '150', { brands }).brand, undefined);
  assert.equal(typeof validateProductForm({ ...validValues, brand: 'x'.repeat(256) }, '150', { brands }).brand, 'string');
});

test('valid categoryId and brandId matching options pass validation', () => {
  const categories = [{ id: 42, name: 'เสื้อผ้า' }, { id: 43, name: 'รองเท้า' }];
  const brands = [{ id: 1, name: 'ไม่ระบุแบรนด์' }, { id: 2, name: 'Nike' }];
  const errors = validateProductForm({ ...validValues, categoryId: 42, brandId: 1 }, '150', { categories, brands });
  assert.deepEqual(errors, {});
});

test('a valid form reports both fields missing together', () => {
  const errors = validateProductForm(emptyProductFormValues, '');
  assert.equal(typeof errors.name, 'string');
  assert.equal(typeof errors.price, 'string');
});

test('requires 1 to 10 images and rejects unsupported or oversized files before upload', () => {
  assert.equal(typeof validateProductForm(emptyProductFormValues, '100').images, 'string');
  assert.equal(typeof validateProductForm({ ...validValues, images: Array(11).fill('image') }, '100').images, 'string');
  assert.equal(validateProductImageFile({ type: 'image/heic', size: 1024 }), 'รองรับเฉพาะรูป JPEG หรือ PNG');
  assert.equal(validateProductImageFile({ type: 'image/png', size: 5 * 1024 * 1024 + 1 }), 'รูปภาพต้องมีขนาดไม่เกิน 5 MiB');
  assert.equal(validateProductImageFile({ type: 'image/jpeg', size: 5 * 1024 * 1024 }), null);
});

test('addProductImage pure helper appends the new image url to form values', () => {
  const result = addProductImage(validValues, 'mock://product-images/abc');
  assert.deepEqual(result.images, ['mock://product-images/one', 'mock://product-images/abc']);
  // original object should not be mutated
  assert.deepEqual(validValues.images, ['mock://product-images/one']);
});

test('uploadProductImage returns url without error on success', async () => {
  const result = await uploadProductImage(async () => ({ url: 'mock://product-images/abc' }));
  assert.equal(result.url, 'mock://product-images/abc');
  assert.equal(result.error, null);
});

test('uploadProductImage returns error without throwing on failure', async () => {
  const result = await uploadProductImage(async () => { throw new Error('network down'); });
  assert.equal(result.url, null);
  assert.equal(result.error, 'อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่');
});

test('uploadProductImage shows an actionable session error', async () => {
  const result = await uploadProductImage(async () => { throw new ProductServiceError('unauthorized', 'กรุณาเข้าสู่ระบบใหม่'); });
  assert.equal(result.error, 'กรุณาเข้าสู่ระบบใหม่');
});

test('a successful upload appends the new image url', async () => {
  const result = await addProductImage(validValues, async () => ({ url: 'mock://product-images/abc' }));
  assert.equal(result.error, null);
  assert.deepEqual(result.values.images, ['mock://product-images/one', 'mock://product-images/abc']);
});

test('a failed upload keeps the existing images and reports an error', async () => {
  const withImage = { ...validValues, images: ['mock://product-images/existing'] };
  const result = await addProductImage(withImage, async () => { throw new Error('network error'); });
  assert.equal(typeof result.error, 'string');
  assert.deepEqual(result.values.images, ['mock://product-images/existing']);
});

test('functional update appends uploaded image without overwriting edits made while upload was in flight', async () => {
  let state = { ...validValues, images: ['mock://product-images/old'] };
  let resolveUpload;
  const uploadPromise = new Promise(resolve => { resolveUpload = resolve; });

  const inFlightUpload = uploadProductImage(() => uploadPromise).then(result => {
    if (result.url) {
      state = addProductImage(state, result.url);
    }
  });

  // User edits title and removes the old image while upload is still in progress
  state = {
    ...state,
    name: 'เสื้อยืดลายใหม่ที่เพิ่งแก้',
    images: state.images.filter(img => img !== 'mock://product-images/old'),
  };

  resolveUpload({ url: 'mock://product-images/new' });
  await inFlightUpload;

  assert.equal(state.name, 'เสื้อยืดลายใหม่ที่เพิ่งแก้');
  assert.deepEqual(state.images, ['mock://product-images/new']);
});

test('failed upload updates error only and does not overwrite edits made while upload was in flight', async () => {
  let state = { ...validValues, name: 'ชื่อเดิม' };
  let uploadError = null;
  let rejectUpload;
  const uploadPromise = new Promise((_, reject) => { rejectUpload = reject; });

  const inFlightUpload = uploadProductImage(() => uploadPromise).then(result => {
    if (result.url) {
      state = addProductImage(state, result.url);
    } else {
      uploadError = result.error;
    }
  });

  // User edits name and price while upload is in progress
  state = { ...state, name: 'ชื่อใหม่ระหว่างรออัปโหลด' };

  rejectUpload(new Error('upload failed'));
  await inFlightUpload;

  assert.equal(state.name, 'ชื่อใหม่ระหว่างรออัปโหลด');
  assert.equal(uploadError, 'อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่');
});
