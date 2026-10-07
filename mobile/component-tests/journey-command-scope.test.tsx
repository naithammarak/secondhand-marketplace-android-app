import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { BoundFulfillmentPortProvider } from '@/orders/fulfillment-binding';
import { useJourneyCommand, useOrderJourney } from '@/orders/use-order-journey';
import type { OrderDetail } from '@/services/order-service';

let mockOwner = 'buyer-a';
let mockFulfillmentApi: any;
jest.mock('@/auth/auth-provider', () => ({ useAuth: () => ({ session: { user: { id: mockOwner } } }) }));
const mockInspectionApi = { call: (request: (token: string) => Promise<unknown>) => request(mockOwner), service: { getBuyerResult: async () => ({ result: 'PASS', can_decide: false }) } };
jest.mock('@/inspections/use-inspection-api', () => ({ useInspectionApi: () => mockInspectionApi, useFulfillmentApi: () => mockFulfillmentApi }));
const wrapper = ({ children }: PropsWithChildren) => <BoundFulfillmentPortProvider>{children}</BoundFulfillmentPortProvider>;
const order = (id: number) => ({ id, status: 'SHIPPING_TO_BUYER', viewerRole: 'buyer' }) as OrderDetail;
const delivery = (id: number) => ({ order_id: id, order_status: 'SHIPPING_TO_BUYER', shipments: [] });
function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<unknown>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
beforeEach(() => {
  mockOwner = 'buyer-a';
  mockFulfillmentApi = { call: (request: (token: string) => Promise<unknown>) => request(mockOwner), service: {
    getDelivery: async (_token: string, id: number) => delivery(id), getHistory: async () => ({ items: [] }),
  } };
});

test('a retired run callback cannot start a mutation for a previous Order', async () => {
  let selectedId = 7;
  const { result, rerender } = renderHook(() => {
    const journey = useOrderJourney(order(selectedId));
    return { journey, command: useJourneyCommand(journey.reload) };
  }, { wrapper });
  await waitFor(() => expect(result.current.journey.delivery?.orderId).toBe(7));
  const oldRun = result.current.command.run;
  selectedId = 8; rerender({});
  const operation = jest.fn(async () => ({}));
  await act(async () => { expect(await oldRun('receipt:7', operation)).toBe(false); });
  expect(operation).not.toHaveBeenCalled();
  await waitFor(() => expect(result.current.journey.delivery?.orderId).toBe(8));
});

test('old completion cannot unlock a newer visit or erase its uncertain retry key', async () => {
  const old = deferred(), current = deferred();
  let selectedId = 7;
  let sequence = 0;
  const newKey = jest.fn(() => `scope-key-${++sequence}`);
  const renders: { id: number; busy: boolean }[] = [];
  const { result, rerender } = renderHook(() => {
    const journey = useOrderJourney(order(selectedId));
    const command = useJourneyCommand(journey.reload, newKey);
    renders.push({ id: selectedId, busy: command.busy });
    return { journey, command };
  }, { wrapper });
  await waitFor(() => expect(result.current.journey.delivery?.orderId).toBe(7));
  let oldCompletion!: Promise<boolean>;
  act(() => { oldCompletion = result.current.command.run('same-identity', () => old.promise); });
  selectedId = 8; rerender({});
  expect(renders.find(value => value.id === 8)?.busy).toBe(false);
  let newCompletion!: Promise<boolean>;
  const attemptedKeys: string[] = [];
  act(() => { newCompletion = result.current.command.run('same-identity', (_port, key) => { attemptedKeys.push(key); return current.promise; }); });
  await act(async () => { old.resolve({ committed: true }); expect(await oldCompletion).toBe(true); });
  expect(result.current.command.busy).toBe(true);
  const duplicate = jest.fn(async () => ({}));
  await act(async () => { expect(await result.current.command.run('same-identity', duplicate)).toBe(false); });
  expect(duplicate).not.toHaveBeenCalled();
  await act(async () => { current.reject({ status: 0, code: 'network_error' }); expect(await newCompletion).toBe(false); });
  expect(result.current.command.failure?.next).toBe('retry-same');
  await act(async () => { expect(await result.current.command.run('same-identity', async (_port, key) => { attemptedKeys.push(key); })).toBe(true); });
  expect(attemptedKeys).toEqual(['scope-key-2', 'scope-key-2']);
  expect(newKey).toHaveBeenCalledTimes(2);
});

test('callback identity churn keeps the same lock and key, but uses the current composed refresh', async () => {
  const pending = deferred();
  const firstRefresh = jest.fn(async () => undefined), latestRefresh = jest.fn(async () => undefined);
  let refresh = firstRefresh;
  const newKey = jest.fn(() => 'stable-key-001');
  const { result, rerender } = renderHook(() => {
    const capturedRefresh = refresh;
    return useJourneyCommand(async () => capturedRefresh(), newKey, 7);
  }, { wrapper });
  let completion!: Promise<boolean>;
  const keys: string[] = [];
  act(() => { completion = result.current.run('receipt:7', (_port, key) => { keys.push(key); return pending.promise; }); });
  refresh = latestRefresh; rerender({});
  expect(result.current.busy).toBe(true);
  await act(async () => { expect(await result.current.run('receipt:7', async () => ({}))).toBe(false); });
  await act(async () => { pending.reject({ status: 503 }); await completion; });
  expect(firstRefresh).not.toHaveBeenCalled();
  expect(latestRefresh).toHaveBeenCalledTimes(1);
  refresh = jest.fn(async () => undefined); rerender({});
  await act(async () => { expect(await result.current.run('receipt:7', async (_port, key) => { keys.push(key); })).toBe(true); });
  expect(keys).toEqual(['stable-key-001', 'stable-key-001']);
  expect(newKey).toHaveBeenCalledTimes(1);
});

test('account transition immediately hides old failure and busy before the new read finishes', async () => {
  const next = deferred();
  const observed: { owner: string; failure: unknown; busy: boolean }[] = [];
  const { result, rerender } = renderHook(() => {
    const journey = useOrderJourney(order(7));
    const command = useJourneyCommand(journey.reload);
    observed.push({ owner: mockOwner, failure: command.failure, busy: command.busy });
    return { journey, command };
  }, { wrapper });
  await act(async () => { await result.current.command.run('receipt:7', async () => { throw { status: 409 }; }); });
  expect(result.current.command.failure?.status).toBe(409);
  mockOwner = 'buyer-b';
  mockFulfillmentApi = { ...mockFulfillmentApi, service: { ...mockFulfillmentApi.service, getDelivery: () => next.promise } };
  rerender({});
  expect(observed.filter(value => value.owner === 'buyer-b').every(value => value.failure === null && !value.busy)).toBe(true);
  await act(async () => { next.resolve(delivery(7)); });
});

test('unmount skips late read errors, obsolete refetch and captured commands', async () => {
  const pending = deferred(), lateRead = deferred();
  const refresh = jest.fn(async () => undefined);
  const getDelivery = jest.fn().mockResolvedValueOnce(delivery(7)).mockImplementationOnce(() => lateRead.promise);
  mockFulfillmentApi.service.getDelivery = getDelivery;
  const { result, unmount } = renderHook(() => ({ journey: useOrderJourney(order(7)), command: useJourneyCommand(refresh, undefined, 7) }), { wrapper });
  await waitFor(() => expect(result.current.journey.delivery?.orderId).toBe(7));
  const reload = result.current.journey.reload, run = result.current.command.run;
  let completion!: Promise<boolean>, read!: Promise<void>;
  act(() => { completion = run('receipt:7', () => pending.promise); read = reload(); });
  unmount();
  await act(async () => { pending.resolve({ committed: true }); lateRead.reject({ status: 401 }); expect(await completion).toBe(true); await read; await reload(); });
  expect(refresh).not.toHaveBeenCalled();
  expect(getDelivery).toHaveBeenCalledTimes(2);
  const operation = jest.fn(async () => ({}));
  expect(await run('receipt:7', operation)).toBe(false);
  expect(operation).not.toHaveBeenCalled();
});

test('returning to the same Order cannot reactivate callbacks from its earlier visit', async () => {
  let selectedId = 7;
  const { result, rerender } = renderHook(() => {
    const journey = useOrderJourney(order(selectedId));
    return { journey, command: useJourneyCommand(journey.reload) };
  }, { wrapper });
  await waitFor(() => expect(result.current.journey.delivery?.orderId).toBe(7));
  const oldReload = result.current.journey.reload, oldRun = result.current.command.run;
  const reads = jest.spyOn(mockFulfillmentApi.service, 'getDelivery');
  selectedId = 8; rerender({}); await waitFor(() => expect(result.current.journey.delivery?.orderId).toBe(8));
  selectedId = 7; rerender({}); await waitFor(() => expect(result.current.journey.delivery?.orderId).toBe(7));
  const readCount = reads.mock.calls.length;
  const operation = jest.fn(async () => ({}));
  await act(async () => { await oldReload(); expect(await oldRun('receipt:7', operation)).toBe(false); });
  expect(reads).toHaveBeenCalledTimes(readCount);
  expect(operation).not.toHaveBeenCalled();
});


test('captured old reload does not invalidate the new Order while its read is pending', async () => {
  const next = deferred();
  const getDelivery = jest.fn(async (_token: string, id: number) => id === 8 ? next.promise : delivery(id));
  mockFulfillmentApi.service.getDelivery = getDelivery;
  let selectedId = 7;
  const { result, rerender } = renderHook(() => useOrderJourney(order(selectedId)), { wrapper });
  await waitFor(() => expect(result.current.delivery?.orderId).toBe(7));
  const oldReload = result.current.reload;
  selectedId = 8; rerender({});
  expect(result.current.delivery).toBeNull();
  const reads = getDelivery.mock.calls.length;
  await act(async () => { await oldReload(); next.resolve(delivery(8)); });
  await waitFor(() => expect(result.current.delivery?.orderId).toBe(8));
  expect(result.current.loading).toBe(false);
  expect(getDelivery).toHaveBeenCalledTimes(reads);
});

test('composed refreshes use the explicit route scope and skip obsolete finally callbacks', async () => {
  const pending = deferred();
  const refreshed: number[] = [];
  let selectedId = 7;
  const { result, rerender } = renderHook(() => {
    const capturedId = selectedId;
    return useJourneyCommand(async () => { refreshed.push(capturedId); }, undefined, selectedId);
  }, { wrapper });
  let completion!: Promise<boolean>;
  act(() => { completion = result.current.run('receipt:7', () => pending.promise); });
  selectedId = 8; rerender({});
  expect(result.current.busy).toBe(false);
  await act(async () => { pending.resolve({ committed: true }); expect(await completion).toBe(true); });
  expect(refreshed).toEqual([]);
  await act(async () => { expect(await result.current.run('receipt:8', async () => ({}))).toBe(true); });
  expect(refreshed).toEqual([8]);
});
