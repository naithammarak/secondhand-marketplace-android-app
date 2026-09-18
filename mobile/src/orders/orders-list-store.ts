import type { OrderErrorKind, OrderListItem, OrderService } from '../services/order-service';
import { errorKind, withToken, type TokenSource } from './order-session.ts';

export const ORDER_PAGE_SIZE = 20;

export type OrdersListState = {
  owner: string | null;
  items: OrderListItem[];
  total: number;
  loaded: boolean;
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  error: OrderErrorKind | null;
};

export const initialOrdersListState: OrdersListState = {
  owner: null,
  items: [],
  total: 0,
  loaded: false,
  loading: false,
  refreshing: false,
  loadingMore: false,
  error: null,
};

export type OrdersListStoreDeps = TokenSource & { service: OrderService; pageSize?: number };

export function createOrdersListStore(deps: OrdersListStoreDeps) {
  const pageSize = deps.pageSize ?? ORDER_PAGE_SIZE;
  let state: OrdersListState = initialOrdersListState;
  let generation = 0;
  let controller: AbortController | undefined;
  const listeners = new Set<() => void>();

  const emit = () => listeners.forEach(listener => listener());
  const set = (patch: Partial<OrdersListState>) => {
    state = { ...state, ...patch };
    emit();
  };

  const busy = () => state.loading || state.refreshing || state.loadingMore;

  const fetchPage = async (mode: 'load' | 'refresh' | 'more') => {
    if (!state.owner) return;
    const current = ++generation;
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    const offset = mode === 'more' ? state.items.length : 0;
    set({
      loading: mode === 'load',
      refreshing: mode === 'refresh',
      loadingMore: mode === 'more',
      error: null,
    });
    try {
      const page = await withToken(deps, token => deps.service.listOrders(token, { limit: pageSize, offset }, signal), signal);
      if (current !== generation) return;
      // หน้าถัดไปอาจซ้อนกับหน้าก่อนเมื่อมี Order ใหม่ระหว่างเลื่อน จึงตัดรายการซ้ำตาม id
      const merged = mode === 'more' ? [...state.items] : [];
      const seen = new Set(merged.map(item => item.id));
      for (const item of page.items) if (!seen.has(item.id)) { merged.push(item); seen.add(item.id); }
      set({ items: merged, total: page.total, loaded: true, loading: false, refreshing: false, loadingMore: false });
    } catch (error) {
      if (current !== generation || signal.aborted) return;
      set({ loading: false, refreshing: false, loadingMore: false, error: errorKind(error) });
    }
  };

  return {
    getSnapshot: () => state,

    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },

    /** ออกจากระบบหรือสลับบัญชีแล้วรายการของบัญชีเดิมต้องหายทันที */
    setOwner(owner: string | null) {
      if (state.owner === owner) return;
      generation += 1;
      controller?.abort();
      controller = undefined;
      state = { ...initialOrdersListState, owner };
      emit();
    },

    load() {
      if (busy()) return Promise.resolve();
      return fetchPage(state.loaded ? 'refresh' : 'load');
    },

    refresh() {
      if (state.refreshing || state.loading) return Promise.resolve();
      return fetchPage(state.loaded ? 'refresh' : 'load');
    },

    loadMore() {
      if (busy() || !state.loaded || state.items.length >= state.total) return Promise.resolve();
      return fetchPage('more');
    },

    hasMore: () => state.loaded && state.items.length < state.total,
  };
}

export type OrdersListStore = ReturnType<typeof createOrdersListStore>;
