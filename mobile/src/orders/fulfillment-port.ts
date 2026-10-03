import type { createFulfillmentService } from '../services/fulfillment-service';
import type { FulfillmentPort } from './order-journey';

type Service = ReturnType<typeof createFulfillmentService>;
type AuthorizedCall = <T>(request: (token: string) => Promise<T>) => Promise<T>;

/** One adapter shared by production and integration QA; authorization is read per call. */
export function createFulfillmentPort(service: Service, call: AuthorizedCall): FulfillmentPort {
  return {
    getDelivery: (id, signal) => call(token => service.getDelivery(token, id, signal)),
    getHistory: (id, signal) => call(token => service.getHistory(token, id, {}, signal)),
    getReturnAddress: (id, signal) => call(token => service.getReturnAddress(token, id, signal)),
    saveReturnAddress: (id, address, key) => call(token => service.saveReturnAddress(token, id, address, key)),
    confirmReceipt: (id, key) => call(token => service.confirmReceipt(token, id, key)),
    reportNotReceived: (id, reason, key) => call(token => service.reportNotReceived(token, id, reason, key)),
    confirmReturn: (id, key) => call(token => service.confirmReturn(token, id, key)),
  };
}
