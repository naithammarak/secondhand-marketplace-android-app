import type {
  ProductCatalogErrorKind,
  ProductCatalogService,
  ProductListItem,
  ProductCategory,
  ProductPageMeta,
} from '../services/product-catalog-service.ts';

export const SEARCH_DEBOUNCE_MS = 300;
export const CATALOG_PAGE_SIZE = 20;

const KNOWN_ERROR_KINDS: ProductCatalogErrorKind[] = [
  'not-found', 'validation-error', 'network-error', 'timeout', 'server-error', 'unavailable',
];

/** อ่านชนิดข้อผิดพลาดจาก service โดยไม่ผูกกับคลาสของ service เพื่อให้โมดูลนี้ทดสอบแยกได้ */
function errorKind(error: unknown): ProductCatalogErrorKind {
  const kind = (error as { kind?: unknown } | null)?.kind;
  return KNOWN_ERROR_KINDS.find(known => known === kind) ?? 'server-error';
}

export type ProductCatalogState = {
  query: string;
  categoryId: number | null;
  categories: ProductCategory[];
  categoriesLoading: boolean;
  categoriesError: ProductCatalogErrorKind | null;
  page: number;
  pageSize: number;
  items: ProductListItem[];
  meta: ProductPageMeta | null;
  loaded: boolean;
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  error: ProductCatalogErrorKind | null;
};

export function createInitialProductCatalogState(pageSize = CATALOG_PAGE_SIZE): ProductCatalogState {
  return {
    categoryId: null, categories: [], categoriesLoading: false, categoriesError: null,
    query: '', page: 1, pageSize, items: [], meta: null,
    loaded: false, loading: false, refreshing: false, loadingMore: false, error: null,
  };
}

export type ProductCatalogStoreDeps = {
  /** รับผ่าน dependency injection เพื่อให้ test ควบคุม response/ลำดับ/เวลาได้ */
  service: Pick<ProductCatalogService, 'listProducts'> & Partial<Pick<ProductCatalogService, 'getCategories'>>;
  pageSize?: number;
  debounceMs?: number;
};

export function createProductCatalogStore(deps: ProductCatalogStoreDeps) {
  const pageSize = deps.pageSize ?? CATALOG_PAGE_SIZE;
  const debounceMs = deps.debounceMs ?? SEARCH_DEBOUNCE_MS;
  let state: ProductCatalogState = createInitialProductCatalogState(pageSize);
  // เพิ่มทุกครั้งที่เริ่ม fetch ใหม่ เพื่อทิ้งผลของคำขอเก่าที่มาช้ากว่าคำค้นปัจจุบัน
  let generation = 0;
  // จำ mode ที่ fetch ล่าสุดใช้ เพื่อให้ retry() ทำซ้ำ operation เดิม (โดยเฉพาะ 'more' ต้องต่อจาก page เดิมที่ล้มเหลว ไม่ใช่รีเซ็ตกลับหน้า 1)
  let lastMode: 'load' | 'refresh' | 'more' = 'load';
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();

  const emit = () => listeners.forEach(listener => listener());
  const set = (patch: Partial<ProductCatalogState>) => {
    state = { ...state, ...patch };
    emit();
  };

  const busy = () => state.loading || state.refreshing || state.loadingMore;

  const clearDebounce = () => {
    if (debounceTimer !== undefined) {
      clearTimeout(debounceTimer);
      debounceTimer = undefined;
    }
  };

  const fetchPage = async (mode: 'load' | 'refresh' | 'more') => {
    const current = ++generation;
    lastMode = mode;
    const page = mode === 'more' ? state.page + 1 : 1;
    set({
      loading: mode === 'load',
      refreshing: mode === 'refresh',
      loadingMore: mode === 'more',
      error: null,
    });
    try {
      const result = await deps.service.listProducts({ q: state.query, page, pageSize: state.pageSize, ...(state.categoryId !== null ? { categoryId: state.categoryId } : {}) });
      if (current !== generation) return;
      // หน้าถัดไปอาจซ้อนกับหน้าก่อนเมื่อมีสินค้าใหม่ระหว่างเลื่อน จึงตัดรายการซ้ำตาม id
      let items = result.items;
      if (mode === 'more') {
        const seen = new Set(state.items.map(item => item.id));
        items = [...state.items, ...result.items.filter(item => !seen.has(item.id))];
      }
      set({
        items, meta: result.meta, page: result.meta.page,
        loaded: true, loading: false, refreshing: false, loadingMore: false, error: null,
      });
    } catch (error) {
      if (current !== generation) return;
      set({ loading: false, refreshing: false, loadingMore: false, error: errorKind(error) });
    }
  };

  return {
    getSnapshot: () => state,

    async loadCategories() {
      if (state.categoriesLoading || state.categories.length || !deps.service.getCategories) return;
      set({ categoriesLoading: true, categoriesError: null });
      try { set({ categories: await deps.service.getCategories() }); }
      catch (error) { set({ categoriesError: errorKind(error) }); }
      finally { set({ categoriesLoading: false }); }
    },

    setCategory(categoryId: number | null) {
      if (categoryId === state.categoryId) return Promise.resolve();
      clearDebounce();
      set({ categoryId, items: [], meta: null, loaded: false, page: 1 });
      return fetchPage('load');
    },

    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },

    /** โหลดครั้งแรกเมื่อเปิดหน้า ไม่หน่วงเวลา */
    load() {
      if (busy()) return Promise.resolve();
      return fetchPage('load');
    },

    /** เปลี่ยนคำค้น: อัปเดตข้อความทันทีเพื่อให้พิมพ์ลื่น แต่ดีเลย์การค้นหาจริง debounceMs และรีเซ็ตหน้าเป็น 1 เสมอ */
    setQuery(query: string) {
      generation += 1;
      set({ query, items: [], meta: null, loaded: false, loading: false, loadingMore: false, refreshing: false, error: null });
      clearDebounce();
      debounceTimer = setTimeout(() => {
        debounceTimer = undefined;
        void fetchPage('load');
      }, debounceMs);
    },

    /** ยกเลิก debounce ที่ค้างอยู่แล้วรีเฟรชหน้าปัจจุบันทันที ไม่ดีเลย์ */
    refresh() {
      const hasPendingQuery = debounceTimer !== undefined;
      clearDebounce();
      if (state.refreshing && !hasPendingQuery) return Promise.resolve();
      return fetchPage('refresh');
    },

    /** ใช้กับปุ่มลองใหม่เมื่อโหลดล้มเหลว ทำซ้ำ operation เดิมที่ล้มเหลว (โดยเฉพาะ loadMore ต้องต่อจาก page เดิม ไม่ reset) ไม่ดีเลย์ */
    retry() {
      clearDebounce();
      if (busy()) return Promise.resolve();
      return fetchPage(lastMode);
    },

    loadMore() {
      if (debounceTimer !== undefined || busy() || !state.loaded || !state.meta?.hasNext) return Promise.resolve();
      return fetchPage('more');
    },

    hasMore: () => state.loaded && !!state.meta?.hasNext,
  };
}

export type ProductCatalogStore = ReturnType<typeof createProductCatalogStore>;
