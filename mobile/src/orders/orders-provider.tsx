import * as Crypto from 'expo-crypto';
import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useState,
  useSyncExternalStore } from 'react';

import { useAuth } from '@/auth/auth-provider';
import { getSupabaseClient } from '@/auth/supabase-client';
import { createOrderService } from '@/services/order-service';
import { createCheckoutStore, type CheckoutStore } from './checkout-store';
import { createOrderDetailStore, type OrderDetailStore } from './order-detail-store';
import { createOrdersListStore, type OrdersListStore } from './orders-list-store';
import type { TokenSource } from './order-session';

type OrdersContextValue = {
  checkout: CheckoutStore;
  detail: OrderDetailStore;
  list: OrdersListStore;
};

const OrdersContext = createContext<OrdersContextValue | null>(null);

function createService() {
  try {
    return createOrderService({ baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL });
  } catch {
    // ค่า API ใช้ไม่ได้ ให้บริการตอบว่ายังไม่พร้อมแทนการพังทั้งแอป
    return createOrderService({});
  }
}

export function OrdersProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [stores] = useState<OrdersContextValue>(() => {
    const service = createService();
    // อ่าน token ล่าสุดจาก Supabase ทุกครั้ง จึงไม่ค้าง token ของบัญชีก่อนหน้า
    const tokens: TokenSource = {
      getAccessToken: async () => {
        if (!supabase) return null;
        const { data } = await supabase.auth.getSession();
        return data.session?.access_token ?? null;
      },
      refreshAccessToken: async () => {
        if (!supabase) return null;
        const { data, error } = await supabase.auth.refreshSession();
        return error || !data.session ? null : data.session.access_token;
      },
    };
    const newIdempotencyKey = () => Crypto.randomUUID();
    return {
      checkout: createCheckoutStore({ ...tokens, service, newIdempotencyKey }),
      detail: createOrderDetailStore({ ...tokens, service, newIdempotencyKey }),
      list: createOrdersListStore({ ...tokens, service }),
    };
  });

  const owner = auth.session?.user.id ?? null;

  useEffect(() => {
    // ออกจากระบบหรือสลับบัญชี: ล้างรายการ รายละเอียด ใบเสร็จ และที่อยู่ที่กรอกค้างทั้งหมด
    stores.checkout.setOwner(owner);
    stores.detail.setOwner(owner);
    stores.list.setOwner(owner);
  }, [owner, stores]);

  return <OrdersContext.Provider value={stores}>{children}</OrdersContext.Provider>;
}

function useStores() {
  const stores = useContext(OrdersContext);
  if (!stores) throw new Error('Order hooks must be used within OrdersProvider');
  return stores;
}

export function useCheckout() {
  const { checkout } = useStores();
  const state = useSyncExternalStore(checkout.subscribe, checkout.getSnapshot, checkout.getSnapshot);
  return { state, store: checkout };
}

export function useOrderDetail() {
  const { detail } = useStores();
  const state = useSyncExternalStore(detail.subscribe, detail.getSnapshot, detail.getSnapshot);
  return { state, store: detail };
}

export function useOrdersList() {
  const { list } = useStores();
  const state = useSyncExternalStore(list.subscribe, list.getSnapshot, list.getSnapshot);
  return { state, store: list };
}
