/**
 * PRODUCT-07: instance กลางของ Product Catalog (service + store) — สร้างครั้งเดียวระดับ module
 * หน้ารายการและปุ่ม "กลับรายการ" ในหน้ารายละเอียดต้องใช้ store ตัวเดียวกันนี้เท่านั้น
 * เพื่อรักษาคำค้น/ตำแหน่งรายการ และให้ refresh() จากหน้ารายละเอียดมีผลกับรายการที่แสดงจริง
 *
 * หมายเหตุ (Blocker PR #84):
 * ปัจจุบัน backend code จาก PR #84 (PRODUCT-05) ยังไม่ได้ merge เข้า main
 * ทำให้ server บน main ยังไม่มี GET /products และ GET /products/{id} (ได้ 404)
 * เพื่อไม่ให้กระทบ dev environment ที่มี EXPO_PUBLIC_API_BASE_URL ใน .env จึงให้ใช้ mock เป็นค่าเริ่มต้น
 * เมื่อต้องการเชื่อมต่อ backend จริง (หลังจากนำ PR #84 เข้า main แล้ว) ให้กำหนด EXPO_PUBLIC_USE_PRODUCT_API=true
 */
import { createProductCatalogService } from '../services/product-catalog-service.ts';
import { createProductCatalogStore } from './product-catalog-store.ts';

const useRealBackend = process.env.EXPO_PUBLIC_USE_PRODUCT_API === 'true';

export const productCatalogService = createProductCatalogService(
  useRealBackend && process.env.EXPO_PUBLIC_API_BASE_URL
    ? { baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL }
    : undefined,
);
export const productCatalogStore = createProductCatalogStore({ service: productCatalogService });
