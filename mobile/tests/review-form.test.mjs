import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_REJECT_REASON_LENGTH,
  MIN_REJECT_REASON_LENGTH,
  reasonErrorFromApi,
  validateRejectReason,
} from '../src/admin/review-form.ts';

test('an empty reason is refused', () => {
  assert.equal(validateRejectReason(''), 'กรุณากรอกเหตุผลที่ปฏิเสธ');
  assert.equal(validateRejectReason('     '), 'กรุณากรอกเหตุผลที่ปฏิเสธ');
  assert.equal(validateRejectReason('\n\t'), 'กรุณากรอกเหตุผลที่ปฏิเสธ');
});

test('a reason shorter than the minimum is refused', () => {
  const reason = 'ก'.repeat(MIN_REJECT_REASON_LENGTH - 1);
  assert.ok(validateRejectReason(reason)?.includes(String(MIN_REJECT_REASON_LENGTH)));
});

test('a reason longer than the column is refused', () => {
  assert.ok(validateRejectReason('ก'.repeat(MAX_REJECT_REASON_LENGTH + 1)));
  assert.equal(validateRejectReason('ก'.repeat(MAX_REJECT_REASON_LENGTH)), undefined);
});

test('a usable reason passes', () => {
  assert.equal(validateRejectReason('รูปบัตรไม่ชัด'), undefined);
  assert.equal(validateRejectReason('  รูปบัตรไม่ชัด  '), undefined);
});

test('the backend field error is mapped back to the reason input', () => {
  assert.equal(
    reasonErrorFromApi({ reject_reason: 'กรุณากรอกเหตุผลที่ปฏิเสธ' }),
    'กรุณากรอกเหตุผลที่ปฏิเสธ',
  );
  assert.equal(reasonErrorFromApi({}), undefined);
  assert.equal(reasonErrorFromApi({ other_field: 'ไม่เกี่ยวกับช่องนี้' }), undefined);
});
