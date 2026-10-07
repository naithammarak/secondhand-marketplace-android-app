import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/auth/auth-provider';
import { useInspectionApi } from '@/inspections/use-inspection-api';
import type { OrderDetail } from '@/services/order-service';
import { describeActionError, type ActionFailure } from './action-errors';
import { useFulfillmentPort } from './fulfillment-binding';
import {
  parseDelivery, parseHistory, parseResultWindow, type DeliveryView, type FulfillmentPort, type HistoryPage, type ResultWindow,
} from './order-journey';

/** Statuses after which the Buyer result endpoint can have data. */
const RESULT_STATUSES = new Set(['RESULT_NOTIFIED', 'SHIPPING_TO_BUYER', 'DELIVERED_PENDING_BUYER', 'DELIVERY_DISPUTED', 'RETURNED_TO_SELLER', 'COMPLETED', 'REFUNDED']);
const PAID_STATUSES = new Set(['WAITING_SELLER_SHIP', 'SHIPPING_TO_CENTER', 'RECEIVED_AT_CENTER', 'INSPECTING', ...RESULT_STATUSES]);

/** A reload carries logical ownership, not its changing callback identity. */
type JourneyReload = (() => Promise<void>) & { scope: string | null };

/** Each committed visit has its own lifetime, including A → B → A. */
function useScopeLifetime(scope: string | null) {
  const epoch = useMemo(() => ({ scope }), [scope]);
  const active = useRef<typeof epoch | null>(epoch);
  useLayoutEffect(() => {
    active.current = epoch;
    return () => { active.current = null; };
  }, [epoch]);
  const isCurrent = useCallback(() => active.current === epoch, [epoch]);
  return { epoch, isCurrent };
}

export type JourneyData = {
  delivery: DeliveryView | null;
  history: HistoryPage | null;
  result: ResultWindow | null;
  rawResult: unknown;
  loading: boolean;
  failure: ActionFailure | null;
  /** No shipping client bound in this build (before E_BASE) — show the unavailable state. */
  unavailable: boolean;
  reload: JourneyReload;
};

/**
 * Loads delivery/history/result for one account+order. A response that arrives after an
 * account switch or for an older request is dropped, so account A data never renders for B.
 */
export function useOrderJourney(order: OrderDetail | null): JourneyData {
  const auth = useAuth();
  const port = useFulfillmentPort();
  const inspection = useInspectionApi();
  const owner = auth.session?.user.id ?? null;
  const [state, setState] = useState<Omit<JourneyData, 'reload' | 'unavailable'> & { scope: string | null }>({ scope: null, delivery: null, history: null, result: null, rawResult: null, loading: false, failure: null });
  const generation = useRef(0);
  const invalidate = useCallback(() => { generation.current++; }, []);
  const scope = order && owner ? `${owner}:${order.id}` : null;
  const lastScope = useRef<string | null>(null);
  const { isCurrent } = useScopeLifetime(scope);
  const status = order?.status ?? null;
  const orderId = order?.id ?? null;
  const buyer = order?.viewerRole === 'buyer';

  const reload = useCallback(async () => {
    // Captured callbacks must no-op BEFORE they can invalidate the active request.
    if (!isCurrent() || orderId === null || status === null || !owner) return;
    const order = { id: orderId, status };
    const current = ++generation.current;
    setState(previous => ({ ...previous, loading: true, failure: null }));
    try {
      const wantsDelivery = !!port && PAID_STATUSES.has(order.status);
      const [deliveryRaw, historyRaw, resultRaw] = await Promise.all([
        wantsDelivery ? port.getDelivery(order.id) : Promise.resolve(null),
        wantsDelivery ? port.getHistory(order.id).catch(() => null) : Promise.resolve(null),
        buyer && RESULT_STATUSES.has(order.status)
          ? inspection.call(token => inspection.service.getBuyerResult(token, order.id)).catch((error: unknown) => {
            // inspection_not_ready is a normal empty state, not a failure.
            if (typeof error === 'object' && error !== null && (error as { status?: number }).status === 404) return null;
            throw error;
          })
          : Promise.resolve(null),
      ]);
      if (!isCurrent() || generation.current !== current) return;
      setState({
        scope,
        delivery: deliveryRaw ? parseDelivery(deliveryRaw) : null,
        history: historyRaw ? parseHistory(historyRaw) : null,
        result: resultRaw ? parseResultWindow(resultRaw) : null,
        rawResult: resultRaw,
        loading: false, failure: null,
      });
    } catch (error) {
      if (!isCurrent() || generation.current !== current) return;
      setState(previous => ({ ...previous, loading: false, failure: describeActionError(error) }));
    }
  }, [orderId, status, owner, port, inspection, buyer, scope, isCurrent]);

  useEffect(() => {
    if (scope !== lastScope.current) {
      // New account or order: forget everything from the previous scope before loading.
      lastScope.current = scope;
      generation.current++;
      setState({ scope, delivery: null, history: null, result: null, rawResult: null, loading: false, failure: null });
    }
    void reload();
    return invalidate;
  }, [scope, reload, invalidate]);

  // Effects run after render: never expose the preceding account/order in that gap.
  const visible = state.scope === scope ? state : { delivery: null, history: null, result: null, rawResult: null, loading: !!scope, failure: null };
  const scopedReload = useMemo(() => Object.assign(reload, { scope }), [reload, scope]);
  return { ...visible, unavailable: !port, reload: scopedReload };
}

export type JourneyCommand = {
  busy: boolean;
  failure: ActionFailure | null;
  /** Run a command; returns true when the server committed it. Refetches afterwards only while its account/Order is current. */
  run(identity: string, operation: (port: FulfillmentPort, key: string) => Promise<unknown>): Promise<boolean>;
  clear(): void;
};

/**
 * One Idempotency-Key per command identity (action + canonical payload). The key is
 * kept after an uncertain outcome (network/timeout/5xx) so a retry is the same command,
 * and dropped after a definitive answer. Success is shown only after the refetch.
 */
export function useJourneyCommand(
  refetch: (() => Promise<void>) & { scope?: string | null },
  newKey: () => string = Crypto.randomUUID,
  orderId?: number | null,
): JourneyCommand {
  const port = useFulfillmentPort();
  const owner = useAuth().session?.user.id ?? null;
  // Direct journey.reload carries its scope; composed refreshes pass the route ID.
  const scope = !owner ? null : orderId !== undefined
    ? (orderId === null ? null : `${owner}:${orderId}`)
    : (refetch.scope !== undefined ? refetch.scope : owner);
  const { epoch, isCurrent } = useScopeLifetime(scope);
  const pending = useRef({ epoch, keys: new Map<string, string>(), locked: false });
  useLayoutEffect(() => {
    if (pending.current.epoch !== epoch) pending.current = { epoch, keys: new Map<string, string>(), locked: false };
  }, [epoch]);
  const [state, setState] = useState<{ epoch: typeof epoch; busy: boolean; failure: ActionFailure | null }>({ epoch, busy: false, failure: null });
  const latestRefetch = useRef(refetch);
  useLayoutEffect(() => { latestRefetch.current = refetch; }, [refetch]);
  const run = useCallback(async (identity: string, operation: (port: FulfillmentPort, key: string) => Promise<unknown>) => {
    const visit = pending.current;
    if (!isCurrent() || !scope || !port || visit.epoch !== epoch || visit.locked) return false;
    visit.locked = true;
    setState({ epoch, busy: true, failure: null });
    const key = visit.keys.get(identity) ?? newKey();
    visit.keys.set(identity, key);
    let committed = false;
    try {
      await operation(port, key);
      visit.keys.delete(identity);
      committed = true; // The original server transaction remains truthful after navigation.
    } catch (error) {
      const described = describeActionError(error);
      if (described.next !== 'retry-same') visit.keys.delete(identity);
      if (isCurrent()) setState({ epoch, busy: true, failure: described });
    } finally {
      // Rerenders can replace composed callbacks without changing logical ownership.
      // Never invoke an obsolete account/Order refresh, including after unmount.
      if (isCurrent()) await latestRefetch.current().catch(() => undefined);
      visit.locked = false; // This belongs to this visit, never a newer visit's lock/key.
      if (isCurrent()) setState(previous => ({ ...previous, busy: false }));
    }
    return committed;
  }, [port, scope, epoch, isCurrent, newKey]);
  const clear = useCallback(() => {
    if (isCurrent()) setState(previous => ({ ...previous, failure: null }));
  }, [isCurrent]);
  const visible = state.epoch === epoch ? state : { busy: false, failure: null };
  return useMemo(() => ({ busy: visible.busy, failure: visible.failure, run, clear }), [visible.busy, visible.failure, run, clear]);
}
