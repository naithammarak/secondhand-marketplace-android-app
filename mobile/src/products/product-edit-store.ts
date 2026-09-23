import { ProductServiceError, type Product, type ProductInput } from '../services/product-service.ts';

export type ProductEditService = {
  getProductById(id: string, token?: string, signal?: AbortSignal): Promise<Product | null>;
  updateProduct(id: string, input: ProductInput, token?: string, signal?: AbortSignal): Promise<Product>;
  cancelProduct?(id: string, token?: string, signal?: AbortSignal): Promise<Product>;
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
  verifying: boolean;
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
  verifying: false,
};

export function createProductEditStore(service: ProductEditService) {
  let state: ProductEditState = initialProductEditState;
  // เพิ่มทุกครั้งที่เปลี่ยน productId เพื่อทิ้งผลของคำขอเก่าที่มาช้า (เช่น สินค้าตัวก่อนหน้า)
  let generation = 0;
  let accountToken: string | undefined;
  let controller = new AbortController();
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
      const product = await service.getProductById(productId, token, controller.signal);
      if (current !== generation) return;
      if (product) set({ product, loading: false, notFound: false, loadError: false, verifying: false });
      else set({ product: null, loading: false, notFound: true, loadError: false, verifying: false });
    } catch {
      if (current !== generation) return;
      set({ loading: false, loadError: true, verifying: false, product: null });
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
      if (state.productId === productId && accountToken === token) return Promise.resolve();
      controller.abort();
      controller = new AbortController();
      accountToken = token;
      generation += 1;
      state = { ...initialProductEditState, productId, loading: true };
      emit();
      return load(token);
    },

    /** ใช้กับปุ่มลองใหม่เมื่อโหลดสินค้าล้มเหลว */
    retry(token?: string) {
      if (!state.productId || state.loading) return Promise.resolve();
      set({ loading: true, loadError: false, notFound: false, verifying: false });
      return load(token);
    },

    dispose() {
      generation += 1;
      controller.abort();
      controller = new AbortController();
      accountToken = undefined;
      state = initialProductEditState;
      emit();
    },

    async submit(input: ProductInput, token?: string) {
      const productId = state.productId;
      if (!productId || state.submitting || state.verifying || state.loadError || state.loading || state.product?.status !== 'AVAILABLE') return;
      const current = generation;
      set({ submitting: true, submitError: false, submitErrorMessage: null, submitFieldErrors: {} });
      try {
        const product = await service.updateProduct(productId, input, token, controller.signal);
        if (current !== generation) return;
        set({ submitting: false, submitSuccess: true, submitError: false, product });
      } catch (err) {
        if (current !== generation) return;
        const errorMessage = err instanceof Error ? err.message : 'บันทึกการแก้ไขไม่สำเร็จ กรุณาลองใหม่';
        const fieldErrors = (err as any)?.fields ?? {};
        const uncertain = err instanceof ProductServiceError && (err.kind === 'timeout' || err.kind === 'network-error');
        set({
          submitting: false,
          submitError: true,
          submitErrorMessage: uncertain ? 'ผลการบันทึกยังไม่แน่ชัด กำลังตรวจสถานะสินค้าล่าสุด' : errorMessage,
          submitFieldErrors: fieldErrors,
          verifying: uncertain,
        });
        if (uncertain) {
          await load(token);
          if (current === generation && !state.loadError) {
            set({ submitErrorMessage: 'ตรวจสถานะล่าสุดแล้ว กรุณาตรวจข้อมูลสินค้าก่อนบันทึกอีกครั้ง' });
          }
        }
      }
    },

    async cancel(token?: string) {
      const productId = state.productId;
      if (!productId || state.cancelling || state.verifying || state.loadError || state.loading || state.product?.status !== 'AVAILABLE' || !service.cancelProduct) return;
      const current = generation;
      set({ cancelling: true, cancelError: false, cancelErrorMessage: null });
      try {
        const product = await service.cancelProduct(productId, token, controller.signal);
        if (current !== generation) return;
        set({ cancelling: false, cancelSuccess: true, cancelError: false, product });
      } catch (err) {
        if (current !== generation) return;
        const uncertain = err instanceof ProductServiceError && (err.kind === 'timeout' || err.kind === 'network-error');
        set({ cancelling: false, cancelError: true, verifying: uncertain, cancelErrorMessage: uncertain ? 'ผลการยกเลิกยังไม่แน่ชัด กำลังตรวจสถานะสินค้าล่าสุด' : err instanceof Error ? err.message : 'ยกเลิกสินค้าไม่สำเร็จ กรุณาลองใหม่' });
        if (uncertain) {
          await load(token);
          if (current === generation && !state.loadError) {
            set({ cancelErrorMessage: 'ตรวจสถานะล่าสุดแล้ว กรุณาตรวจสถานะสินค้าก่อนดำเนินการอีกครั้ง' });
          }
        }
      }
    },
  };
}

export type ProductEditStore = ReturnType<typeof createProductEditStore>;
