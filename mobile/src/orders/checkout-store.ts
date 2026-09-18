import type {
  CheckoutQuote,
  OrderErrorKind,
  OrderService,
  ShippingAddress,
} from '../services/order-service';
import {
  normalizeAddress,
  pickAddressErrors,
  validateAddress,
  type AddressFieldErrors,
  type AddressFormValues,
} from './checkout-form.ts';
import {
  errorCode,
  errorFields,
  errorKind,
  errorOrderId,
  withToken,
  type TokenSource,
} from './order-session.ts';

export type CheckoutState = {
  owner: string | null;
  productId: number | null;
  quote: CheckoutQuote | null;
  quoteLoading: boolean;
  quoteError: OrderErrorKind | null;
  quoteCode: string | null;
  submitting: boolean;
  submitError: OrderErrorKind | null;
  submitCode: string | null;
  fieldErrors: AddressFieldErrors;
  /** คำขอสร้าง Order หมดเวลาโดยไม่รู้ผล ต้องส่งซ้ำด้วย key และข้อมูลเดิมเท่านั้น */
  uncertain: boolean;
  /** Order ที่สร้างสำเร็จในรอบนี้ หน้าจอใช้พาไปหน้ารายละเอียด */
  createdOrderId: number | null;
  /** ผู้ซื้อจองสินค้านี้ไว้แล้วจากครั้งก่อน */
  existingOrderId: number | null;
};

export const initialCheckoutState: CheckoutState = {
  owner: null,
  productId: null,
  quote: null,
  quoteLoading: false,
  quoteError: null,
  quoteCode: null,
  submitting: false,
  submitError: null,
  submitCode: null,
  fieldErrors: {},
  uncertain: false,
  createdOrderId: null,
  existingOrderId: null,
};

export type CheckoutStoreDeps = TokenSource & {
  service: OrderService;
  newIdempotencyKey(): string;
};

type Pending = { key: string; address: ShippingAddress };

export function createCheckoutStore(deps: CheckoutStoreDeps) {
  let state: CheckoutState = initialCheckoutState;
  // key หนึ่งตัวต่อการเปิดหน้า Checkout หนึ่งครั้ง server ผูก key กับ Order เมื่อสร้างสำเร็จเท่านั้น
  let key: string | null = null;
  let pending: Pending | null = null;
  let generation = 0;
  let controller: AbortController | undefined;
  const listeners = new Set<() => void>();

  const emit = () => listeners.forEach(listener => listener());
  const set = (patch: Partial<CheckoutState>) => {
    state = { ...state, ...patch };
    emit();
  };

  const reset = (patch: Partial<CheckoutState>) => {
    generation += 1;
    controller?.abort();
    controller = undefined;
    key = null;
    pending = null;
    state = { ...initialCheckoutState, ...patch };
    emit();
  };

  const loadQuote = async () => {
    const { owner, productId } = state;
    if (!owner || productId === null) return;
    const current = generation;
    set({ quoteLoading: true, quoteError: null, quoteCode: null });
    try {
      const quote = await withToken(deps, token => deps.service.getQuote(token, productId));
      if (current === generation) set({ quote, quoteLoading: false });
    } catch (error) {
      if (current !== generation) return;
      set({
        quoteLoading: false,
        quoteError: errorKind(error),
        quoteCode: errorCode(error),
        existingOrderId: errorCode(error) === 'already_ordered' ? errorOrderId(error) : null,
      });
    }
  };

  return {
    getSnapshot: () => state,

    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },

    /** เปลี่ยนบัญชีหรือออกจากระบบแล้วล้างทุกอย่าง รวมถึงที่อยู่ที่กรอกค้างไว้ */
    setOwner(owner: string | null) {
      if (state.owner === owner) return;
      reset({ owner });
    },

    /** เปิดหน้า Checkout ใหม่ทุกครั้งเริ่มจากศูนย์ ไม่สร้าง Order เองอัตโนมัติ */
    open(productId: number) {
      if (!state.owner) return Promise.resolve();
      reset({ owner: state.owner, productId });
      key = deps.newIdempotencyKey();
      return loadQuote();
    },

    /** ออกจากหน้า Checkout: ทิ้ง key, ที่อยู่ที่ค้าง และผลของรอบนี้ */
    close() {
      reset({ owner: state.owner });
    },

    reloadQuote() {
      if (state.quoteLoading) return Promise.resolve();
      return loadQuote();
    },

    clearFieldError(field: keyof AddressFormValues) {
      if (!state.fieldErrors[field]) return;
      const { [field]: _removed, ...rest } = state.fieldErrors;
      set({ fieldErrors: rest });
    },

    async submit(values: AddressFormValues) {
      const { owner, productId } = state;
      if (!owner || productId === null || !key) return;
      // กันกดซ้ำ และกันสร้างซ้ำหลังสร้างสำเร็จแล้ว
      if (state.submitting || state.createdOrderId !== null) return;

      let request: Pending;
      if (state.uncertain && pending) {
        // คำขอก่อนหน้าไม่รู้ผล ต้องส่งข้อมูลชุดเดิมด้วย key เดิม server จะคืน Order เดิมถ้าสร้างไปแล้ว
        request = pending;
      } else {
        const fieldErrors = validateAddress(values);
        if (Object.keys(fieldErrors).length > 0) {
          set({ fieldErrors, submitError: 'validation-error', submitCode: null });
          return;
        }
        request = { key, address: normalizeAddress(values) };
      }
      pending = request;

      const current = generation;
      controller = new AbortController();
      const signal = controller.signal;
      set({ submitting: true, submitError: null, submitCode: null, fieldErrors: {} });
      try {
        const order = await withToken(deps, token => deps.service.createOrder(token, {
          productId,
          address: request.address,
          idempotencyKey: request.key,
        }, signal), signal);
        if (current !== generation) return;
        pending = null;
        set({ submitting: false, uncertain: false, createdOrderId: order.id });
      } catch (error) {
        if (current !== generation || signal.aborted) return;
        const kind = errorKind(error);
        const code = errorCode(error);
        if (kind === 'timeout' || kind === 'network-error' || kind === 'server-error') {
          // ไม่รู้ว่า server สร้าง Order ไปแล้วหรือไม่ ห้ามเดาว่าสำเร็จหรือล้มเหลว
          set({ submitting: false, submitError: kind, submitCode: code, uncertain: true });
          return;
        }
        pending = null;
        set({
          submitting: false,
          uncertain: false,
          submitError: kind,
          submitCode: code,
          fieldErrors: kind === 'validation-error' ? pickAddressErrors(errorFields(error)) : {},
          existingOrderId: code === 'already_ordered' ? errorOrderId(error) : state.existingOrderId,
        });
      }
    },
  };
}

export type CheckoutStore = ReturnType<typeof createCheckoutStore>;
