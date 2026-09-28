import { renderHook, waitFor } from '@testing-library/react-native';
import { useProductBrand, clearProductBrandCache, setCachedProductBrand } from '@/hooks/use-product-brand';
import { productCatalogService } from '@/products/product-catalog-instance';
import type { ProductListItem } from '@/services/product-catalog-service';

jest.mock('@/products/product-catalog-instance', () => ({
  productCatalogService: {
    getProduct: jest.fn(),
  },
}));

describe('useProductBrand', () => {
  beforeEach(() => {
    clearProductBrandCache();
    jest.clearAllMocks();
  });

  test('returns explicit brandName if item.brand is provided', () => {
    const item: ProductListItem = {
      id: 1,
      productName: 'เสื้อเชิ้ต',
      price: '100.00',
      condition: 'GOOD',
      status: 'AVAILABLE',
      mainImage: null,
      brand: { id: 2, brandName: 'Nike' },
    };

    const { result } = renderHook(() => useProductBrand(item));
    expect(result.current).toBe('Nike');
    expect(productCatalogService.getProduct).not.toHaveBeenCalled();
  });

  test('returns cached brand immediately if previously cached', () => {
    setCachedProductBrand(42, 'Zara');
    const item: ProductListItem = {
      id: 42,
      productName: 'กางเกงยีนส์',
      price: '500.00',
      condition: 'GOOD',
      status: 'AVAILABLE',
      mainImage: null,
    };

    const { result } = renderHook(() => useProductBrand(item));
    expect(result.current).toBe('Zara');
    expect(productCatalogService.getProduct).not.toHaveBeenCalled();
  });

  test('fetches brand from productCatalogService when brand is missing and caches it', async () => {
    (productCatalogService.getProduct as jest.Mock).mockResolvedValue({
      id: 99,
      productName: 'กระเป๋า',
      brand: { id: 3, brandName: 'Adidas' },
    });

    const item: ProductListItem = {
      id: 99,
      productName: 'กระเป๋า',
      price: '300.00',
      condition: 'GOOD',
      status: 'AVAILABLE',
      mainImage: null,
    };

    const { result } = renderHook(() => useProductBrand(item));

    await waitFor(() => {
      expect(result.current).toBe('Adidas');
    });

    expect(productCatalogService.getProduct).toHaveBeenCalledWith(99);
  });

  test('falls back to "ไม่ระบุแบรนด์" when getProduct fails or has no brand', async () => {
    (productCatalogService.getProduct as jest.Mock).mockRejectedValue(new Error('Network error'));

    const item: ProductListItem = {
      id: 100,
      productName: 'ของเล่น',
      price: '50.00',
      condition: 'GOOD',
      status: 'AVAILABLE',
      mainImage: null,
    };

    const { result } = renderHook(() => useProductBrand(item));
    expect(result.current).toBe('ไม่ระบุแบรนด์');
  });
});
