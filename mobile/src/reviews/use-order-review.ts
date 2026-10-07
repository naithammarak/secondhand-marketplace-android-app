import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Crypto from 'expo-crypto';
import { useAuth } from '@/auth/auth-provider';
import { getSupabaseClient } from '@/auth/supabase-client';
import { withTokenRefresh } from '@/auth/session-account';
import { createReviewService, type OrderReview, type ReviewInput } from '@/services/review-service';

export function useOrderReview(orderId: number | null) {
  const auth = useAuth();
  const owner = auth.session?.user.id ?? null;
  const identity = `${owner}:${orderId}`;
  const active = useRef(identity); active.current = identity;
  const epoch = useRef(0);
  const flight = useRef<AbortController | null>(null);
  const attempt = useRef<{ key: string; input: ReviewInput } | null>(null);
  const service = useMemo(() => createReviewService({ baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL }), []);
  const [state, setState] = useState<{ identity: string; data: OrderReview | null; busy: boolean; error: string | null }>({ identity, data: null, busy: false, error: null });
  const run = useCallback(async (input?: ReviewInput) => {
    if (!owner || !orderId || flight.current) return false;
    const controller = new AbortController(); flight.current = controller;
    const generation = epoch.current;
    const current = () => active.current === identity && epoch.current === generation && !controller.signal.aborted;
    setState(old => ({ identity, data: old.identity === identity ? old.data : null, busy: true, error: null }));
    try {
      const supabase = getSupabaseClient();
      const session = (await supabase?.auth.getSession())?.data.session;
      if (!current() || session?.user.id !== owner) throw new Error('account_changed');
      if (input && !attempt.current) attempt.current = { key: Crypto.randomUUID(), input: { rating: input.rating, comment: input.comment.trim() } };
      // Freeze an uncertain attempt: retry the exact payload and key until read back.
      const command = input ? attempt.current : null;
      const execute = async (token: string): Promise<OrderReview> => {
        if (!current()) throw new Error('account_changed');
        if (!command) return service.get(token, orderId, controller.signal);
        const review = await service.submit(token, orderId, command.input, command.key, controller.signal);
        return { order_id: orderId, can_review: false, review };
      };
      const data = await withTokenRefresh({ accessToken: session.access_token, request: execute,
        refresh: async () => {
          const refreshed = await supabase!.auth.refreshSession();
          return current() && !refreshed.error && refreshed.data.session?.user.id === owner
            ? { accessToken: refreshed.data.session.access_token } : null;
        },
      });
      if (!current()) return false;
      setState({ identity, data, busy: false, error: null });
      return true;
    } catch (error) {
      if (!current()) return false;
      const failure = error as { code?: string; status?: number };
      if (failure.status === 422) attempt.current = null;
      const message = failure.code === 'review_already_exists' ? 'มีรีวิวแล้ว กรุณาโหลดรีวิวอีกครั้ง'
        : failure.code === 'order_not_reviewable' ? 'คำสั่งซื้อนี้ยังไม่สามารถรีวิวได้'
        : 'ส่งหรือโหลดรีวิวไม่สำเร็จ กรุณาลองใหม่';
      setState(old => ({ ...old, busy: false, error: message }));
      return false;
    } finally { if (flight.current === controller) flight.current = null; }
  }, [identity, orderId, owner, service]);

  useEffect(() => {
    epoch.current += 1; flight.current?.abort(); flight.current = null; attempt.current = null;
    setState({ identity, data: null, busy: !!owner && !!orderId, error: null });
    if (owner && orderId) void run();
    return () => { epoch.current += 1; flight.current?.abort(); flight.current = null; };
  }, [identity, orderId, owner, run]);
  return { data: state.identity === identity ? state.data : null, busy: state.identity !== identity || state.busy,
    error: state.identity === identity ? state.error : null, lockedDraft: !!attempt.current,
    reload: () => run(), submit: (input: ReviewInput) => run(input) };
}
