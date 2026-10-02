import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createReviewService, type SellerReviews } from '@/services/review-service';

export function useSellerReviews(sellerId: number | null, enabled = true) {
  const service = useMemo(() => createReviewService({ baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL }), []);
  const active = useRef(sellerId); active.current = sellerId;
  const flight = useRef<AbortController | null>(null);
  const [state, setState] = useState<{ sellerId: number | null; page: SellerReviews | null; busy: boolean; error: boolean }>({ sellerId, page: null, busy: false, error: false });
  const load = useCallback(async (offset = 0) => {
    if (!sellerId || !enabled || flight.current) return;
    const controller = new AbortController(); flight.current = controller;
    setState(old => ({ ...old, busy: true, error: false }));
    try {
      const page = await service.publicList(sellerId, offset, 20, controller.signal);
      if (controller.signal.aborted || active.current !== sellerId) return;
      setState({ sellerId, page, busy: false, error: false });
    } catch {
      if (!controller.signal.aborted && active.current === sellerId) setState(old => ({ ...old, busy: false, error: true }));
    } finally { if (flight.current === controller) flight.current = null; }
  }, [enabled, sellerId, service]);
  useEffect(() => {
    flight.current?.abort(); flight.current = null;
    setState({ sellerId, page: null, busy: !!sellerId && enabled, error: false });
    if (enabled && sellerId) void load();
    return () => { flight.current?.abort(); flight.current = null; };
  }, [sellerId, enabled, load]);
  return { page: state.sellerId === sellerId ? state.page : null, busy: state.sellerId !== sellerId || state.busy,
    error: state.sellerId === sellerId && state.error, load };
}
