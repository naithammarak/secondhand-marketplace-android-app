import type { Product, ProductInput } from '../services/product-service';

export type ProductEditService = {
  getProductById(id: string, token?: string): Promise<Product | null>;
  updateProduct(id: string, input: ProductInput, token?: string): Promise<Product>;
  cancelProduct?(id: string, token?: string): Promise<Product>;
};

export type ProductEditState = {
  productId: string | null;
  product: Product | null;
  loading: boolean;
  notFound: boolean;
  loadError: boolean;
  submitting: boolean;
  submitError: boolean;
  submitErrorMessage?: string | null;
  submitFieldErrors?: Record<string, string>;
  submitSuccess: boolean;
  cancelling: boolean;
  cancelError: boolean;
  cancelErrorMessage?: string | null;
  cancelSuccess: boolean;
};

export const initialProductEditState: ProductEditState = {
  productId: null,
  product: null,
  loading: false,
  notFound: false,
  loadError: false,
  submitting: false,
  submitError: false,
  submitErrorMessage: null,
  submitFieldErrors: {},
  submitSuccess: false,
  cancelling: false,
  cancelError: false,
  cancelErrorMessage: null,
  cancelSuccess: false,
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

  const load = async (token?: string) => {
    const current = generation;
    const productId = state.productId;
    if (!productId) return;
    try {
      const product = await service.getProductById(productId, token);
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
    open(productId: string, token?: string) {
      if (state.productId === productId) return Promise.resolve();
      generation += 1;
      state = { ...initialProductEditState, productId, loading: true };
      emit();
      return load(token);
    },

    /** ใช้กับปุ่มลองใหม่เมื่อโหลดสินค้าล้มเหลว */
    retry(token?: string) {
      if (!state.productId || state.loading) return Promise.resolve();
      set({ loading: true, loadError: false, notFound: false });
      return load(token);
    },

    async submit(input: ProductInput, token?: string) {
      const productId = state.productId;
      if (!productId || state.submitting) return; // กันกดบันทึกซ้ำระหว่างรอผล
      const current = generation;
      set({ submitting: true, submitError: false, submitErrorMessage: null, submitFieldErrors: {} });
      try {
        const product = await service.updateProduct(productId, input, token);
        if (current !== generation) return;
        set({ submitting: false, submitSuccess: true, submitError: false, product });
      } catch (err) {
        if (current !== generation) return;
        const errorMessage = err instanceof Error ? err.message : 'บันทึกการแก้ไขไม่สำเร็จ กรุณาลองใหม่';
        const fieldErrors = (err as any)?.fields ?? {};
        set({
          submitting: false,
          submitError: true,
          submitErrorMessage: errorMessage,
          submitFieldErrors: fieldErrors,
        });
      }
    },

    async cancel(token?: string) {
      const productId = state.productId;
      if (!productId || state.cancelling || !service.cancelProduct) return;
      const current = generation;
      set({ cancelling: true, cancelError: false, cancelErrorMessage: null });
      try {
        const product = await service.cancelProduct(productId, token);
        if (current !== generation) return;
        set({ cancelling: false, cancelSuccess: true, cancelError: false, product });
      } catch (err) {
        if (current !== generation) return;
        set({ cancelling: false, cancelError: true, cancelErrorMessage: err instanceof Error ? err.message : 'ยกเลิกสินค้าไม่สำเร็จ กรุณาลองใหม่' });
      }
    },
  };
}

export type ProductEditStore = ReturnType<typeof createProductEditStore>;
