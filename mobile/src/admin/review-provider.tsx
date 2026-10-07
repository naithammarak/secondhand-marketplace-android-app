import { createContext, type PropsWithChildren, useContext, useEffect, useMemo,
  useState, useSyncExternalStore } from 'react';

import { useAuth } from '@/auth/auth-provider';
import { getSupabaseClient } from '@/auth/supabase-client';
import { createAdminVerificationService } from '@/services/admin-verification-service';
import { createReviewStore, type ReviewStore } from './review-store';

const ReviewContext = createContext<ReviewStore | null>(null);

function createService() {
  try {
    return createAdminVerificationService({ baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL });
  } catch {
    // ค่า API ที่ตั้งไว้ใช้ไม่ได้ ให้บริการตอบว่ายังไม่พร้อมแทนการพังทั้งแอป
    return createAdminVerificationService({});
  }
}

export function ReviewProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [store] = useState(() => createReviewStore({
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
  const isAdmin = auth.account?.source === 'backend' && auth.account.role === 'ADMIN' && !auth.accountError;

  useEffect(() => {
    // ออกจากระบบหรือเปลี่ยนบัญชีแล้วรายการคำขอของบัญชีก่อนหน้าต้องหายไปทันที
    store.setOwner(isAdmin ? owner : null);
  }, [isAdmin, owner, store]);

  return <ReviewContext.Provider value={store}>{children}</ReviewContext.Provider>;
}

export function useReview() {
  const store = useContext(ReviewContext);
  if (!store) throw new Error('useReview must be used within ReviewProvider');
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { state, store };
}
