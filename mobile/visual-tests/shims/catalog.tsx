import { createProductCatalogStore } from '../../src/products/product-catalog-store';
import type { ProductDetail } from '../../src/services/product-catalog-service';
// Local, original vector artwork. Fixture-only, never real inventory.
const art = (color: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="400" viewBox="0 0 480 400"><rect width="480" height="400" fill="#e7e3d9"/><ellipse cx="240" cy="345" rx="134" ry="18" fill="#d2ccbf"/><path d="M175 70 L115 98 L58 195 L128 232 L153 192 L148 333 L330 333 L323 192 L350 232 L420 195 L360 98 L298 70 Q240 110 175 70" fill="${color}"/><path d="M176 70 Q240 155 298 70" stroke="#faf6ee" stroke-width="10" fill="none"/><path d="M180 172 L288 172 M180 190 L260 190" stroke="#faf6ee" stroke-width="9" opacity=".6"/></svg>`)}`;
export const photos = ['#3a7168', '#bd8063', '#47637b', '#8a7d63'].map(art);
export const product: ProductDetail = { id: 7, productName: 'เสื้อคอตตอนทรงคลาสสิก สีเขียวมรกต ใส่สบายสำหรับวันพักผ่อน', description: 'เสื้อตัวโปรดที่ดูแลอย่างดี ผ้านุ่ม ระบายอากาศดี มีรอยใช้งานเล็กน้อยบริเวณชายเสื้อ โปรดดูรูปและรายละเอียดก่อนสั่งซื้อ', price: '590.00', size: 'M', condition: 'GOOD', status: 'AVAILABLE', saleType: 'FIXED_PRICE', categoryId: 1, category: { id: 1, categoryName: 'เสื้อผ้า', parentCategoryId: null }, brandId: 1, brand: { id: 1, brandName: 'ไม่ระบุแบรนด์' }, seller: { displayName: 'วนกลับมารัก · ร้านตัวอย่าง QA', verified: true }, images: photos.slice(0, 2).map((imageUrl, i) => ({ imageId: i+1, imageUrl, urlExpiresAt: null, fileSize: 1000, uploadedAt: null, sortOrder: i, photoType: i === 0 ? 'MAIN' : 'GALLERY' })), createdAt: null, updatedAt: null };
export const productCatalogService = {
  async getProduct() { return product; },
  async getCategories() { return [product.category, { id: 2, categoryName: 'รองเท้า', parentCategoryId: null }, { id: 3, categoryName: 'กระเป๋า', parentCategoryId: null }]; },
  async listProducts({ q: query }: { q?: string } = {}) {
    const items = photos.map((imageUrl, i) => ({ ...product, id: 7+i, productName: i === 0 ? product.productName : ['เสื้อวินเทจโทนอุ่น', 'เสื้อยืดสีน้ำเงิน เนื้อผ้านุ่ม', 'เสื้อสีธรรมชาติ สภาพเหมือนใหม่'][i-1], mainImage: { imageUrl, imageId: i+1, urlExpiresAt: null } })).filter(item => !query || item.productName.includes(query));
    return { items, meta: { page: 1, pageSize: 20, total: items.length, totalPages: 1, hasNext: false } };
  },
};
export const productCatalogStore = createProductCatalogStore({ service: productCatalogService });
