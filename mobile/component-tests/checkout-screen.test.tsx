import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { CheckoutScreen } from '@/components/checkout-screen';
import { initialCheckoutState } from '@/orders/checkout-store';
import { createOrderDetailStore } from '@/orders/order-detail-store';
import { OrderServiceError } from '@/services/order-service';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => jest.requireActual('react').useEffect(callback, [callback]),
  Redirect: () => null,
  useRouter: () => ({ push: mockPush, back: mockBack, replace: mockReplace }),
}));

jest.mock('@/auth/auth-provider', () => ({
  useAuth: () => ({ session: { user: { id: 'buyer-test' } }, initializing: false }),
}));

const mockCheckoutStore = {
  getSnapshot: () => mockCheckoutState,
  open: jest.fn().mockResolvedValue(undefined),
  close: jest.fn(),
  submit: jest.fn(),
  clearFieldError: jest.fn(),
  reloadQuote: jest.fn(),
};

let mockCheckoutState: any;
let mockDetailStore: ReturnType<typeof createOrderDetailStore>;
let mockGetOrder: jest.Mock;
let mockSimulatePayment: jest.Mock;

jest.mock('@/orders/orders-provider', () => ({
  useCheckout: () => ({ state: mockCheckoutState, store: mockCheckoutStore }),
  useOrderDetail: () => {
    const React = jest.requireActual('react');
    const state = React.useSyncExternalStore(
      mockDetailStore.subscribe,
      mockDetailStore.getSnapshot,
      mockDetailStore.getSnapshot,
    );
    return { state, store: mockDetailStore };
  },
}));

const quote = {
  product: { id: 7, name: 'กระเป๋าหนังแท้', condition: 'LIKE_NEW', size: 'M', imageUrl: null },
  currency: 'THB',
  itemPrice: '3850.00',
  shippingFee: '50.00',
  inspectionFee: '100.00',
  totalAmount: '4000.00',
};

const unpaidOrder = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  status: 'WAITING_PAYMENT',
  paymentStatus: 'UNPAID',
  viewerRole: 'buyer',
  product: quote.product,
  amounts: {
    currency: 'THB', itemPrice: '3850.00', shippingFee: '50.00', inspectionFee: '100.00',
    totalAmount: '4000.00', commissionFee: null, sellerPayout: null,
  },
  shippingAddress: null,
  lastPaymentAttempt: null,
  paidAt: null,
  receiptNo: null,
  canPay: true,
  canCancel: true,
  expiresAt: '2026-10-01T00:00:00Z',
  cancelledAt: null,
  cancelReason: null,
  createdAt: null,
  ...extra,
});

const paidOrder = (id: number) => unpaidOrder(id, {
  status: 'WAITING_SELLER_SHIP',
  paymentStatus: 'PAID',
  receiptNo: `RC-${id}`,
  canPay: false,
  canCancel: false,
});

const paymentAttempt = (outcome: 'SUCCEEDED' | 'FAILED') => ({
  id: 1,
  outcome,
  amount: '4000.00',
  createdAt: null,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockCheckoutState = {
    ...initialCheckoutState,
    owner: 'buyer-test',
    productId: 7,
    quote,
  };
  mockGetOrder = jest.fn(async (_token, orderId) => unpaidOrder(orderId));
  mockSimulatePayment = jest.fn(async (_token, input) => ({
    attempt: paymentAttempt(input.outcome === 'SUCCESS' ? 'SUCCEEDED' : 'FAILED'),
    order: input.outcome === 'SUCCESS' ? paidOrder(input.orderId) : unpaidOrder(input.orderId),
  }));
  let idempotencyKey = 0;
  mockDetailStore = createOrderDetailStore({
    getAccessToken: async () => 'test-token',
    refreshAccessToken: async () => 'fresh-test-token',
    newIdempotencyKey: () => `checkout-test-${++idempotencyKey}`,
    service: {
      getOrder: (...args: unknown[]) => mockGetOrder(...args),
      simulatePayment: (...args: unknown[]) => mockSimulatePayment(...args),
      getReceipt: async (_token: string, orderId: number) => ({ receiptNo: `RC-${orderId}`, orderId }),
      cancelOrder: async () => unpaidOrder(42),
    } as any,
  });
  mockDetailStore.setOwner('buyer-test');
});

test('renders checkout with simulation language, product, address, and price summary', () => {
  render(<CheckoutScreen productId={7} />);
  expect(screen.getByText('กระเป๋าหนังแท้')).toBeTruthy();
  expect(screen.getByText('สภาพเหมือนใหม่')).toBeTruthy();
  expect(screen.getByText('ขนาด M')).toBeTruthy();
  expect(screen.getByText('ที่อยู่จัดส่ง')).toBeTruthy();
  expect(screen.getByText('ใช้ที่อยู่ล่าสุด')).toBeTruthy();
  expect(screen.getByText('QR สำหรับการสาธิต')).toBeTruthy();
  expect(screen.queryByText('สแกนจ่ายด้วยแอปธนาคารใดก็ได้')).toBeNull();
  expect(screen.getByText('สรุปยอด')).toBeTruthy();
  expect(screen.getByText('สินค้าจะถูกตรวจสภาพก่อนส่งถึงคุณ')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'ชำระเงิน' })).toBeTruthy();
});

test('quick-fill button populates address fields', async () => {
  render(<CheckoutScreen productId={7} />);
  fireEvent.press(screen.getByRole('button', { name: 'ใช้ที่อยู่ล่าสุด' }));
  await waitFor(() => {
    expect(screen.getByDisplayValue('สมชาย ใจดี')).toBeTruthy();
    expect(screen.getByDisplayValue('0812345678')).toBeTruthy();
    expect(screen.getByDisplayValue('128/9 ซอยสุขุมวิท 39')).toBeTruthy();
  });
});

test('submitting order invokes store.submit with form values', () => {
  render(<CheckoutScreen productId={7} />);
  fireEvent.press(screen.getByRole('button', { name: 'ใช้ที่อยู่ล่าสุด' }));
  fireEvent.press(screen.getByRole('button', { name: 'ชำระเงิน' }));
  expect(mockCheckoutStore.submit).toHaveBeenCalledWith(expect.objectContaining({
    recipientName: 'สมชาย ใจดี',
    phone: '0812345678',
    postalCode: '10110',
  }));
});

test('pay later button navigates to the order detail screen', () => {
  mockCheckoutState.createdOrderId = 42;
  render(<CheckoutScreen productId={7} />);
  expect(screen.getByText('ภาพ QR นี้เป็นภาพประกอบเท่านั้นและสแกนไม่ได้')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'ชำระภายหลัง' }));
  expect(mockReplace).toHaveBeenCalledWith({ pathname: '/orders/[orderId]', params: { orderId: '42' } });
});

test('only a same-owner server PAID result navigates to the receipt', async () => {
  mockCheckoutState.createdOrderId = 42;
  render(<CheckoutScreen productId={7} />);
  fireEvent.press(screen.getByRole('button', { name: 'จำลองจ่ายสำเร็จ' }));
  await waitFor(() => {
    expect(mockSimulatePayment).toHaveBeenCalledWith(
      'test-token', expect.objectContaining({ orderId: 42, outcome: 'SUCCESS' }), expect.any(AbortSignal),
    );
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/receipt/[orderId]', params: { orderId: '42' } });
  });
  expect(mockDetailStore.getSnapshot().order?.paymentStatus).toBe('PAID');
});

test('resolved FAILED server result stays on checkout and shows the actual failure', async () => {
  mockCheckoutState.createdOrderId = 42;
  render(<CheckoutScreen productId={7} />);
  fireEvent.press(screen.getByRole('button', { name: 'จำลองจ่ายล้มเหลว' }));
  await waitFor(() => {
    expect(mockDetailStore.getSnapshot().lastResult).toBe('failed');
    expect(screen.getByText('เซิร์ฟเวอร์ยืนยันว่าการจ่ายเงินจำลองไม่สำเร็จ คำสั่งซื้อยังไม่ชำระเงิน')).toBeTruthy();
  });
  expect(mockReplace).not.toHaveBeenCalledWith(expect.objectContaining({ pathname: '/receipt/[orderId]' }));
});

test('an API response that resolves while the order remains UNPAID never opens receipt', async () => {
  mockCheckoutState.createdOrderId = 42;
  mockSimulatePayment.mockResolvedValue({
    attempt: paymentAttempt('SUCCEEDED'),
    order: unpaidOrder(42),
  });
  render(<CheckoutScreen productId={7} />);
  fireEvent.press(screen.getByRole('button', { name: 'จำลองจ่ายสำเร็จ' }));
  await waitFor(() => expect(screen.getByText('เซิร์ฟเวอร์ยังไม่ยืนยันว่าคำสั่งซื้อนี้ชำระเงินแล้ว')).toBeTruthy());
  expect(mockReplace).not.toHaveBeenCalledWith(expect.objectContaining({ pathname: '/receipt/[orderId]' }));
});

test('disabled simulation 403 is rendered from the resolved store error', async () => {
  mockCheckoutState.createdOrderId = 42;
  mockSimulatePayment.mockRejectedValue(new OrderServiceError('unavailable', { code: 'payment_simulation_disabled' }));
  render(<CheckoutScreen productId={7} />);
  fireEvent.press(screen.getByRole('button', { name: 'จำลองจ่ายสำเร็จ' }));
  await waitFor(() => expect(screen.getByText('ระบบจ่ายเงินจำลองปิดอยู่ในสภาพแวดล้อมนี้')).toBeTruthy());
  expect(mockDetailStore.getSnapshot().payError).toBe('unavailable');
  expect(mockReplace).not.toHaveBeenCalledWith(expect.objectContaining({ pathname: '/receipt/[orderId]' }));
});

test('load failure is reported and does not submit a payment', async () => {
  mockCheckoutState.createdOrderId = 42;
  mockGetOrder.mockRejectedValue(new OrderServiceError('network-error'));
  render(<CheckoutScreen productId={7} />);
  fireEvent.press(screen.getByRole('button', { name: 'จำลองจ่ายสำเร็จ' }));
  await waitFor(() => expect(screen.getByText('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่')).toBeTruthy());
  expect(mockSimulatePayment).not.toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalledWith(expect.objectContaining({ pathname: '/receipt/[orderId]' }));
});

test('server-expired and unknown orders remain unpaid without local expiry claims', async () => {
  mockCheckoutState.createdOrderId = 42;
  mockGetOrder.mockResolvedValue(unpaidOrder(42, {
    status: 'CANCELLED', canPay: false, canCancel: false, cancelReason: 'EXPIRED',
  }));
  const view = render(<CheckoutScreen productId={7} />);
  fireEvent.press(screen.getByRole('button', { name: 'จำลองจ่ายสำเร็จ' }));
  await waitFor(() => expect(screen.getByText('คำสั่งซื้อนี้หมดอายุตามสถานะจากเซิร์ฟเวอร์แล้ว')).toBeTruthy());
  expect(mockSimulatePayment).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'จำลองหมดเวลา' })).toBeNull();
  expect(screen.queryByText(/เหลือเวลา/)).toBeNull();
  view.unmount();

  mockGetOrder.mockResolvedValue(unpaidOrder(42, { status: 'UNKNOWN' }));
  mockCheckoutState.createdOrderId = 42;
  render(<CheckoutScreen productId={7} />);
  fireEvent.press(screen.getByRole('button', { name: 'จำลองจ่ายสำเร็จ' }));
  await waitFor(() => expect(screen.getByText('ยังไม่รู้จักสถานะคำสั่งซื้อนี้ กรุณาตรวจสอบในหน้ารายละเอียดคำสั่งซื้อ')).toBeTruthy());
  expect(mockSimulatePayment).not.toHaveBeenCalled();
});

test('timeout reconciled to server PAID can open receipt', async () => {
  mockCheckoutState.createdOrderId = 42;
  mockSimulatePayment.mockRejectedValue(new OrderServiceError('timeout'));
  mockGetOrder.mockImplementation(async (_token, orderId) => (
    mockGetOrder.mock.calls.length === 1 ? unpaidOrder(orderId) : paidOrder(orderId)
  ));
  render(<CheckoutScreen productId={7} />);
  fireEvent.press(screen.getByRole('button', { name: 'จำลองจ่ายสำเร็จ' }));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({ pathname: '/receipt/[orderId]', params: { orderId: '42' } }));
  expect(mockDetailStore.getSnapshot().uncertain).toBe(false);
  expect(mockDetailStore.getSnapshot().order?.paymentStatus).toBe('PAID');
});

test('uncertain payment retry uses the same idempotency key', async () => {
  mockCheckoutState.createdOrderId = 42;
  mockSimulatePayment
    .mockRejectedValueOnce(new OrderServiceError('timeout'))
    .mockResolvedValueOnce({ attempt: paymentAttempt('SUCCEEDED'), order: paidOrder(42) });
  render(<CheckoutScreen productId={7} />);

  fireEvent.press(screen.getByRole('button', { name: 'จำลองจ่ายสำเร็จ' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'ตรวจสอบผลคำขอเดิม ใช้รหัสเดิม' })).toBeTruthy());
  expect(mockDetailStore.getSnapshot().uncertain).toBe(true);

  fireEvent.press(screen.getByRole('button', { name: 'ตรวจสอบผลคำขอเดิม ใช้รหัสเดิม' }));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({ pathname: '/receipt/[orderId]', params: { orderId: '42' } }));
  expect(mockSimulatePayment).toHaveBeenCalledTimes(2);
  expect(mockSimulatePayment.mock.calls[0][1].idempotencyKey).toBe(mockSimulatePayment.mock.calls[1][1].idempotencyKey);
});

test('an account change in the shared store suppresses receipt navigation', async () => {
  mockCheckoutState.createdOrderId = 42;
  mockSimulatePayment.mockImplementation(async () => {
    mockDetailStore.setOwner('buyer-other');
    return { attempt: paymentAttempt('SUCCEEDED'), order: paidOrder(42) };
  });
  render(<CheckoutScreen productId={7} />);
  fireEvent.press(screen.getByRole('button', { name: 'จำลองจ่ายสำเร็จ' }));
  await waitFor(() => expect(mockDetailStore.getSnapshot().owner).toBe('buyer-other'));
  expect(mockReplace).not.toHaveBeenCalledWith(expect.objectContaining({ pathname: '/receipt/[orderId]' }));
});

test('duplicate taps send only one payment request', async () => {
  mockCheckoutState.createdOrderId = 42;
  let finishPayment: (value: unknown) => void = () => undefined;
  mockSimulatePayment.mockImplementation(() => new Promise(resolve => { finishPayment = resolve; }));
  render(<CheckoutScreen productId={7} />);
  fireEvent.press(screen.getByRole('button', { name: 'จำลองจ่ายสำเร็จ' }));
  fireEvent.press(screen.getByRole('button', { name: 'จำลองจ่ายสำเร็จ' }));
  await waitFor(() => expect(mockSimulatePayment).toHaveBeenCalledTimes(1));
  await act(async () => {
    finishPayment({ attempt: paymentAttempt('SUCCEEDED'), order: paidOrder(42) });
  });
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({ pathname: '/receipt/[orderId]', params: { orderId: '42' } }));
});

test('changing checkout product while payment is pending suppresses stale receipt navigation', async () => {
  mockCheckoutState.createdOrderId = 42;
  let finishPayment: (value: unknown) => void = () => undefined;
  mockSimulatePayment.mockImplementation(() => new Promise(resolve => { finishPayment = resolve; }));
  const view = render(<CheckoutScreen productId={7} />);
  fireEvent.press(screen.getByRole('button', { name: 'จำลองจ่ายสำเร็จ' }));
  await waitFor(() => expect(mockSimulatePayment).toHaveBeenCalledTimes(1));
  view.rerender(<CheckoutScreen productId={8} />);
  await act(async () => {
    finishPayment({ attempt: paymentAttempt('SUCCEEDED'), order: paidOrder(42) });
  });
  expect(mockReplace).not.toHaveBeenCalledWith(expect.objectContaining({ pathname: '/receipt/[orderId]' }));
});
