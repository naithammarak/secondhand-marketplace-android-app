import type { CancelReason, OrderStatus, PaymentStatus } from '../services/order-service';

/** ข้อความภาษาไทยของสถานะจาก backend หน้าจอแสดงตามนี้เท่านั้น ไม่คำนวณสถานะเอง */
export const orderStatusLabels: Record<OrderStatus, string> = {
  WAITING_PAYMENT: 'รอชำระเงิน',
  WAITING_SELLER_SHIP: 'ชำระแล้ว รอผู้ขายจัดส่ง',
  CANCELLED: 'ยกเลิกแล้ว',
};

/** ใช้ได้ทั้งมุมมองผู้ซื้อและผู้ขาย จึงไม่เขียนว่า "คุณ" */
export const cancelReasonLabels: Record<CancelReason, string> = {
  BUYER: 'ผู้ซื้อยกเลิกคำสั่งซื้อนี้',
  EXPIRED: 'หมดเวลาชำระเงิน ระบบยกเลิกให้อัตโนมัติ',
};

export const paymentStatusLabels: Record<PaymentStatus, string> = {
  UNPAID: 'ยังไม่ชำระ',
  PAID: 'ชำระแล้ว',
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
 */
export function formatRemaining(expiresAt: string | null | undefined, now: number): string | null {
  if (!expiresAt) return null;
  const deadline = new Date(expiresAt).getTime();
  if (Number.isNaN(deadline)) return null;
  const seconds = Math.floor((deadline - now) / 1000);
  if (seconds <= 0) return null;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function formatDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString('th-TH');
}
