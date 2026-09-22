/**
 * PRODUCT-07: instance กลางของ Product Catalog (service + store) — สร้างครั้งเดียวระดับ module
 * หน้ารายการและปุ่ม "กลับรายการ" ในหน้ารายละเอียดต้องใช้ store ตัวเดียวกันนี้เท่านั้น
 * เพื่อรักษาคำค้น/ตำแหน่งรายการ และให้ refresh() จากหน้ารายละเอียดมีผลกับรายการที่แสดงจริง
 */
import { createProductCatalogService } from '../services/product-catalog-service.ts';
import { createProductCatalogStore } from './product-catalog-store.ts';

export const productCatalogService = createProductCatalogService({
  baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
});
export const productCatalogStore = createProductCatalogStore({ service: productCatalogService });
