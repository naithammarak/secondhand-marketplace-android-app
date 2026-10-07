import { createContext, type PropsWithChildren, useContext, useEffect, useMemo,
  useState, useSyncExternalStore } from 'react';

import { useAuth } from '@/auth/auth-provider';
import { getSupabaseClient } from '@/auth/supabase-client';
import { createVerificationService } from '@/services/verification-service';
import { createVerificationStore, type VerificationStore } from './verification-store';

const VerificationContext = createContext<VerificationStore | null>(null);

function createService() {
  try {
    return createVerificationService({ baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL });
  } catch {
    // ค่า API ที่ตั้งไว้ใช้ไม่ได้ ให้บริการตอบว่ายังไม่พร้อมแทนการพังทั้งแอป
    return createVerificationService({});
  }
}

export function VerificationProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [store] = useState(() => createVerificationStore({
    service: createService(),
    // อ่าน token ปัจจุบันจาก Supabase ทุกครั้ง จึงไม่ค้าง token ของบัญชีก่อนหน้า
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
  }));

  const owner = auth.session?.user.id ?? null;
  const isSeller = auth.account?.source === 'backend' && (auth.account.role === 'BUYER' || auth.account.role === 'SELLER') && !auth.accountError;

  useEffect(() => {
    // ออกจากระบบหรือเปลี่ยนบัญชีแล้วข้อมูลคำขอของบัญชีก่อนหน้าต้องหายไปทันที
    store.setOwner(owner);
  }, [owner, store]);

  useEffect(() => {
    if (!owner || !isSeller) return;
    // อ่านสถานะจาก backend ทุกครั้งที่เปิดแอป จึงไม่มีสถานะค้างจากเครื่อง
    void store.load();
  }, [isSeller, owner, store]);

  return <VerificationContext.Provider value={store}>{children}</VerificationContext.Provider>;
}

export function useVerification() {
  const store = useContext(VerificationContext);
  if (!store) throw new Error('useVerification must be used within VerificationProvider');
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { state, store };
}
