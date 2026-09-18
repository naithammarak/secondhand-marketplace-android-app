/** กติกาของช่องเหตุผลที่ปฏิเสธ ใช้ร่วมกันทั้งหน้าจอและ store */

export const MIN_REJECT_REASON_LENGTH = 5;
export const MAX_REJECT_REASON_LENGTH = 500;

/** ชื่อช่องที่ backend ใช้ เพื่อจับคู่ข้อผิดพลาดรายช่องกลับมาที่ฟอร์ม */
const REASON_API_NAMES = ['reject_reason'];

export function validateRejectReason(value: string): string | undefined {
  const reason = value.trim();
  if (!reason) return 'กรุณากรอกเหตุผลที่ปฏิเสธ';
  if (reason.length < MIN_REJECT_REASON_LENGTH) {
    return `เหตุผลต้องมีอย่างน้อย ${MIN_REJECT_REASON_LENGTH} ตัวอักษร`;
  }
  if (reason.length > MAX_REJECT_REASON_LENGTH) {
    return `เหตุผลยาวเกิน ${MAX_REJECT_REASON_LENGTH} ตัวอักษร`;
  }
  return undefined;
}

export function reasonErrorFromApi(fields: Record<string, string>): string | undefined {
  for (const apiName of REASON_API_NAMES) {
    if (fields[apiName]) return fields[apiName];
  }
  return undefined;
}
