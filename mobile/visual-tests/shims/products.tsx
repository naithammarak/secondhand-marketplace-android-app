export * from '../../src/services/product-service';
import { ProductServiceError } from '../../src/services/product-service';
import { product, photos } from './catalog';
const disabled = async () => { throw new ProductServiceError('unavailable', 'QA fixture: ไม่ส่งข้อมูลไปยังระบบจริง'); };
export function createProductService() {
  return {
    getCategories: async () => [{ id: 1, name: 'เสื้อผ้า' }, { id: 2, name: 'รองเท้า' }],
    getBrands: async () => [{ id: 1, name: 'ไม่ระบุแบรนด์' }],
    getMyProducts: async () => ({ items: [{ id: '7', name: product.productName, price: product.price, status: 'AVAILABLE', mainImageUrl: photos[0] }], hasNext: false }),
    getProduct: async () => ({ id: '7', name: product.productName, price: product.price, description: product.description, size: 'M', condition: 'GOOD', category: 'เสื้อผ้า', categoryId: 1, brand: 'ไม่ระบุแบรนด์', brandId: 1, images: photos.slice(0, 2), saleType: 'FIXED_PRICE', status: 'AVAILABLE' }),
    createProduct: disabled, updateProduct: disabled, cancelProduct: disabled,
  };
}
