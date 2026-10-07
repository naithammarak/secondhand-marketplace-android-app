/** Reviewer-only probes for production journey/command composition. */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { BoundFulfillmentPortProvider } from '@/orders/fulfillment-binding';
import { useJourneyCommand, useOrderJourney } from '@/orders/use-order-journey';
import type { OrderDetail } from '@/services/order-service';

let mockOwner = 'buyer-a';
jest.mock('@/auth/auth-provider', () => ({ useAuth: () => ({ session: { user: { id: mockOwner } } }) }));
const mockInspectionApi = {
  call: (request: (token: string) => Promise<unknown>) => request(mockOwner),
  service: { getBuyerResult: async () => ({ result: 'PASS', can_decide: false }) },
};
let mockFulfillmentApi: any;
jest.mock('@/inspections/use-inspection-api', () => ({
  useInspectionApi: () => mockInspectionApi,
  useFulfillmentApi: () => mockFulfillmentApi,
}));

const order = (id: number) => ({ id, status: 'SHIPPING_TO_BUYER', viewerRole: 'buyer' }) as OrderDetail;
const delivery = (id: number) => ({ order_id: id, order_status: 'SHIPPING_TO_BUYER',
  shipments: [], can_confirm_receipt: true, can_report_missing: true });
function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<unknown>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const wrapper = ({ children }: PropsWithChildren) => <BoundFulfillmentPortProvider>{children}</BoundFulfillmentPortProvider>;

beforeEach(() => {
  mockOwner = 'buyer-a';
  mockFulfillmentApi = { service: {
    getDelivery: async (_token: string, id: number) => delivery(id),
    getHistory: async () => ({ items: [] }),
  }, call: (request: (token: string) => Promise<unknown>) => request(mockOwner) };
});

test('old successful receipt completion cannot replace the newly opened order journey', async () => {
  const pending = deferred();
  mockFulfillmentApi.service.confirmReceipt = () => pending.promise;
  let selectedId = 7;
  const { result, rerender } = renderHook(() => {
    const journey = useOrderJourney(order(selectedId));
    const command = useJourneyCommand(journey.reload, () => 'review-receipt-key-001');
    return { journey, command };
  }, { wrapper });
  await waitFor(() => expect(result.current.journey.delivery?.orderId).toBe(7));
  let completion!: Promise<boolean>;
  act(() => { completion = result.current.command.run('confirm-receipt:7', (port, key) => port.confirmReceipt(7, key)); });
  selectedId = 8;
  rerender({});
  await waitFor(() => expect(result.current.journey.delivery?.orderId).toBe(8));
  await act(async () => { pending.resolve({ order_id: 7 }); await completion; });
  expect(result.current.journey.delivery?.orderId).toBe(8);
  expect(result.current.journey.loading).toBe(false);
});

test('old receipt rejection cannot attach its error to the new order controls', async () => {
  const pending = deferred();
  mockFulfillmentApi.service.confirmReceipt = () => pending.promise;
  let selectedId = 7;
  const { result, rerender } = renderHook(() => {
    const journey = useOrderJourney(order(selectedId));
    const command = useJourneyCommand(journey.reload, () => 'review-receipt-key-002');
    return { journey, command };
  }, { wrapper });
  await waitFor(() => expect(result.current.journey.delivery?.orderId).toBe(7));
  let completion!: Promise<boolean>;
  act(() => { completion = result.current.command.run('confirm-receipt:7', (port, key) => port.confirmReceipt(7, key)); });
  selectedId = 8;
  rerender({});
  await waitFor(() => expect(result.current.journey.delivery?.orderId).toBe(8));
  await act(async () => {
    pending.reject({ status: 409, code: 'receipt_deadline_passed' });
    await completion;
  });
  expect(result.current.command.failure).toBeNull();
  expect(result.current.journey.delivery?.orderId).toBe(8);
});

test('a captured old reload cannot invalidate the active order refresh', async () => {
  let selectedId = 7;
  const { result, rerender } = renderHook(() => useOrderJourney(order(selectedId)), { wrapper });
  await waitFor(() => expect(result.current.delivery?.orderId).toBe(7));
  const oldReload = result.current.reload;
  selectedId = 8;
  rerender({});
  await waitFor(() => expect(result.current.delivery?.orderId).toBe(8));
  await act(async () => { await oldReload(); });
  expect(result.current.delivery?.orderId).toBe(8);
});

test('old mutation refresh cannot show an authorization error for the new healthy account', async () => {
  const pending = deferred();
  mockFulfillmentApi.service.confirmReceipt = () => pending.promise;
  const authorizedFor = (owner: string) => async (request: (token: string) => Promise<unknown>) => {
    if (mockOwner !== owner) throw { status: 401, code: 'unauthorized' };
    return request(owner);
  };
  mockFulfillmentApi.call = authorizedFor(mockOwner);
  let selectedId = 7;
  const { result, rerender } = renderHook(() => {
    const journey = useOrderJourney(order(selectedId));
    const command = useJourneyCommand(journey.reload, () => 'review-receipt-key-003');
    return { journey, command };
  }, { wrapper });
  await waitFor(() => expect(result.current.journey.delivery?.orderId).toBe(7));
  let completion!: Promise<boolean>;
  act(() => { completion = result.current.command.run('confirm-receipt:7', (port, key) => port.confirmReceipt(7, key)); });
  mockOwner = 'buyer-b';
  mockFulfillmentApi = { ...mockFulfillmentApi, call: authorizedFor(mockOwner) };
  selectedId = 8;
  rerender({});
  await waitFor(() => expect(result.current.journey.delivery?.orderId).toBe(8));
  await act(async () => { pending.resolve({ order_id: 7 }); await completion; });
  expect(result.current.journey.failure).toBeNull();
  expect(result.current.journey.delivery?.orderId).toBe(8);
});
