/**
 * Single binding point between UI1 screens and UI2's shipping client.
 *
 * The root provider binds UI2's client using its current-account authorization guard.
 * Fixture providers can override it locally without starting a second HTTP client.
 */
import { createContext, useContext, useMemo, type PropsWithChildren } from 'react';
import { useFulfillmentApi } from '@/inspections/use-inspection-api';
import { createFulfillmentPort } from './fulfillment-port';
import type { FulfillmentPort } from './order-journey';

const Override = createContext<FulfillmentPort | null | undefined>(undefined);

/** Tests and visual QA inject a fixture port; production uses the bound client. */
export function FulfillmentPortProvider({ port, children }: PropsWithChildren<{ port: FulfillmentPort | null }>) {
  return <Override.Provider value={port}>{children}</Override.Provider>;
}

export function BoundFulfillmentPortProvider({ children }: PropsWithChildren) {
  const { service, call } = useFulfillmentApi();
  const port = useMemo(() => createFulfillmentPort(service, call), [service, call]);
  return <FulfillmentPortProvider port={port}>{children}</FulfillmentPortProvider>;
}

export function useFulfillmentPort(): FulfillmentPort | null {
  return useContext(Override) ?? null;
}
