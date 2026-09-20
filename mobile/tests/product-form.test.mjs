import test from 'node:test';
import assert from 'node:assert/strict';
import { addProductImage, emptyProductFormValues, validateProductForm } from '../src/products/product-form.ts';

const validValues = { ...emptyProductFormValues, name: 'เสื้อยืด' };

test('an empty name is rejected', () => {
  const errors = validateProductForm(emptyProductFormValues, '100');
  assert.equal(errors.name, 'กรุณากรอกชื่อสินค้า');
});

test('a whitespace-only name is rejected', () => {
  const errors = validateProductForm({ ...validValues, name: '   ' }, '100');
  assert.equal(errors.name, 'กรุณากรอกชื่อสินค้า');
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

test('a valid form reports both fields missing together', () => {
  const errors = validateProductForm(emptyProductFormValues, '');
  assert.equal(typeof errors.name, 'string');
  assert.equal(typeof errors.price, 'string');
});

test('a successful upload appends the new image url', async () => {
  const result = await addProductImage(validValues, async () => ({ url: 'mock://product-images/abc' }));
  assert.equal(result.error, null);
  assert.deepEqual(result.values.images, ['mock://product-images/abc']);
});

test('a failed upload keeps the existing images and reports an error', async () => {
  const withImage = { ...validValues, images: ['mock://product-images/existing'] };
  const result = await addProductImage(withImage, async () => { throw new Error('network error'); });
  assert.equal(typeof result.error, 'string');
  assert.deepEqual(result.values.images, ['mock://product-images/existing']);
});
