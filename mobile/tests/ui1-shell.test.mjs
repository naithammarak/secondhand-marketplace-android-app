import test from 'node:test';
import assert from 'node:assert/strict';
import { describeActionError } from '../src/orders/action-errors.ts';
import { formatLongRemaining, textLength } from '../src/orders/order-format.ts';
import { OrderServiceError } from '../src/services/order-service.ts';

test('409 business codes ask for a refetch, never a local success', () => {
  const failure = describeActionError({ status: 409, code: 'result_decision_deadline_passed', fields: {} });
  assert.equal(failure.next, 'refetch');
  assert.match(failure.message, /หมดเวลาตัดสินผลตรวจ/);
});

test('network and timeout keep the same attempt for retry', () => {
  assert.equal(describeActionError(new OrderServiceError('timeout')).next, 'retry-same');
  assert.equal(describeActionError(new OrderServiceError('network-error')).next, 'retry-same');
  assert.equal(describeActionError({ status: 0, code: 'network_error' }).next, 'retry-same');
  assert.equal(describeActionError(new Error('boom')).next, 'retry-same');
});

test('401, 403, 404 and 422 map to their server-driven actions', () => {
  assert.equal(describeActionError(new OrderServiceError('unauthorized')).next, 'relogin');
  assert.equal(describeActionError({ status: 403, code: 'fulfillment_simulation_disabled' }).next, 'none');
  assert.match(describeActionError({ status: 403, code: 'fulfillment_simulation_disabled' }).message, /จำลอง/);
  assert.equal(describeActionError(new OrderServiceError('not-found')).next, 'none');
  const invalid = describeActionError(new OrderServiceError('validation-error', { fields: { reason: 'too short' } }));
  assert.equal(invalid.next, 'fix-input');
  assert.deepEqual(invalid.fields, { reason: 'too short' });
});

test('long countdown is informative and stops at the server deadline', () => {
  const now = Date.parse('2026-10-05T10:00:00Z');
  assert.equal(formatLongRemaining('2026-10-08T11:02:03Z', now), '3 วัน 01:02:03');
  assert.equal(formatLongRemaining('2026-10-05T10:00:01Z', now), '00:00:01');
  assert.equal(formatLongRemaining('2026-10-05T10:00:00Z', now), null);
  assert.equal(formatLongRemaining('not-a-date', now), null);
  assert.equal(formatLongRemaining(null, now), null);
});

test('text length counts trimmed code points like the server', () => {
  assert.equal(textLength('  ไม่ได้รับ  '), 9);
  assert.equal(textLength('😀'.repeat(3)), 3);
});
