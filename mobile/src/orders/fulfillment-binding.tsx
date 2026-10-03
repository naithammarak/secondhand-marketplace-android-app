/**
 * Single binding point between UI1 screens and UI2's shipping client.
 *
 * UI2 owns `services/fulfillment-service.ts` (createFulfillmentService). Until Lead
 * composes E_BASE with that client, no port is bound and the delivery/return sections
 * show an "unavailable" state instead of a private HTTP copy. After E_BASE, bind it in
 * `useBoundFulfillmentPort` only — screens do not change.
 */
import { createContext, useContext, type PropsWithChildren } from 'react';
import type { FulfillmentPort } from './order-journey';

const Override = createContext<FulfillmentPort | null | undefined>(undefined);

/** Tests and visual QA inject a fixture port; production uses the bound client. */
export function FulfillmentPortProvider({ port, children }: PropsWithChildren<{ port: FulfillmentPort | null }>) {
  return <Override.Provider value={port}>{children}</Override.Provider>;
}

function useBoundFulfillmentPort(): FulfillmentPort | null {
  // E_BASE: return an adapter over UI2's createFulfillmentService here, injecting the
  // current account token through useInspectionApi().call and passing idempotency keys through.
  return null;
}

export function useFulfillmentPort(): FulfillmentPort | null {
  const override = useContext(Override);
  const bound = useBoundFulfillmentPort();
  return override === undefined ? bound : override;
}
