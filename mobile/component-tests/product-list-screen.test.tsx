import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ProductListScreen } from '@/components/product-list-screen';
import type { ProductCatalogState } from '@/products/product-catalog-store';
import type { ProductListItem } from '@/services/product-catalog-service';

let mockSession: unknown = null;
jest.mock('@/auth/auth-provider', () => ({ useAuth: () => ({ session: mockSession }) }));
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockCanGoBack = true;
let mockFocusCallback: (() => void) | null = null;

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => {
    jest.requireActual<typeof import('react')>('react').useEffect(() => {
      mockFocusCallback = callback;
      callback();
      return () => { mockFocusCallback = null; };
    }, [callback]);
  },
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    back: () => mockBack(),
    replace: (...args: unknown[]) => mockReplace(...args),
    canGoBack: () => mockCanGoBack,
  },
}));

let mockState: ProductCatalogState;
let listeners: Set<() => void>;
let mockStore: {
  getSnapshot: jest.Mock;
  subscribe: jest.Mock;
  load: jest.Mock;
  setQuery: jest.Mock;
  refresh: jest.Mock;
  retry: jest.Mock;
  loadMore: jest.Mock;
  hasMore: jest.Mock;
  loadCategories: jest.Mock;
  setCategory: jest.Mock;
};

const sampleItem1: ProductListItem = {
  id: 101,
  productName: 'เสื้อเชิ้ตสีฟ้า',
  price: '1290.00',
  condition: 'GOOD',
  status: 'AVAILABLE',
  mainImage: { imageId: 801, imageUrl: 'https://example.com/801.jpg', urlExpiresAt: null },
};

const sampleItem2: ProductListItem = {
  id: 102,
  productName: 'กระเป๋าสะพายหนัง',
  price: '1990.00',
  condition: 'LIKE_NEW',
  status: 'AVAILABLE',
  mainImage: null,
};

function defaultState(overrides: Partial<ProductCatalogState> = {}): ProductCatalogState {
  return {
    categoryId: null, categories: [], categoriesLoading: false, categoriesError: null,
    query: '',
    page: 1,
    pageSize: 20,
    items: [],
    meta: null,
    loaded: false,
    loading: false,
    refreshing: false,
    loadingMore: false,
    error: null,
    ...overrides,
  };
}

jest.mock('@/products/product-catalog-instance', () => ({
  productCatalogStore: {
    getSnapshot: () => mockStore.getSnapshot(),
    loadCategories: () => mockStore.loadCategories(),
    setCategory: (id: number | null) => mockStore.setCategory(id),
    subscribe: (listener: () => void) => mockStore.subscribe(listener),
    load: () => mockStore.load(),
    setQuery: (q: string) => mockStore.setQuery(q),
    refresh: () => mockStore.refresh(),
    retry: () => mockStore.retry(),
    loadMore: () => mockStore.loadMore(),
    hasMore: () => mockStore.hasMore(),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockSession = null;
  mockCanGoBack = true;
  mockFocusCallback = null;
  mockState = defaultState();
  listeners = new Set();
  mockStore = {
    loadCategories: jest.fn(),
    setCategory: jest.fn(),
    getSnapshot: jest.fn(() => mockState),
    subscribe: jest.fn((listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    load: jest.fn().mockResolvedValue(undefined),
    setQuery: jest.fn(),
    refresh: jest.fn().mockResolvedValue(undefined),
    retry: jest.fn().mockResolvedValue(undefined),
    loadMore: jest.fn().mockResolvedValue(undefined),
    hasMore: jest.fn(() => false),
  };
});

describe('ProductListScreen', () => {
  test('category controls use API identifiers and permanent tabs navigate', () => {
    mockState = defaultState({ categories: [{ id: 42, categoryName: 'หมวดจาก API', parentCategoryId: null }] });
    render(<ProductListScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'หมวดจาก API' }));
    expect(mockStore.setCategory).toHaveBeenCalledWith(42);
    fireEvent.press(screen.getByRole('tab', { name: 'คำสั่งซื้อ' }));
    expect(mockReplace).toHaveBeenCalledWith('/orders');
    fireEvent.press(screen.getByRole('tab', { name: 'โปรไฟล์' }));
    expect(mockReplace).toHaveBeenCalledWith('/profile');
    fireEvent.press(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }));
    expect(mockPush).toHaveBeenCalledWith('/login');
  });

  test('calls store.load() on initial mount when loaded is false', () => {
    mockState = defaultState({ loaded: false });
    render(<ProductListScreen />);
    expect(mockStore.load).toHaveBeenCalledTimes(1);
  });

  test('refreshes cached results when opening the catalog again', () => {
    mockState = defaultState({ loaded: true, items: [sampleItem1] });
    render(<ProductListScreen />);
    expect(mockStore.load).not.toHaveBeenCalled();
    expect(mockStore.refresh).toHaveBeenCalledTimes(1);
  });

  test('keeps cached items and search position when returning from detail', () => {
    mockState = defaultState({ loaded: true, query: 'เสื้อ', items: [sampleItem1] });
    render(<ProductListScreen />);
    mockStore.refresh.mockClear();

    fireEvent.press(screen.getByLabelText('เสื้อเชิ้ตสีฟ้า'));
    act(() => { mockFocusCallback?.(); });

    expect(mockStore.refresh).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('ค้นหาชื่อสินค้า').props.value).toBe('เสื้อ');
    expect(screen.getByText('เสื้อเชิ้ตสีฟ้า')).toBeTruthy();
  });

  test('refreshes again on a later catalog focus after detail return', () => {
    mockState = defaultState({ loaded: true, items: [sampleItem1] });
    render(<ProductListScreen />);
    mockStore.refresh.mockClear();

    fireEvent.press(screen.getByLabelText('เสื้อเชิ้ตสีฟ้า'));
    act(() => { mockFocusCallback?.(); });
    act(() => { mockFocusCallback?.(); });

    expect(mockStore.refresh).toHaveBeenCalledTimes(1);
  });

  test('renders loading indicator when loading initial products', () => {
    mockState = defaultState({ loaded: false, loading: true });
    render(<ProductListScreen />);
    expect(screen.getByText('กำลังโหลดสินค้า')).toBeTruthy();
  });

  test('renders products list with name, formatted price, and condition', () => {
    mockState = defaultState({
      loaded: true,
      items: [sampleItem1, sampleItem2],
      meta: { page: 1, pageSize: 20, total: 2, totalPages: 1, hasNext: false },
    });
    render(<ProductListScreen />);

    expect(screen.getByText('เสื้อเชิ้ตสีฟ้า')).toBeTruthy();
    expect(screen.getByText('฿1,290.00')).toBeTruthy();
    expect(screen.getByLabelText('สภาพดี')).toBeTruthy();

    expect(screen.getByText('กระเป๋าสะพายหนัง')).toBeTruthy();
    expect(screen.getByText('฿1,990.00')).toBeTruthy();
    expect(screen.getByLabelText('สภาพเหมือนใหม่')).toBeTruthy();
  });

  test('updates query when user types in search input', () => {
    mockState = defaultState({ loaded: true, items: [sampleItem1] });
    render(<ProductListScreen />);

    const searchInput = screen.getByPlaceholderText('ค้นหาชื่อสินค้า');
    fireEvent.changeText(searchInput, 'เสื้อ');
    expect(mockStore.setQuery).toHaveBeenCalledWith('เสื้อ');
  });

  test('shows empty search message when loaded with query and no items', () => {
    mockState = defaultState({
      loaded: true,
      query: 'xyz123',
      items: [],
      meta: { page: 1, pageSize: 20, total: 0, totalPages: 0, hasNext: false },
    });
    render(<ProductListScreen />);
    expect(screen.getByText('ไม่พบสินค้าตามคำค้น')).toBeTruthy();
  });

  test('shows empty catalog message when loaded without query and no items', () => {
    mockState = defaultState({
      loaded: true,
      categoryId: null, categories: [], categoriesLoading: false, categoriesError: null,
    query: '',
      items: [],
      meta: { page: 1, pageSize: 20, total: 0, totalPages: 0, hasNext: false },
    });
    render(<ProductListScreen />);
    expect(screen.getByText('ยังไม่มีสินค้า')).toBeTruthy();
  });

  test('shows initial load error and allows retry', () => {
    mockState = defaultState({
      loaded: false,
      error: 'network-error',
    });
    render(<ProductListScreen />);

    expect(screen.getByText('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้')).toBeTruthy();
    expect(screen.getByText('กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่')).toBeTruthy();
    const retryButton = screen.getByText('ลองใหม่อีกครั้ง');
    fireEvent.press(retryButton);
    expect(mockStore.retry).toHaveBeenCalledTimes(1);
  });

  test('shows load more button when hasMore is true and allows clicking to load more', () => {
    mockState = defaultState({
      loaded: true,
      items: [sampleItem1],
      meta: { page: 1, pageSize: 1, total: 2, totalPages: 2, hasNext: true },
    });
    mockStore.hasMore.mockReturnValue(true);
    render(<ProductListScreen />);

    const loadMoreButton = screen.getByText('โหลดเพิ่ม');
    fireEvent.press(loadMoreButton);
    expect(mockStore.loadMore).toHaveBeenCalledTimes(1);
  });

  test('shows loading indicator when loading more', () => {
    mockState = defaultState({
      loaded: true,
      items: [sampleItem1],
      loadingMore: true,
      meta: { page: 1, pageSize: 1, total: 2, totalPages: 2, hasNext: true },
    });
    render(<ProductListScreen />);
    expect(screen.getByText('กำลังโหลดเพิ่ม')).toBeTruthy();
  });

  test('shows load more error in footer and allows retry', () => {
    mockState = defaultState({
      loaded: true,
      items: [sampleItem1],
      error: 'timeout',
      meta: { page: 1, pageSize: 1, total: 2, totalPages: 2, hasNext: true },
    });
    render(<ProductListScreen />);

    expect(screen.getByText('เซิร์ฟเวอร์ตอบช้าเกินไป')).toBeTruthy();
    const retryButton = screen.getByText('ลองใหม่อีกครั้ง');
    fireEvent.press(retryButton);
    expect(mockStore.retry).toHaveBeenCalledTimes(1);
  });

  test('navigates to product detail screen when a product card is tapped', () => {
    mockState = defaultState({
      loaded: true,
      items: [sampleItem1],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1, hasNext: false },
    });
    render(<ProductListScreen />);

    const card = screen.getByLabelText('เสื้อเชิ้ตสีฟ้า');
    fireEvent.press(card);

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/products/[id]',
      params: { id: '101' },
    });
  });

  test('renders shopping bag button when authenticated and navigates to /orders', () => {
    mockSession = { user: { id: 'user-1' } };
    mockState = defaultState({ loaded: true, items: [] });
    render(<ProductListScreen />);

    expect(screen.queryByRole('button', { name: 'เข้าสู่ระบบ' })).toBeNull();
    const bagButton = screen.getByRole('button', { name: 'คำสั่งซื้อ' });
    expect(bagButton).toBeTruthy();
    fireEvent.press(bagButton);
    expect(mockPush).toHaveBeenCalledWith('/orders');
  });

  test('renders brand name and seller store name on product card', () => {
    const itemWithBrandAndSeller: ProductListItem = {
      ...sampleItem1,
      brand: { id: 10, brandName: 'Bottega Veneta' },
      seller: { displayName: 'ร้านวนดีช็อป', verified: true },
    };
    mockState = defaultState({
      loaded: true,
      items: [itemWithBrandAndSeller],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1, hasNext: false },
    });
    render(<ProductListScreen />);

    expect(screen.getByText('Bottega Veneta')).toBeTruthy();
    expect(screen.getByText('ร้านวนดีช็อป')).toBeTruthy();
  });

  test('hides the shop row instead of inventing a shop name when the API sends none', () => {
    mockState = defaultState({
      loaded: true,
      items: [{ ...sampleItem1, seller: null }],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1, hasNext: false },
    });
    render(<ProductListScreen />);

    expect(screen.getByText('เสื้อเชิ้ตสีฟ้า')).toBeTruthy();
    expect(screen.queryByText('ร้านวนดีช็อป')).toBeNull();
    expect(screen.queryByLabelText('ผู้ขายยืนยันตัวตนแล้ว')).toBeNull();
  });

  test('titles the list with the selected API category', () => {
    mockState = defaultState({
      loaded: true,
      categoryId: 42,
      categories: [{ id: 42, categoryName: 'หมวดจาก API', parentCategoryId: null }],
    });
    render(<ProductListScreen />);

    expect(screen.getAllByText('หมวดจาก API').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('หมวดนี้ยังไม่มีสินค้าลงขาย ลองดูหมวดอื่นก่อนนะ')).toBeTruthy();
  });
});
