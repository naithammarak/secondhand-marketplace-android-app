import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { BoundFulfillmentPortProvider, useFulfillmentPort } from '@/orders/fulfillment-binding';
import { useOrderJourney } from '@/orders/use-order-journey';
import { createFulfillmentService } from '@/services/fulfillment-service';
import type { OrderDetail } from '@/services/order-service';

let mockOwner = 'account-a';
jest.mock('@/auth/auth-provider', () => ({ useAuth: () => ({ session: { user: { id: mockOwner } } }) }));
const mockInspectionApi = { call: jest.fn(), service: { getBuyerResult: jest.fn() } };
let mockFulfillmentApi: any;
jest.mock('@/inspections/use-inspection-api', () => ({
  useInspectionApi: () => mockInspectionApi,
  useFulfillmentApi: () => mockFulfillmentApi,
}));

const view = (id = 7) => ({ order_id: id, order_status: 'SHIPPING_TO_CENTER', shipments: [], can_confirm_return: false });
const order = (id = 7) => ({ id, status: 'SHIPPING_TO_CENTER', viewerRole: 'seller' }) as OrderDetail;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  mockOwner = 'account-a';
  mockFulfillmentApi = { service: {}, call: (request: (token: string) => Promise<unknown>) => request(mockOwner) };
});
const wrapper = ({ children }: PropsWithChildren) => <BoundFulfillmentPortProvider>{children}</BoundFulfillmentPortProvider>;

test('production provider binds the UI2 client to recipient commands without a fixture provider', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  mockFulfillmentApi.service = createFulfillmentService({ baseUrl: 'https://api.test', fetch: async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ order_id: 7 }) } as unknown as Response;
  } });
  const { result } = renderHook(() => useFulfillmentPort(), { wrapper });
  await result.current!.confirmReceipt(7, 'receipt-key-001');
  mockOwner = 'account-b';
  await result.current!.confirmReturn(8, 'return-key-001');
  expect(calls.map(call => [call.url, (call.init.headers as any).Authorization, (call.init.headers as any)['Idempotency-Key']])).toEqual([
    ['https://api.test/orders/7/confirm-receipt', 'Bearer account-a', 'receipt-key-001'],
    ['https://api.test/orders/8/confirm-return', 'Bearer account-b', 'return-key-001'],
  ]);
});

test('journey immediately hides previous account data and drops its late response', async () => {
  const lateA = deferred<unknown>();
  const lateB = deferred<unknown>();
  const getDelivery = jest.fn().mockResolvedValueOnce(view()).mockImplementationOnce(() => lateA.promise).mockImplementationOnce(() => lateB.promise);
  mockFulfillmentApi.service = { getDelivery, getHistory: async () => ({ items: [], offset: 0, limit: 100, has_more: false }) };
  const renders: { owner: string; orderId: number | null }[] = [];
  const { result, rerender } = renderHook(() => {
    const journey = useOrderJourney(order());
    renders.push({ owner: mockOwner, orderId: journey.delivery?.orderId ?? null });
    return journey;
  }, { wrapper });
  await waitFor(() => expect(result.current.delivery?.orderId).toBe(7));
  let reload!: Promise<void>;
  act(() => { reload = result.current.reload(); });
  mockOwner = 'account-b';
  rerender({});
  expect(result.current.delivery).toBeNull();
  await act(async () => { lateA.resolve(view(99)); await reload; });
  expect(result.current.delivery).toBeNull();
  expect(renders.filter(render => render.owner === 'account-b').every(render => render.orderId === null)).toBe(true);
  await act(async () => { lateB.resolve(view()); });
  await waitFor(() => expect(result.current.delivery?.orderId).toBe(7));
});

test('journey drops the old order response when navigating to a new order', async () => {
  const first = deferred<unknown>();
  mockFulfillmentApi.service = { getDelivery: async (_token: string, id: number) => id === 7 ? first.promise : view(8), getHistory: async () => ({ items: [] }) };
  let selectedId = 7;
  const { result, rerender } = renderHook(() => useOrderJourney(order(selectedId)), { wrapper });
  selectedId = 8;
  rerender({});
  await waitFor(() => expect(result.current.delivery?.orderId).toBe(8));
  await act(async () => { first.resolve(view(7)); });
  expect(result.current.delivery?.orderId).toBe(8);
});
