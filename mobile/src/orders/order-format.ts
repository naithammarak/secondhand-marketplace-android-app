import type { CancelReason, OrderStatus, PaymentStatus } from '../services/order-service';

/** ข้อความภาษาไทยของสถานะจาก backend หน้าจอแสดงตามนี้เท่านั้น ไม่คำนวณสถานะเอง */
export const orderStatusLabels: Record<string, string> = {
  WAITING_PAYMENT: 'รอชำระเงิน',
  WAITING_SELLER_SHIP: 'ชำระแล้ว รอผู้ขายจัดส่ง',
  SHIPPING_TO_CENTER: 'กำลังส่งเข้าศูนย์ตรวจ',
  RECEIVED_AT_CENTER: 'ศูนย์รับสินค้าแล้ว',
  INSPECTING: 'กำลังตรวจสินค้า',
  RESULT_NOTIFIED: 'แจ้งผลตรวจแล้ว',
  SHIPPING_TO_BUYER: 'กำลังส่งถึงผู้ซื้อ',
  DELIVERED_PENDING_BUYER: 'ส่งถึงผู้ซื้อแล้ว รอยืนยันรับสินค้า',
  DELIVERY_DISPUTED: 'ผู้ซื้อแจ้งไม่ได้รับสินค้า รอผู้ดูแลตรวจสอบ',
  RETURNED_TO_SELLER: 'ส่งคืนถึงผู้ขายแล้ว รอคืนเงิน',
  COMPLETED: 'สำเร็จ',
  RETURNING_TO_SELLER: 'กำลังส่งคืนผู้ขาย',
  REFUNDED: 'คืนเงินแล้ว',
  RETURNED: 'ส่งคืนแล้ว',
  CANCELLED: 'ยกเลิกแล้ว',
  // สถานะที่แอปรุ่นนี้ยังไม่รู้จัก (backend เพิ่มสถานะหลังการจัดส่งในรอบถัดไป)
  UNKNOWN: 'สถานะอื่น ๆ กรุณาอัปเดตแอปเพื่อดูรายละเอียด',
};

/** ใช้ตัวนี้เสมอแทนการอ่าน orderStatusLabels ตรง ๆ เพื่อไม่ให้หน้าจอว่างเมื่อเจอสถานะใหม่ */
export function orderStatusLabel(status: OrderStatus | string | null | undefined): string {
  if (!status) return orderStatusLabels.UNKNOWN;
  return orderStatusLabels[status] ?? orderStatusLabels.UNKNOWN;
}

/** ใช้ได้ทั้งมุมมองผู้ซื้อและผู้ขาย จึงไม่เขียนว่า "คุณ" */
export const cancelReasonLabels: Record<CancelReason, string> = {
  BUYER: 'ผู้ซื้อยกเลิกคำสั่งซื้อนี้',
  EXPIRED: 'หมดเวลาชำระเงิน ระบบยกเลิกให้อัตโนมัติ',
};

export const paymentStatusLabels: Record<PaymentStatus, string> = {
  UNPAID: 'ยังไม่ชำระ',
  PAID: 'ชำระแล้ว',
  REFUNDED: 'คืนเงินแล้ว',
};

/**
 * จัดรูปแบบเงินจาก string ของ backend ("1234.50") เป็น "฿1,234.50"
 * ทำงานกับตัวอักษรล้วน ๆ จึงไม่ผ่าน number และไม่มีความคลาดเคลื่อนของทศนิยม
 */
export function formatBaht(amount: string | null | undefined): string {
  if (!amount) return '-';
  const match = /^(-?)(\d+)\.(\d{2})$/.exec(amount);
  if (!match) return '-';
  const [, sign, whole, fraction] = match;
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}฿${grouped}.${fraction}`;
}

/**
 * เวลาที่เหลือก่อนหมดเวลาชำระ ในรูป "นาที:วินาที"
 * คืน null เมื่อไม่มีเส้นตาย อ่านค่าไม่ได้ หรือเลยเวลาไปแล้ว — หน้าจอจะได้ไม่แสดงเวลาติดลบ
 *
 * ปัดขึ้น: เศษวินาทีสุดท้ายยังต้องแสดง "0:01" ไม่ใช่หายไปเฉย ๆ ก่อนถึงเส้นตายจริงเกือบ 1 วินาที
 * และ **ห้ามใช้ค่า null จากฟังก์ชันนี้เป็นตัวตัดสินว่าหมดเวลาแล้ว** ให้เทียบเวลาดิบกับนาฬิกาแทน
 */
export function formatRemaining(expiresAt: string | null | undefined, now: number): string | null {
  const deadline = deadlineAt(expiresAt);
  if (deadline === null) return null;
  const seconds = Math.ceil((deadline - now) / 1000);
  if (seconds <= 0) return null;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** เวลาเส้นตายเป็นตัวเลข คืน null เมื่อไม่มีหรืออ่านไม่ได้ */
export function deadlineAt(expiresAt: string | null | undefined): number | null {
  if (!expiresAt) return null;
  const deadline = new Date(expiresAt).getTime();
  return Number.isNaN(deadline) ? null : deadline;
}

export function formatDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString('th-TH');
}

/** Remaining time "2 วัน 03:04:05" from a server deadline. Null when missing/invalid/passed. */
export function formatLongRemaining(deadline: string | null | undefined, now: number): string | null {
  if (!deadline) return null;
  const at = new Date(deadline).getTime();
  if (Number.isNaN(at)) return null;
  const total = Math.ceil((at - now) / 1000);
  if (total <= 0) return null;
  const days = Math.floor(total / 86400);
  const rest = total % 86400;
  const clock = [Math.floor(rest / 3600), Math.floor((rest % 3600) / 60), rest % 60].map(part => String(part).padStart(2, '0')).join(':');
  return days > 0 ? `${days} วัน ${clock}` : clock;
}

/** Count Unicode code points the same way the server's length checks do. */
export function textLength(value: string): number {
  return [...value.trim()].length;
}
