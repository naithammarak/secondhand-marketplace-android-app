import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyVerificationForm,
  mapApiFieldErrors,
  toVerificationInput,
  validateVerificationForm,
} from '../src/verification/verification-form.ts';

const idCard = { uri: 'file:///card.png', name: 'card.png', type: 'image/png', size: 1024 };
const validForm = {
  bankName: 'ธนาคารทดสอบ',
  bankAccountName: 'ผู้ขาย ทดสอบ',
  bankAccountNumber: '123-4-56789-0',
  idCard,
};

test('an empty form reports every required field', () => {
  const errors = validateVerificationForm(emptyVerificationForm);
  assert.deepEqual(Object.keys(errors).sort(),
    ['bankAccountName', 'bankAccountNumber', 'bankName', 'idCard']);
  assert.equal(errors.bankName, 'กรุณากรอกชื่อธนาคาร');
});

test('a complete form has no errors and normalises the account number', () => {
  assert.deepEqual(validateVerificationForm(validForm), {});
  assert.deepEqual(toVerificationInput(validForm), {
    bankName: 'ธนาคารทดสอบ',
    bankAccountName: 'ผู้ขาย ทดสอบ',
    bankAccountNumber: '1234567890',
    idCard,
  });
});

test('whitespace only values are rejected per field', () => {
  const errors = validateVerificationForm({ ...validForm, bankName: '   ', bankAccountName: ' ' });
  assert.equal(errors.bankName, 'กรุณากรอกชื่อธนาคาร');
  assert.equal(errors.bankAccountName, 'กรุณากรอกชื่อบัญชี');
  assert.equal(errors.bankAccountNumber, undefined);
});

for (const [value, reason] of [
  ['12345', 'สั้นเกินไป'],
  ['1234567890123456', 'ยาวเกินไป'],
  ['12345abcde', 'มีตัวอักษร'],
]) {
  test(`account number "${value}" is rejected because it is ${reason}`, () => {
    const errors = validateVerificationForm({ ...validForm, bankAccountNumber: value });
    assert.equal(typeof errors.bankAccountNumber, 'string');
    assert.equal(errors.bankName, undefined);
  });
}

test('only image types the backend accepts are allowed', () => {
  const pdf = validateVerificationForm({ ...validForm, idCard: { ...idCard, type: 'application/pdf' } });
  assert.equal(pdf.idCard, 'รองรับเฉพาะไฟล์ JPG, PNG หรือ WEBP');
  const jpeg = validateVerificationForm({ ...validForm, idCard: { ...idCard, type: 'image/jpeg' } });
  assert.equal(jpeg.idCard, undefined);
});

test('an oversized image is caught before it is uploaded', () => {
  const errors = validateVerificationForm({
    ...validForm,
    idCard: { ...idCard, size: 5 * 1024 * 1024 + 1 },
  });
  assert.equal(errors.idCard, 'ไฟล์รูปต้องมีขนาดไม่เกิน 5 MB');
});

test('an image without a known size is left for the backend to check', () => {
  const { size: _size, ...withoutSize } = idCard;
  assert.deepEqual(validateVerificationForm({ ...validForm, idCard: withoutSize }), {});
});

test('backend field errors are mapped onto form fields and unknown names dropped', () => {
  assert.deepEqual(mapApiFieldErrors({
    bank_name: 'กรุณากรอกชื่อธนาคาร',
    bank_account_number: 'เลขที่บัญชีต้องมี 10-15 หลัก',
    id_card_image: 'ไฟล์รูปไม่ถูกต้อง',
    surprise_field: 'ไม่ควรแสดง',
  }), {
    bankName: 'กรุณากรอกชื่อธนาคาร',
    bankAccountNumber: 'เลขที่บัญชีต้องมี 10-15 หลัก',
    idCard: 'ไฟล์รูปไม่ถูกต้อง',
  });
});

test('a form without an attached image cannot be turned into a request', () => {
  assert.equal(toVerificationInput(emptyVerificationForm), null);
});
