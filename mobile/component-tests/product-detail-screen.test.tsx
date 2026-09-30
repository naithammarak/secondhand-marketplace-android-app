import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ProductDetailScreen } from '@/components/product-detail-screen';
import { ProductCatalogError, type ProductDetail } from '@/services/product-catalog-service';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockCanGoBack = true;
let mockRouteId = '101';

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
  router: {
    back: () => mockBack(),
    push: (...args: unknown[]) => mockPush(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
    canGoBack: () => mockCanGoBack,
  },
  useLocalSearchParams: () => ({ id: mockRouteId }),
}));

const mockGetProduct = jest.fn();
const mockRefresh = jest.fn().mockResolvedValue(undefined);

jest.mock('@/products/product-catalog-instance', () => ({
  productCatalogService: {
    getProduct: (id: number, signal?: AbortSignal) => mockGetProduct(id, signal),
  },
  productCatalogStore: {
    refresh: () => mockRefresh(),
  },
}));

const sampleProduct: ProductDetail = {
  id: 101,
  productName: 'เสื้อเชิ้ตสีฟ้า',
  description: 'เสื้อเชิ้ตมือสองสภาพดี ใส่ไม่กี่ครั้ง',
  price: '1290.00',
  categoryId: 1,
  category: { id: 1, categoryName: 'เสื้อผ้า', parentCategoryId: null },
  brandId: 1,
  brand: { id: 1, brandName: 'ไม่ระบุแบรนด์' },
  size: 'M',
  condition: 'GOOD',
  saleType: 'FIXED_PRICE',
  status: 'AVAILABLE',
  images: [
    {
      imageId: 801,
      imageUrl: 'https://storage.example.com/801.jpg',
      urlExpiresAt: null,
      fileSize: 120000,
      uploadedAt: '2026-09-18T10:00:00Z',
      sortOrder: 0,
      photoType: 'MAIN',
    },
    {
      imageId: 802,
      imageUrl: 'https://storage.example.com/802.jpg',
      urlExpiresAt: null,
      fileSize: 110000,
      uploadedAt: '2026-09-18T10:05:00Z',
      sortOrder: 1,
      photoType: 'GALLERY',
    },
  ],
  createdAt: '2026-09-18T10:00:00Z',
  updatedAt: '2026-09-18T10:00:00Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCanGoBack = true;
  mockRouteId = '101';
  mockGetProduct.mockReset();
  mockRefresh.mockReset();
  mockRefresh.mockResolvedValue(undefined);
  delete process.env.EXPO_PUBLIC_CATALOG_ONLY;
});

describe('ProductDetailScreen', () => {
  test('displays loading indicator while product details are loading', async () => {
    let resolvePending: ((p: ProductDetail) => void) | undefined;
    mockGetProduct.mockReturnValue(new Promise(resolve => { resolvePending = resolve; }));

    render(<ProductDetailScreen />);
    expect(screen.getByText('กำลังโหลดข้อมูลสินค้า')).toBeTruthy();

    await act(async () => {
      resolvePending?.(sampleProduct);
    });
  });

  test('renders full product detail with a purchase action', async () => {
    mockGetProduct.mockResolvedValue(sampleProduct);

    render(<ProductDetailScreen />);

    expect(await screen.findByText('เสื้อเชิ้ตสีฟ้า')).toBeTruthy();
    expect(mockGetProduct).toHaveBeenCalledWith(101, undefined);
    expect(screen.getByText('฿1,290.00')).toBeTruthy();
    expect(screen.getByText('หมวดหมู่')).toBeTruthy();
    expect(screen.getByText('เสื้อผ้า')).toBeTruthy();
    expect(screen.getByText('แบรนด์')).toBeTruthy();
    expect(screen.getByText('ไม่ระบุแบรนด์')).toBeTruthy();
    expect(screen.getByText('ขนาด')).toBeTruthy();
    expect(screen.getByText('M')).toBeTruthy();
    expect(screen.getByText('สภาพ')).toBeTruthy();
    expect(screen.getAllByText('สภาพดี')).toBeTruthy();
    expect(screen.getByText('เสื้อเชิ้ตมือสองสภาพดี ใส่ไม่กี่ครั้ง')).toBeTruthy();

    // Verify out-of-scope elements are absent
    fireEvent.press(screen.getByRole('button', { name: 'ซื้อสินค้า' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/checkout/[productId]', params: { productId: '101' } });
    expect(screen.queryByText('สั่งซื้อ')).toBeNull();
    expect(screen.queryByText('ผู้ขาย')).toBeNull();
  });

  test('the buy button opens checkout for this product', async () => {
    mockGetProduct.mockResolvedValue(sampleProduct);

    render(<ProductDetailScreen />);
    fireEvent.press(await screen.findByRole('button', { name: 'ซื้อสินค้า' }));

    // ราคาและสิทธิ์ซื้อถูกถามจาก server ในหน้า Checkout ไม่ส่งต่อจากหน้านี้
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/checkout/[productId]',
      params: { productId: '101' },
    });
  });

  test('catalog-only detail explains that buying is unavailable and hides placeholder reviews', async () => {
    process.env.EXPO_PUBLIC_CATALOG_ONLY = 'true';
    mockGetProduct.mockResolvedValue({
      ...sampleProduct,
      seller: { displayName: 'ร้านจริง', verified: true },
    });

    render(<ProductDetailScreen />);

    expect(await screen.findByText('เสื้อเชิ้ตสีฟ้า')).toBeTruthy();
    expect(screen.getByText('โหมดนี้ดูสินค้าได้ แต่ยังสั่งซื้อไม่ได้')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'ซื้อสินค้า' })).toBeNull();
    expect(screen.queryByText(/4\.8|32 รีวิว/)).toBeNull();
    expect(screen.getByText('ผู้ขายผ่านการอนุมัติแล้ว')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  test('renders placeholder image when product has no images', async () => {
    const productWithoutImages: ProductDetail = {
      ...sampleProduct,
      images: [],
    };
    mockGetProduct.mockResolvedValue(productWithoutImages);

    render(<ProductDetailScreen />);

    expect(await screen.findByText('เสื้อเชิ้ตสีฟ้า')).toBeTruthy();
    expect(screen.getByLabelText('รูปสินค้า เสื้อเชิ้ตสีฟ้า')).toBeTruthy();
  });

  test('renders unavailable state (สินค้าไม่พร้อมแสดง) when product is not found or cancelled', async () => {
    mockGetProduct.mockRejectedValue(new ProductCatalogError('not-found', { code: 'PRODUCT_NOT_FOUND' }));

    render(<ProductDetailScreen />);

    expect(await screen.findByText('สินค้าไม่พร้อมแสดง')).toBeTruthy();
    expect(screen.getByText('กลับรายการ')).toBeTruthy();
  });

  test('renders unavailable state immediately for invalid route id without calling service', async () => {
    mockRouteId = 'invalid-id';

    render(<ProductDetailScreen />);

    expect(await screen.findByText('สินค้าไม่พร้อมแสดง')).toBeTruthy();
    expect(mockGetProduct).not.toHaveBeenCalled();
  });

  test('pressing "กลับรายการ" refreshes the catalog store and navigates back', async () => {
    mockGetProduct.mockRejectedValue(new ProductCatalogError('not-found', { code: 'PRODUCT_NOT_FOUND' }));

    render(<ProductDetailScreen />);

    const backToListBtn = await screen.findByText('กลับรายการ');
    await act(async () => {
      fireEvent.press(backToListBtn);
    });

    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  test('pressing "กลับรายการ" replaces to /products when canGoBack is false', async () => {
    mockCanGoBack = false;
    mockGetProduct.mockRejectedValue(new ProductCatalogError('not-found', { code: 'PRODUCT_NOT_FOUND' }));

    render(<ProductDetailScreen />);

    const backToListBtn = await screen.findByText('กลับรายการ');
    await act(async () => {
      fireEvent.press(backToListBtn);
    });

    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/products');
  });

  test('renders error state and supports retry on server or network error', async () => {
    mockGetProduct
      .mockRejectedValueOnce(new ProductCatalogError('network-error'))
      .mockResolvedValueOnce(sampleProduct);

    render(<ProductDetailScreen />);

    expect(await screen.findByText('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่')).toBeTruthy();
    const retryBtn = screen.getByText('ลองใหม่อีกครั้ง');

    await act(async () => {
      fireEvent.press(retryBtn);
    });

    expect(await screen.findByText('เสื้อเชิ้ตสีฟ้า')).toBeTruthy();
    expect(mockGetProduct).toHaveBeenCalledTimes(2);
  });

  test('navigates back when standard "กลับ" button is pressed', async () => {
    mockGetProduct.mockResolvedValue(sampleProduct);

    render(<ProductDetailScreen />);

    expect(await screen.findByText('เสื้อเชิ้ตสีฟ้า')).toBeTruthy();
    const backBtn = screen.getByRole('button', { name: 'กลับ' });
    fireEvent.press(backBtn);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
