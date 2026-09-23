import type {
  OrderDetail,
  OrderErrorKind,
  OrderService,
  PaymentOutcome,
  Receipt,
} from '../services/order-service';
import { errorCode, errorKind, withToken, type TokenSource } from './order-session.ts';

export type PaymentResultKind = 'succeeded' | 'failed';

export type OrderDetailState = {
  owner: string | null;
  orderId: number | null;
  order: OrderDetail | null;
  loading: boolean;
  refreshing: boolean;
  loadError: OrderErrorKind | null;
  paying: PaymentOutcome | null;
  payError: OrderErrorKind | null;
  payCode: string | null;
  /** ผลจาก server ของการกดจ่ายครั้งล่าสุด ไม่มีการเดาผล */
  lastResult: PaymentResultKind | null;
  /** คำขอจ่ายหมดเวลาและตรวจสถานะแล้วยังไม่รู้ผล ปุ่มลองใหม่จะใช้ key เดิม */
  uncertain: boolean;
  cancelling: boolean;
  cancelError: OrderErrorKind | null;
  cancelCode: string | null;
  receipt: Receipt | null;
  receiptLoading: boolean;
  receiptError: OrderErrorKind | null;
};

export const initialOrderDetailState: OrderDetailState = {
  owner: null,
  orderId: null,
  order: null,
  loading: false,
  refreshing: false,
  loadError: null,
  paying: null,
  payError: null,
  payCode: null,
  lastResult: null,
  uncertain: false,
  cancelling: false,
  cancelError: null,
  cancelCode: null,
  receipt: null,
  receiptLoading: false,
  receiptError: null,
};

export type OrderDetailStoreDeps = TokenSource & {
  service: OrderService;
  newIdempotencyKey(): string;
};

type PendingPayment = { key: string; outcome: PaymentOutcome };

export function createOrderDetailStore(deps: OrderDetailStoreDeps) {
  let state: OrderDetailState = initialOrderDetailState;
  let generation = 0;
  /**
   * นับครั้งที่ได้ "คำตอบที่เชื่อถือกว่าการอ่าน" (ผลการจ่ายและผลการยกเลิก)
   * การอ่านที่ออกไปก่อนหน้านั้นอาจกลับมาทีหลังและทับสถานะใหม่ได้ เช่น กดรีเฟรชแล้วกดยกเลิก
   * คำตอบของรีเฟรชที่มาช้าจะพา Order กลับไปเป็น WAITING_PAYMENT ทั้งที่ยกเลิกสำเร็จแล้ว
   * จึงต้องทิ้งผลการอ่านที่ออกไปก่อนคำตอบล่าสุดเสมอ
   */
  let orderEpoch = 0;
  let pending: PendingPayment | null = null;
  let controllers = new Set<AbortController>();
  const listeners = new Set<() => void>();

  const emit = () => listeners.forEach(listener => listener());
  const set = (patch: Partial<OrderDetailState>) => {
    state = { ...state, ...patch };
    emit();
  };

  const reset = (patch: Partial<OrderDetailState>) => {
    generation += 1;
    controllers.forEach(controller => controller.abort());
    controllers = new Set();
    pending = null;
    state = { ...initialOrderDetailState, ...patch };
    emit();
  };

  const track = () => {
    const controller = new AbortController();
    controllers.add(controller);
    return {
      signal: controller.signal,
      done: () => controllers.delete(controller),
    };
  };

  const fetchOrder = async (mode: 'load' | 'refresh'): Promise<OrderDetail | null> => {
    const { owner, orderId } = state;
    if (!owner || orderId === null) return null;
    const current = generation;
    const epoch = orderEpoch;
    const { signal, done } = track();
    set(mode === 'load' ? { loading: true, loadError: null } : { refreshing: true, loadError: null });
    try {
      const order = await withToken(deps, token => deps.service.getOrder(token, orderId, signal), signal);
      if (current !== generation) return null;
      if (epoch !== orderEpoch) {
        // มีผลการจ่ายหรือการยกเลิกเข้ามาหลังจากคำขออ่านนี้ออกไป ผลที่อ่านมาถือว่าเก่ากว่า
        set({ loading: false, refreshing: false });
        return null;
      }
      set({ order, loading: false, refreshing: false });
      return order;
    } catch (error) {
      if (current !== generation || signal.aborted) return null;
      set({ loading: false, refreshing: false, loadError: errorKind(error) });
      return null;
    } finally {
      done();
    }
  };

  const pay = async (outcome: PaymentOutcome) => {
    const { owner, orderId, order } = state;
    if (!owner || orderId === null || !order) return;
    if (state.paying) return; // กันกดซ้ำระหว่างรอผล
    if (!state.uncertain && !order.canPay) return;

    // ลองซ้ำคำขอเดิม (ผลเดียวกัน) ใช้ key เดิม; ผลลัพธ์ใหม่หรือหลัง FAILED ใช้ key ใหม่
    const request: PendingPayment = pending && pending.outcome === outcome
      ? pending
      : { key: deps.newIdempotencyKey(), outcome };
    pending = request;

    const current = generation;
    const { signal, done } = track();
    set({ paying: outcome, payError: null, payCode: null, lastResult: null });
    try {
      const result = await withToken(deps, token => deps.service.simulatePayment(token, {
        orderId,
        outcome,
        idempotencyKey: request.key,
      }, signal), signal);
      if (current !== generation) return;
      pending = null;
      orderEpoch += 1;
      set({
        paying: null,
        uncertain: false,
        order: result.order,
        lastResult: result.attempt.outcome === 'SUCCEEDED' ? 'succeeded' : 'failed',
      });
    } catch (error) {
      if (current !== generation || signal.aborted) return;
      const kind = errorKind(error);
      const code = errorCode(error);
      if (kind === 'timeout' || kind === 'network-error' || kind === 'server-error') {
        // ไม่รู้ผล: ตรวจสถานะจริงจาก server ก่อน ห้ามแสดงว่าสำเร็จจากการคาดเดา
        set({ paying: null, payError: kind, payCode: code, uncertain: true });
        const latest = await fetchOrder('refresh');
        if (current !== generation) return;
        if (latest?.paymentStatus === 'PAID') {
          pending = null;
          set({ uncertain: false, payError: null, lastResult: 'succeeded' });
        }
        return;
      }
      pending = null;
      set({ paying: null, uncertain: false, payError: kind, payCode: code });
      // จ่ายไปแล้วจากคำขออื่น หรือ key ถูกใช้ไปแล้ว ให้ดึงสถานะล่าสุดมาแสดง
      if (kind === 'conflict') await fetchOrder('refresh');
    } finally {
      done();
    }
  };

  const cancel = async () => {
    const { owner, orderId, order } = state;
    if (!owner || orderId === null || !order) return;
    if (state.cancelling || state.paying) return;
    // สิทธิ์ยกเลิกตัดสินที่ server เสมอ หน้าจอไม่คิดเงื่อนไขเอง
    if (!order.canCancel) return;

    const current = generation;
    const { signal, done } = track();
    set({ cancelling: true, cancelError: null, cancelCode: null });
    try {
      const updated = await withToken(deps, token => deps.service.cancelOrder(token, orderId, signal), signal);
      if (current !== generation) return;
      // ยกเลิกแล้วคำขอจ่ายที่ค้างอยู่ใช้ไม่ได้อีก ล้างทิ้งพร้อมกัน
      pending = null;
      // การอ่านที่ยังค้างอยู่ต้องทับผลการยกเลิกนี้ไม่ได้
      orderEpoch += 1;
      set({
        cancelling: false,
        order: updated,
        payError: null,
        payCode: null,
        lastResult: null,
        uncertain: false,
      });
    } catch (error) {
      if (current !== generation || signal.aborted) return;
      const kind = errorKind(error);
      set({ cancelling: false, cancelError: kind, cancelCode: errorCode(error) });
      // สถานะเปลี่ยนไปก่อนแล้ว (เช่น จ่ายเงินสำเร็จพอดี) ให้ดึงของจริงมาแสดง
      if (kind === 'conflict') await fetchOrder('refresh');
    } finally {
      done();
    }
  };

  return {
    getSnapshot: () => state,

    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },

    setOwner(owner: string | null) {
      if (state.owner === owner) return;
      reset({ owner });
    },

    /** เปิดหน้ารายละเอียด ถ้าเป็น Order เดิมจะรีเฟรช ไม่ล้างผลการจ่ายที่ค้างอยู่ */
    open(orderId: number) {
      if (!state.owner) return Promise.resolve();
      if (state.orderId === orderId && state.order) return fetchOrder('refresh');
      reset({ owner: state.owner, orderId });
      return fetchOrder('load');
    },

    refresh() {
      if (state.loading || state.refreshing) return Promise.resolve();
      return fetchOrder(state.order ? 'refresh' : 'load').then(() => undefined);
    },

    pay,

    cancel,

    /** ลองส่งคำขอที่ไม่รู้ผลอีกครั้งด้วย key เดิม */
    retryUncertain() {
      if (!pending || !state.uncertain) return Promise.resolve();
      return pay(pending.outcome);
    },

    async loadReceipt() {
      const { owner, orderId } = state;
      if (!owner || orderId === null || state.receiptLoading) return;
      const current = generation;
      const { signal, done } = track();
      set({ receiptLoading: true, receiptError: null });
      try {
        const receipt = await withToken(deps, token => deps.service.getReceipt(token, orderId, signal), signal);
        if (current === generation) set({ receipt, receiptLoading: false });
      } catch (error) {
        if (current === generation && !signal.aborted) {
          set({ receiptLoading: false, receiptError: errorKind(error) });
        }
      } finally {
        done();
      }
    },
  };
}

export type OrderDetailStore = ReturnType<typeof createOrderDetailStore>;
