/**
 * One presentation model for failed reads/commands across Order, inspection and
 * shipping clients. It decides only what the screen offers next; the server state
 * after a refetch is always the authority.
 *
 * - retry-same:  outcome unknown (network/timeout/5xx). Retry must reuse the same
 *                Idempotency-Key, and the screen refetches persisted state first.
 * - refetch:     409 — state moved on (deadline passed, already decided, invalid state).
 * - relogin:     401 — session expired or switched account.
 * - fix-input:   422 — keep what the user typed and show field messages.
 * - none:        403/404/disabled simulation — action is not available for this account.
 */
export type ActionNext = 'retry-same' | 'refetch' | 'relogin' | 'fix-input' | 'none';
export type ActionFailure = { status: number; code: string | null; next: ActionNext; message: string; fields: Record<string, string> };

const KIND_STATUS: Record<string, number> = {
  unauthorized: 401, forbidden: 403, 'not-found': 404, conflict: 409, 'validation-error': 422,
  'network-error': 0, timeout: 0, 'server-error': 500, unavailable: 503,
};

/** Business codes from the accepted API mapping and existing Order/Profile contracts. */
export const actionCodeMessages: Record<string, string> = {
  result_decision_deadline_passed: 'หมดเวลาตัดสินผลตรวจแล้ว ระบบจะดำเนินการส่งคืนผู้ขาย',
  decision_already_recorded: 'มีการบันทึกคำตัดสินผลตรวจไว้แล้ว ระบบแสดงสถานะล่าสุดให้',
  decision_not_allowed: 'รายการนี้ไม่เปิดให้ตัดสินผลตรวจ',
  inspection_not_ready: 'ผลตรวจยังไม่พร้อม กรุณาโหลดใหม่ภายหลัง',
  receipt_deadline_passed: 'เลยเวลายืนยันรับหรือแจ้งไม่ได้รับสินค้าแล้ว ระบบแสดงสถานะล่าสุดให้',
  delivery_already_recorded: 'มีการบันทึกการรับสินค้าไว้แล้ว',
  return_address_locked: 'เริ่มจัดส่งแล้ว ที่อยู่รับคืนถูกล็อกและแก้ไขไม่ได้',
  return_address_required: 'กรุณาบันทึกที่อยู่รับคืนก่อนแจ้งส่งสินค้าเข้าศูนย์',
  seller_role_required: 'เฉพาะผู้ขายของคำสั่งซื้อนี้เท่านั้น',
  account_inactive: 'บัญชีนี้ไม่ได้อยู่ในสถานะใช้งาน จึงทำรายการไม่ได้',
  invalid_state: 'สถานะคำสั่งซื้อเปลี่ยนไปแล้ว ระบบแสดงสถานะล่าสุดให้',
  idempotency_key_reused: 'คำขอนี้ไม่ตรงกับคำขอเดิม ระบบแสดงสถานะล่าสุดให้',
  fulfillment_simulation_disabled: 'ระบบจัดส่งจำลองปิดอยู่ในสภาพแวดล้อมนี้',
  payment_simulation_disabled: 'ระบบชำระเงินจำลองปิดอยู่ในสภาพแวดล้อมนี้',
  legacy_courier_only: 'คำสั่งซื้อรุ่นเดิมใช้ขั้นตอนผู้ขนส่งแบบเดิม',
  order_not_reviewable: 'คำสั่งซื้อนี้ยังรีวิวไม่ได้',
  review_already_exists: 'คุณรีวิวคำสั่งซื้อนี้แล้ว',
  storage_unavailable: 'บริการเก็บไฟล์ยังไม่พร้อม กรุณาลองใหม่',
  timeout: 'ยังไม่ได้รับคำตอบจากระบบ ระบบจะตรวจสถานะล่าสุดก่อนให้ลองคำขอเดิมอีกครั้ง',
  network_error: 'เชื่อมต่อระบบไม่ได้ ระบบจะตรวจสถานะล่าสุดก่อนให้ลองคำขอเดิมอีกครั้ง',
};

const STATUS_MESSAGES: Record<number, string> = {
  0: 'เชื่อมต่อระบบไม่ได้หรือไม่ได้รับคำตอบ ระบบจะตรวจสถานะล่าสุดก่อนให้ลองคำขอเดิมอีกครั้ง',
  401: 'เซสชันหมดอายุหรือบัญชีเปลี่ยนไป กรุณาเข้าสู่ระบบอีกครั้ง',
  403: 'บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้ หรือบริการนี้ปิดอยู่',
  404: 'ไม่พบรายการ หรือบัญชีนี้ไม่มีสิทธิ์เข้าถึง',
  409: 'สถานะรายการเปลี่ยนแล้ว ระบบแสดงสถานะล่าสุดให้',
  422: 'กรุณาตรวจสอบข้อมูลที่กรอก',
  503: 'บริการยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง',
};

function nextFor(status: number): ActionNext {
  if (status === 401) return 'relogin';
  if (status === 409) return 'refetch';
  if (status === 422) return 'fix-input';
  if (status === 403 || status === 404) return 'none';
  return 'retry-same';
}

function readFailure(error: unknown): { status: number; code: string | null; fields: Record<string, string> } {
  if (typeof error !== 'object' || error === null) return { status: 0, code: null, fields: {} };
  const value = error as Record<string, unknown>;
  const fields = typeof value.fields === 'object' && value.fields !== null ? value.fields as Record<string, string> : {};
  const code = typeof value.code === 'string' ? value.code : null;
  if (typeof value.status === 'number') return { status: value.status, code, fields };
  if (typeof value.kind === 'string' && value.kind in KIND_STATUS) {
    return { status: KIND_STATUS[value.kind], code: code ?? (value.kind === 'timeout' ? 'timeout' : null), fields };
  }
  return { status: 0, code, fields };
}

/** Normalize any client error (OrderServiceError, InspectionServiceError, or a {status, code} DTO error). */
export function describeActionError(error: unknown): ActionFailure {
  const { status, code, fields } = readFailure(error);
  const message = (code && actionCodeMessages[code]) || STATUS_MESSAGES[status] || STATUS_MESSAGES[503];
  return { status, code, next: nextFor(status), message, fields };
}
