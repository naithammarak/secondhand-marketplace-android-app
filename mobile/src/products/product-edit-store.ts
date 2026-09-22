import type { Product, ProductInput } from '../services/product-service';

export type ProductEditService = {
  getProductById(id: string): Promise<Product | null>;
  updateProduct(id: string, input: ProductInput): Promise<Product>;
};

export type ProductEditState = {
  productId: string | null;
  product: Product | null;
  loading: boolean;
  notFound: boolean;
  loadError: boolean;
  submitting: boolean;
  submitError: boolean;
  submitSuccess: boolean;
};

export const initialProductEditState: ProductEditState = {
  productId: null,
  product: null,
  loading: false,
  notFound: false,
  loadError: false,
  submitting: false,
  submitError: false,
  submitSuccess: false,
};

export function createProductEditStore(service: ProductEditService) {
  let state: ProductEditState = initialProductEditState;
  // เพิ่มทุกครั้งที่เปลี่ยน productId เพื่อทิ้งผลของคำขอเก่าที่มาช้า (เช่น สินค้าตัวก่อนหน้า)
  let generation = 0;
  const listeners = new Set<() => void>();

  const emit = () => listeners.forEach(listener => listener());
  const set = (patch: Partial<ProductEditState>) => {
    state = { ...state, ...patch };
    emit();
  };

  const load = async () => {
    const current = generation;
    const productId = state.productId;
    if (!productId) return;
    try {
      const product = await service.getProductById(productId);
      if (current !== generation) return;
      if (product) set({ product, loading: false, notFound: false, loadError: false });
      else set({ product: null, loading: false, notFound: true, loadError: false });
    } catch {
      if (current !== generation) return;
      set({ loading: false, loadError: true });
    }
  };

  return {
    getSnapshot: () => state,

    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },

    /** เปิดหน้าแก้ไขสินค้า id ใหม่ ล้างข้อมูลสินค้าเดิมทันทีก่อนเริ่มโหลด */
    open(productId: string) {
      if (state.productId === productId) return Promise.resolve();
      generation += 1;
      state = { ...initialProductEditState, productId, loading: true };
      emit();
      return load();
    },

    /** ใช้กับปุ่มลองใหม่เมื่อโหลดสินค้าล้มเหลว */
    retry() {
      if (!state.productId || state.loading) return Promise.resolve();
      set({ loading: true, loadError: false, notFound: false });
      return load();
    },

    async submit(input: ProductInput) {
      const productId = state.productId;
      if (!productId || state.submitting) return; // กันกดบันทึกซ้ำระหว่างรอผล
      const current = generation;
      set({ submitting: true, submitError: false });
      try {
        const product = await service.updateProduct(productId, input);
        if (current !== generation) return;
        set({ submitting: false, submitSuccess: true, submitError: false, product });
      } catch {
        if (current !== generation) return;
        set({ submitting: false, submitError: true });
      }
    },
  };
}

export type ProductEditStore = ReturnType<typeof createProductEditStore>;
