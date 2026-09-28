import { act, renderHook, waitFor } from '@testing-library/react-native';
import { productCatalogService, productCatalogStore } from '@/products/product-catalog-instance';
import {
  clearProductImageCache,
  getCachedProductImage,
  useProductImage,
} from '@/hooks/use-product-image';

jest.mock('@/products/product-catalog-instance', () => ({
  productCatalogService: { getProduct: jest.fn() },
  productCatalogStore: { getSnapshot: jest.fn(() => ({ items: [] })) },
}));

const getProduct = productCatalogService.getProduct as jest.Mock;
const getSnapshot = productCatalogStore.getSnapshot as jest.Mock;

describe('useProductImage', () => {
  beforeEach(() => {
    clearProductImageCache();
    jest.clearAllMocks();
    getSnapshot.mockReturnValue({ items: [] });
  });

  test('returns an explicit image immediately and caches it', async () => {
    const url = 'https://images.example.test/product.jpg';
    const { result } = renderHook(() => useProductImage(7, url));

    expect(result.current).toBe(url);
    await waitFor(() => expect(getCachedProductImage(7)).toBe(url));
    expect(getProduct).not.toHaveBeenCalled();
  });

  test('loads and caches the main image from product detail', async () => {
    getProduct.mockResolvedValue({
      images: [
        { photoType: 'GALLERY', imageUrl: 'https://images.example.test/gallery.jpg' },
        { photoType: 'MAIN', imageUrl: 'https://images.example.test/main.jpg' },
      ],
    });

    const { result } = renderHook(() => useProductImage(8));

    await waitFor(() => expect(result.current).toBe('https://images.example.test/main.jpg'));
    expect(getCachedProductImage(8)).toBe('https://images.example.test/main.jpg');
    expect(getProduct).toHaveBeenCalledWith(8);
  });

  test('uses the catalog snapshot without making a detail request', () => {
    getSnapshot.mockReturnValue({
      items: [{ id: 9, mainImage: { imageUrl: 'https://images.example.test/catalog.jpg' } }],
    });

    const { result } = renderHook(() => useProductImage(9));

    expect(result.current).toBe('https://images.example.test/catalog.jpg');
    expect(getProduct).not.toHaveBeenCalled();
  });

  test('does not show the previous product image after switching IDs', async () => {
    getProduct.mockResolvedValueOnce({
      images: [{ photoType: 'MAIN', imageUrl: 'https://images.example.test/first.jpg' }],
    });
    getProduct.mockReturnValueOnce(new Promise(() => undefined));

    const { result, rerender } = renderHook(({ id }: { id: number }) => useProductImage(id), {
      initialProps: { id: 10 },
    });
    await waitFor(() => expect(result.current).toBe('https://images.example.test/first.jpg'));

    await act(async () => {
      rerender({ id: 11 });
    });
    expect(result.current).toBeNull();
  });
});
