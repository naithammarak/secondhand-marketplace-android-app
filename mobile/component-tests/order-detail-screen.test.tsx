import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { OrderDetailScreen } from '@/components/order-detail-screen';
import { initialOrderDetailState } from '@/orders/order-detail-store';
import { FulfillmentPortProvider } from '@/orders/fulfillment-binding';

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
  Redirect: () => null,
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@/auth/auth-provider', () => ({ useAuth: () => ({ session: { user: { id: 'user-a' } } }) }));

let mockKeySeq = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `key-${++mockKeySeq}` }));

const mockGetBuyerResult = jest.fn();
const mockInspectionApi = {
  call: (request: (token: string) => Promise<unknown>) => request('token-a'),
  service: { getBuyerResult: (...args: unknown[]) => mockGetBuyerResult(...args) },
  token: 'token-a',
};
jest.mock('@/inspections/use-inspection-api', () => ({ useInspectionApi: () => mockInspectionApi }));

const mockDetailStore = {
  open: jest.fn().mockResolvedValue(undefined),
  refresh: jest.fn().mockResolvedValue(undefined),
  pay: jest.fn(),
  cancel: jest.fn(),
  retryUncertain: jest.fn(),
  loadReceipt: jest.fn(),
};
const mockListStore = { refresh: jest.fn().mockResolvedValue(undefined) };
let mockDetailState: any;

jest.mock('@/orders/orders-provider', () => ({
  useOrderDetail: () => ({ state: mockDetailState, store: mockDetailStore }),
  useOrdersList: () => ({ state: {}, store: mockListStore }),
}));

const order = (extra: Record<string, unknown> = {}) => ({
  id: 41,
  status: 'WAITING_PAYMENT',
  paymentStatus: 'UNPAID',
  viewerRole: 'buyer',
  product: { id: 12, name: 'เสื้อ', condition: 'GOOD', size: 'M' },
  amounts: {
    currency: 'THB', itemPrice: '1200.00', shippingFee: '50.00', inspectionFee: '100.00',
    totalAmount: '1350.00', commissionFee: null, sellerPayout: null,
  },
  shippingAddress: null,
  lastPaymentAttempt: null,
  paidAt: null,
  receiptNo: null,
  canPay: true,
  canCancel: true,
  expiresAt: null,
  cancelledAt: null,
  cancelReason: null,
  createdAt: null,
  updatedAt: null,
  ...extra,
});

function stateWith(current: Record<string, unknown>) {
  return { ...initialOrderDetailState, owner: 'user-a', orderId: (current.id as number) ?? 41, order: current };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

test('เลยเส้นตายแล้วแต่ server ยังตอบสถานะเดิม ต้องถามซ้ำไม่ใช่ค้างที่ข้อความตรวจสอบ', async () => {
  // สถานะยัง "รอชำระเงิน" ตลอดการทดสอบ เหมือนตอนคำตอบแรกมาถึงก่อนเส้นตายจริงของ server
  mockDetailState = stateWith(order({ expiresAt: new Date(Date.now() - 1000).toISOString() }));
  render(<OrderDetailScreen orderId={41} />);

  expect(screen.getByText('หมดเวลาชำระเงินแล้ว กำลังตรวจสถานะล่าสุดจากระบบ')).toBeTruthy();
  expect(mockDetailStore.refresh).toHaveBeenCalledTimes(1);

  await act(async () => { jest.advanceTimersByTime(6000); });
  expect(mockDetailStore.refresh.mock.calls.length).toBeGreaterThan(1);

  await act(async () => { jest.advanceTimersByTime(6000); });
  expect(mockDetailStore.refresh.mock.calls.length).toBeGreaterThan(2);
});

test('ยังไม่ถึงเส้นตายต้องไม่ถามซ้ำและยังนับถอยหลังอยู่', async () => {
  mockDetailState = stateWith(order({ expiresAt: new Date(Date.now() + 90_000).toISOString() }));
  render(<OrderDetailScreen orderId={41} />);

  expect(screen.queryByText('หมดเวลาชำระเงินแล้ว กำลังตรวจสถานะล่าสุดจากระบบ')).toBeNull();
  expect(mockDetailStore.refresh).not.toHaveBeenCalled();

  await act(async () => { jest.advanceTimersByTime(10_000); });
  expect(mockDetailStore.refresh).not.toHaveBeenCalled();
  expect(screen.getByText('เหลือเวลาชำระเงิน')).toBeTruthy();
});

test('ยกเลิกแล้วต้องหยุดถามซ้ำ แม้เส้นตายจะอยู่ในอดีต', async () => {
  mockDetailState = stateWith(order({
    status: 'CANCELLED', canPay: false, canCancel: false, cancelReason: 'EXPIRED',
    cancelledAt: '2026-09-18T10:31:00Z', expiresAt: new Date(Date.now() - 60_000).toISOString(),
  }));
  render(<OrderDetailScreen orderId={41} />);

  await act(async () => { jest.advanceTimersByTime(20_000); });
  expect(mockDetailStore.refresh).not.toHaveBeenCalled();
  expect(screen.getByTestId('journey-CANCELLED')).toBeTruthy();
  expect(screen.getByText('หมดเวลาชำระเงิน ระบบยกเลิกให้อัตโนมัติ')).toBeTruthy();
});

test('order data is hidden immediately when the store still belongs to the previous account', () => {
  mockDetailState = { ...stateWith(order()), owner: 'previous-account' };
  render(<OrderDetailScreen orderId={41} />);
  expect(screen.queryByText('เสื้อ')).toBeNull();
  expect(screen.queryByText('ชำระเงินจำลองสำเร็จ')).toBeNull();
});

// ---------- UI1-05 journey: server reads + flags through the fulfillment port ----------

const shipment = (leg: string, extra: Record<string, unknown> = {}) => ({
  id: leg === 'TO_CENTER' ? 1 : leg === 'TO_BUYER' ? 2 : 3, leg, status: 'SHIPPED', carrier: 'Demo carrier', tracking_number: `${leg}-001`,
  shipped_at: '2026-10-02T10:00:00Z', transport_delivered_at: null, transport_source: null, simulated_transport: false,
  recipient_received_at: null, recipient_source: null, ...extra,
});
const delivery = (extra: Record<string, unknown> = {}) => ({
  order_id: 41, order_status: 'RESULT_NOTIFIED', server_time: new Date().toISOString(), fulfillment_policy: 'EXTERNAL_V2',
  result_available_at: null, result_decision_deadline_at: null, result_timed_out_at: null, can_confirm_return: false,
  charged_amount: '1350.00', refund_quote: null, shipments: [shipment('TO_CENTER', { recipient_received_at: '2026-10-03T10:00:00Z', recipient_source: 'INSPECTOR' })],
  receipt_deadline_at: null, receipt_confirmed_at: null, receipt_confirmation_source: null, missing_reported_at: null, missing_report: null,
  settlement_status: 'HELD', settlement: null, pending_processing: false, inspection_overdue_escalated_at: null,
  can_confirm_receipt: false, can_report_missing: false, ...extra,
});
const paidOrder = (extra: Record<string, unknown> = {}) => order({ status: 'RESULT_NOTIFIED', paymentStatus: 'PAID', canPay: false, canCancel: false,
  paidAt: '2026-10-01T10:00:00Z', receiptNo: 'RC-41', ...extra });

function makePort(reads: { delivery: () => unknown }) {
  return {
    getDelivery: jest.fn(async () => reads.delivery()),
    getHistory: jest.fn(async () => ({ items: [], limit: 100, offset: 0, has_more: false })),
    getReturnAddress: jest.fn(), saveReturnAddress: jest.fn(),
    confirmReceipt: jest.fn(async (_orderId: number, _key: string): Promise<unknown> => ({})),
    reportNotReceived: jest.fn(async (_orderId: number, _reason: string, _key: string): Promise<unknown> => ({})),
    confirmReturn: jest.fn(async (_orderId: number, _key: string): Promise<unknown> => ({})),
  };
}

function renderWith(port: ReturnType<typeof makePort> | null) {
  return render(<FulfillmentPortProvider port={port}><OrderDetailScreen orderId={41} /></FulfillmentPortProvider>);
}

describe('order journey', () => {
  beforeEach(() => { jest.useRealTimers(); mockGetBuyerResult.mockReset(); mockGetBuyerResult.mockResolvedValue(null); mockKeySeq = 0; });

  test('positive result: decision entry and server deadline appear only from can_decide', async () => {
    mockDetailState = stateWith(paidOrder());
    const deadline = new Date(Date.now() + 2 * 86400_000).toISOString();
    mockGetBuyerResult.mockResolvedValue({ order_id: 41, result: 'PASS', certificate: { status: 'ISSUED' }, decision: null, fulfillment_policy: 'EXTERNAL_V2',
      result_available_at: new Date().toISOString(), result_decision_deadline_at: deadline, result_timed_out_at: null, server_time: new Date().toISOString(), can_decide: true, next_action: 'WAIT_BUYER_DECISION' });
    renderWith(makePort({ delivery: () => delivery({ result_decision_deadline_at: deadline }) }));
    expect(await screen.findByTestId('journey-RESULT_DECISION_OPEN')).toBeTruthy();
    expect(screen.getByText('เวลาตัดสินผลตรวจ')).toBeTruthy();
    expect(screen.getByRole('button', { name: /ดูผลตรวจและยอมรับผลการตรวจหรือปฏิเสธ/ })).toBeTruthy();
  });

  test('negative result: no certificate, no acceptance window', async () => {
    mockDetailState = stateWith(paidOrder());
    mockGetBuyerResult.mockResolvedValue({ order_id: 41, result: 'NOT_AS_DESCRIBED', certificate: null, decision: null, fulfillment_policy: 'EXTERNAL_V2',
      result_available_at: null, result_decision_deadline_at: null, result_timed_out_at: null, server_time: new Date().toISOString(), can_decide: false, next_action: 'RETURN_TO_SELLER' });
    renderWith(makePort({ delivery: () => delivery() }));
    expect(await screen.findByTestId('journey-AWAITING_RETURN_DISPATCH')).toBeTruthy();
    expect(screen.getByText('ไม่มีใบรับรองสำหรับผลนี้')).toBeTruthy();
    expect(screen.queryByText('เวลาตัดสินผลตรวจ')).toBeNull();
  });

  test('report before provider event: flags enable actions, reason 10–1000 required, same key on uncertain retry', async () => {
    mockDetailState = stateWith(paidOrder({ status: 'SHIPPING_TO_BUYER' }));
    const port = makePort({ delivery: () => delivery({ order_status: 'SHIPPING_TO_BUYER', shipments: [shipment('TO_BUYER')], can_confirm_receipt: true, can_report_missing: true }) });
    port.reportNotReceived.mockRejectedValueOnce({ status: 0, code: 'network_error' }).mockResolvedValueOnce({});
    renderWith(port);
    expect(await screen.findByTestId('buyer-receipt-actions')).toBeTruthy();
    expect(screen.getByText(/เวลานับยืนยันอัตโนมัติจะเริ่มเมื่อระบบได้รับสถานะส่งถึงเท่านั้น/)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'แจ้งว่ายังไม่ได้รับสินค้า' }));
    fireEvent.changeText(screen.getByLabelText('อธิบายสิ่งที่เกิดขึ้น'), 'สั้น');
    expect(screen.getByRole('button', { name: 'ส่งการแจ้ง' }).props.accessibilityState.disabled).toBe(true);
    fireEvent.changeText(screen.getByLabelText('อธิบายสิ่งที่เกิดขึ้น'), 'ยังไม่ได้รับพัสดุตามเลขติดตาม');
    fireEvent.press(screen.getByRole('button', { name: 'ส่งการแจ้ง' }));
    await waitFor(() => expect(port.reportNotReceived).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId('action-error-0')).toBeTruthy();
    expect(port.getDelivery.mock.calls.length).toBeGreaterThan(1); // refetched after the ambiguous outcome
    fireEvent.press(screen.getByRole('button', { name: 'ส่งการแจ้ง' }));
    await waitFor(() => expect(port.reportNotReceived).toHaveBeenCalledTimes(2));
    expect(port.reportNotReceived.mock.calls[1][2]).toBe(port.reportNotReceived.mock.calls[0][2]);
    expect(port.reportNotReceived.mock.calls[0][1]).toBe('ยังไม่ได้รับพัสดุตามเลขติดตาม');
  });

  test('409 on receipt shows refetch guidance, never local success', async () => {
    mockDetailState = stateWith(paidOrder({ status: 'DELIVERED_PENDING_BUYER' }));
    const port = makePort({ delivery: () => delivery({ order_status: 'DELIVERED_PENDING_BUYER', receipt_deadline_at: new Date(Date.now() + 86400_000).toISOString(),
      shipments: [shipment('TO_BUYER', { transport_delivered_at: '2026-10-05T10:00:00Z', transport_source: 'ADMIN_DEMO', simulated_transport: true })], can_confirm_receipt: true, can_report_missing: true }) });
    port.confirmReceipt.mockRejectedValueOnce({ status: 409, code: 'receipt_deadline_passed' });
    renderWith(port);
    expect(await screen.findByText('สถานะขนส่งจำลอง')).toBeTruthy();
    fireEvent.press(await screen.findByRole('button', { name: 'ยืนยันว่าได้รับสินค้าแล้ว' }));
    fireEvent.press(screen.getAllByRole('button', { name: 'ยืนยันว่าได้รับสินค้าแล้ว' }).at(-1)!);
    expect(await screen.findByText(/เลยเวลายืนยันรับ/)).toBeTruthy();
    expect(screen.queryByTestId('buyer-receipt-recorded')).toBeNull();
  });

  test('Seller confirms actual return from the server flag, then sees pending refund processing', async () => {
    mockDetailState = stateWith(paidOrder({ viewerRole: 'seller' }));
    let returned = false;
    const port = makePort({ delivery: () => returned
      ? delivery({ order_status: 'RETURNED_TO_SELLER', pending_processing: true, charged_amount: null, shipments: [shipment('TO_SELLER', { recipient_received_at: '2026-10-06T10:00:00Z', recipient_source: 'SELLER' })] })
      : delivery({ charged_amount: null, can_confirm_return: true, shipments: [shipment('TO_SELLER', { transport_delivered_at: '2026-10-06T08:00:00Z', transport_source: 'ADMIN_DEMO', simulated_transport: true })] }) });
    port.confirmReturn.mockImplementation(async () => { returned = true; return { order_status: 'RETURNED_TO_SELLER' }; });
    renderWith(port);
    fireEvent.press(await screen.findByRole('button', { name: 'ยืนยันว่าได้รับสินค้าคืนแล้ว' }));
    fireEvent.press(screen.getAllByRole('button', { name: 'ยืนยันว่าได้รับสินค้าคืนแล้ว' }).at(-1)!);
    expect(await screen.findByTestId('return-pending-processing')).toBeTruthy();
    expect(screen.getAllByText('รับคืนแล้ว กำลังดำเนินการคืนเงิน').length).toBeGreaterThan(0);
    expect(screen.queryByText(/คืนเงินจำลองแล้ว/)).toBeNull();
  });

  test('positive reject refund shows server 1,200 refund with retained 100 + 50 and original charge', async () => {
    mockDetailState = stateWith(paidOrder({ status: 'REFUNDED', paymentStatus: 'REFUNDED' }));
    mockGetBuyerResult.mockResolvedValue(null);
    renderWith(makePort({ delivery: () => delivery({ order_status: 'REFUNDED', settlement_status: 'REFUNDED', settlement: { id: 55, kind: 'REFUND', source: 'RETURN_DELIVERY',
      reason: 'BUYER_REJECTED_INSPECTION', currency: 'THB', settled_at: '2026-10-06T10:00:01Z', simulated: true, fulfillment_policy: 'EXTERNAL_V2', held_amount: '1350.00',
      buyer_refund: '1200.00', retained_inspection_amount: '100.00', retained_shipping_amount: '50.00' } }) }));
    expect(await screen.findByTestId('money-settled')).toBeTruthy();
    expect(screen.getAllByText('฿1,200.00')).toHaveLength(2); // item price snapshot + settled refund
    expect(screen.getAllByText('฿100.00')).toHaveLength(2); // inspection fee snapshot + retained inspection
    expect(screen.getByText('ไม่คืนค่าตรวจสอบ')).toBeTruthy();
    expect(screen.getAllByText('฿1,350.00').length).toBeGreaterThan(0);
    expect(screen.getByText('#55')).toBeTruthy();
    expect(screen.queryByText('฿1,050.00')).toBeNull();
  });

  test('paid order without a bound shipping client shows the unavailable state', async () => {
    mockDetailState = stateWith(paidOrder({ status: 'WAITING_SELLER_SHIP' }));
    renderWith(null);
    expect(await screen.findByTestId('journey-unavailable')).toBeTruthy();
    expect(screen.getByTestId('journey-AWAITING_SELLER_SHIP')).toBeTruthy();
  });
});
