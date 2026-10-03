import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

export type JourneyData = {
  delivery: DeliveryView | null;
  history: HistoryPage | null;
  result: ResultWindow | null;
  rawResult: unknown;
  loading: boolean;
  failure: ActionFailure | null;
  /** No shipping client bound in this build (before E_BASE) — show the unavailable state. */
  unavailable: boolean;
  reload(): Promise<void>;
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
  const status = order?.status ?? null;
  const orderId = order?.id ?? null;
  const buyer = order?.viewerRole === 'buyer';

  const reload = useCallback(async () => {
    if (orderId === null || status === null || !owner) return;
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
      if (generation.current !== current) return;
      setState({
        scope,
        delivery: deliveryRaw ? parseDelivery(deliveryRaw) : null,
        history: historyRaw ? parseHistory(historyRaw) : null,
        result: resultRaw ? parseResultWindow(resultRaw) : null,
        rawResult: resultRaw,
        loading: false, failure: null,
      });
    } catch (error) {
      if (generation.current !== current) return;
      setState(previous => ({ ...previous, loading: false, failure: describeActionError(error) }));
    }
  }, [orderId, status, owner, port, inspection, buyer, scope]);

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
  return { ...visible, unavailable: !port, reload };
}

export type JourneyCommand = {
  busy: boolean;
  failure: ActionFailure | null;
  /** Run a command; returns true when the server committed it. Always refetches afterwards. */
  run(identity: string, operation: (port: FulfillmentPort, key: string) => Promise<unknown>): Promise<boolean>;
  clear(): void;
};

/**
 * One Idempotency-Key per command identity (action + canonical payload). The key is
 * kept after an uncertain outcome (network/timeout/5xx) so a retry is the same command,
 * and dropped after a definitive answer. Success is shown only after the refetch.
 */
export function useJourneyCommand(refetch: () => Promise<void>, newKey: () => string = Crypto.randomUUID): JourneyCommand {
  const port = useFulfillmentPort();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ActionFailure | null>(null);
  const keys = useRef(new Map<string, string>());
  const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const run = useCallback(async (identity: string, operation: (port: FulfillmentPort, key: string) => Promise<unknown>) => {
    if (!port || lock.current) return false;
    lock.current = true;
    setBusy(true); setFailure(null);
    const key = keys.current.get(identity) ?? newKey();
    keys.current.set(identity, key);
    let committed = false;
    try {
      await operation(port, key);
      keys.current.delete(identity);
      committed = true;
    } catch (error) {
      const described = describeActionError(error);
      if (described.next !== 'retry-same') keys.current.delete(identity);
      if (alive.current) setFailure(described);
    } finally {
      // Refetch persisted state after every attempt, including ambiguous ones.
      await refetch().catch(() => undefined);
      lock.current = false;
      if (alive.current) setBusy(false);
    }
    return committed;
  }, [port, refetch, newKey]);
  return useMemo(() => ({ busy, failure, run, clear: () => setFailure(null) }), [busy, failure, run]);
}
