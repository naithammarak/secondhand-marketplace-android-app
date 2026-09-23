import type { OrderStatus, PaymentStatus } from '../services/order-service';

/** ข้อความภาษาไทยของสถานะจาก backend หน้าจอแสดงตามนี้เท่านั้น ไม่คำนวณสถานะเอง */
export const orderStatusLabels: Record<OrderStatus, string> = {
  WAITING_PAYMENT: 'รอชำระเงิน',
  WAITING_SELLER_SHIP: 'ชำระแล้ว รอผู้ขายจัดส่ง',
  SHIPPING_TO_CENTER: 'กำลังส่งเข้าศูนย์ตรวจ',
  RECEIVED_AT_CENTER: 'ศูนย์ตรวจรับสินค้าแล้ว',
  INSPECTING: 'กำลังตรวจสอบสินค้า',
  RESULT_NOTIFIED: 'แจ้งผลตรวจแล้ว',
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

export function formatDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString('th-TH');
}
