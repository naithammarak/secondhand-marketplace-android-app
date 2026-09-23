/**
 * PRODUCT-07: instance กลางของ Product Catalog (service + store) — สร้างครั้งเดียวระดับ module
 * หน้ารายการและปุ่ม "กลับรายการ" ในหน้ารายละเอียดต้องใช้ store ตัวเดียวกันนี้เท่านั้น
 * เพื่อรักษาคำค้น/ตำแหน่งรายการ และให้ refresh() จากหน้ารายละเอียดมีผลกับรายการที่แสดงจริง
 *
 * เลือก mock ได้เฉพาะเมื่อตั้ง EXPO_PUBLIC_PRODUCT_CATALOG_MODE=mock อย่างชัดเจน
 * หากตั้ง API URL จะใช้ API โดยปริยาย; ถ้า URL หายหรือไม่ถูกต้อง service จะแจ้ง unavailable
 */
import { createProductCatalogService } from '../services/product-catalog-service.ts';
import { resolveProductCatalogServiceOptions } from './product-catalog-config.ts';
import { createProductCatalogStore } from './product-catalog-store.ts';

export const productCatalogService = createProductCatalogService(
  resolveProductCatalogServiceOptions({
    mode: process.env.EXPO_PUBLIC_PRODUCT_CATALOG_MODE,
    baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
    // Release bundles must never display the development catalog, even outside EAS profiles.
    buildEnvironment: __DEV__ ? process.env.EXPO_PUBLIC_PRODUCT_CATALOG_ENV : 'production',
  }),
);
export const productCatalogStore = createProductCatalogStore({ service: productCatalogService });
