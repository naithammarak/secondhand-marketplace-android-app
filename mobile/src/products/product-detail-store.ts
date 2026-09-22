import type { ProductCatalogErrorKind, ProductCatalogService, ProductDetail } from '../services/product-catalog-service.ts';

/** รับเฉพาะ getProduct ผ่าน dependency injection เพื่อให้ test ใส่ fake service ได้ */
export type ProductDetailService = Pick<ProductCatalogService, 'getProduct'>;

export type ProductDetailState = {
  productId: number | null;
  product: ProductDetail | null;
  loading: boolean;
  /** true เฉพาะเมื่อ backend ตอบ 404 PRODUCT_NOT_FOUND (สินค้าไม่พร้อมแสดง) แยกจาก error เครือข่าย/เซิร์ฟเวอร์ */
  notAvailable: boolean;
  error: ProductCatalogErrorKind | null;
};

export const initialProductDetailState: ProductDetailState = {
  productId: null,
  product: null,
  loading: false,
  notAvailable: false,
  error: null,
};

const KNOWN_ERROR_KINDS: ProductCatalogErrorKind[] = [
  'not-found', 'validation-error', 'network-error', 'timeout', 'server-error', 'unavailable',
];

/** อ่านชนิดข้อผิดพลาดจาก service โดยไม่ผูกกับคลาสของ service เพื่อให้โมดูลนี้ทดสอบแยกได้ */
function errorKind(error: unknown): ProductCatalogErrorKind {
  const kind = (error as { kind?: unknown } | null)?.kind;
  return KNOWN_ERROR_KINDS.find(known => known === kind) ?? 'server-error';
}

/** id ของสินค้าต้องเป็นจำนวนเต็มบวกในช่วง Integer ของ PostgreSQL ตาม contract ค่าอื่นไม่ต้องเรียก service เลย */
function isValidProductId(id: number): boolean {
  return Number.isInteger(id) && id >= 1 && id <= 2147483647;
}

export function createProductDetailStore(service: ProductDetailService) {
  let state: ProductDetailState = initialProductDetailState;
  // เพิ่มทุกครั้งที่เปลี่ยน productId เพื่อทิ้งผลของคำขอเก่าที่มาช้า (เช่น สินค้าตัวก่อนหน้า)
  let generation = 0;
  const listeners = new Set<() => void>();

  const emit = () => listeners.forEach(listener => listener());
  const set = (patch: Partial<ProductDetailState>) => {
    state = { ...state, ...patch };
    emit();
  };

  const load = async () => {
    const current = generation;
    const productId = state.productId;
    if (productId === null) return;
    try {
      const product = await service.getProduct(productId);
      if (current !== generation) return;
      set({ product, loading: false, notAvailable: false, error: null });
    } catch (error) {
      if (current !== generation) return;
      const kind = errorKind(error);
      if (kind === 'not-found') set({ loading: false, notAvailable: true, error: null, product: null });
      else set({ loading: false, error: kind, notAvailable: false });
    }
  };

  return {
    getSnapshot: () => state,

    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },

    /** เปิดดูสินค้า id ใหม่ ล้างข้อมูลสินค้าเดิมทันทีก่อนเริ่มโหลด */
    open(id: number) {
      if (state.productId === id) return Promise.resolve();
      generation += 1;
      if (!isValidProductId(id)) {
        // id ผิดรูปแบบไม่มีทางตรงกับสินค้าจริง จึงไม่เรียก service เลย
        state = { ...initialProductDetailState, productId: id, notAvailable: true };
        emit();
        return Promise.resolve();
      }
      state = { ...initialProductDetailState, productId: id, loading: true };
      emit();
      return load();
    },

    /** ใช้กับปุ่มลองใหม่เมื่อโหลดล้มเหลว โหลดสินค้า id ปัจจุบันซ้ำ */
    retry() {
      if (state.productId === null || state.loading || !isValidProductId(state.productId)) return Promise.resolve();
      set({ loading: true, notAvailable: false, error: null });
      return load();
    },
  };
}

export type ProductDetailStore = ReturnType<typeof createProductDetailStore>;
