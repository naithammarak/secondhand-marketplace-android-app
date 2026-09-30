import { act, render, screen } from '@testing-library/react-native';

import { OrderDetailScreen } from '@/components/order-detail-screen';
import { initialOrderDetailState } from '@/orders/order-detail-store';

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
  Redirect: () => null,
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@/auth/auth-provider', () => ({ useAuth: () => ({ session: { user: { id: 'user-a' } } }) }));

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
  expect(screen.getByText('คำสั่งซื้อนี้ถูกยกเลิกแล้ว')).toBeTruthy();
});

test('order data is hidden immediately when the store still belongs to the previous account', () => {
  mockDetailState = { ...stateWith(order()), owner: 'previous-account' };
  render(<OrderDetailScreen orderId={41} />);
  expect(screen.queryByText('เสื้อ')).toBeNull();
  expect(screen.queryByText('จำลองจ่ายสำเร็จ')).toBeNull();
});

test('RETURNING_TO_SELLER displays returning banner, shortcuts, and return timeline', () => {
  mockDetailState = stateWith(order({
    id: 37,
    status: 'RETURNING_TO_SELLER',
    canPay: false,
    canCancel: false,
    inspectionResult: 'NOT_AS_DESCRIBED',
  }));
  render(<OrderDetailScreen orderId={37} />);

  expect(screen.getByText('กำลังส่งคืนผู้ขาย')).toBeTruthy();
  expect(screen.getByText('คุณปฏิเสธผลตรวจ')).toBeTruthy();
  expect(screen.getByText('🟠 ไม่ตรงตามประกาศ ›')).toBeTruthy();
  expect(screen.getByText('ไม่ออกใบรับรอง')).toBeTruthy();
  expect(screen.getByText('ศูนย์ส่งสินค้าคืนผู้ขาย')).toBeTruthy();
});

test('REFUNDED displays refund amount and seller view offers relist button', () => {
  // Test buyer view on refunded
  mockDetailState = stateWith(order({
    id: 37,
    status: 'REFUNDED',
    viewerRole: 'buyer',
    canPay: false,
    canCancel: false,
    inspectionResult: 'NOT_AS_DESCRIBED',
  }));
  const view = render(<OrderDetailScreen orderId={37} />);
  expect(screen.getAllByText('คืนเงินค่าสินค้าแล้ว').length).toBeGreaterThan(0);
  expect(screen.getByText('คืนเงินแล้ว')).toBeTruthy();

  // Test seller view on refunded offers relist button
  mockDetailState = stateWith(order({
    id: 37,
    status: 'REFUNDED',
    viewerRole: 'seller',
    canPay: false,
    canCancel: false,
    inspectionResult: 'NOT_AS_DESCRIBED',
  }));
  view.rerender(<OrderDetailScreen orderId={37} />);
  expect(screen.getByText('สินค้าส่งคืนถึงคุณแล้ว')).toBeTruthy();
  expect(screen.getAllByRole('button', { name: 'ลงขายอีกครั้ง' }).length).toBeGreaterThan(0);
});

test('RESULT_NOTIFIED with failed inspection displays fail banner and button to choose', () => {
  mockDetailState = stateWith(order({
    id: 37,
    status: 'RESULT_NOTIFIED',
    viewerRole: 'buyer',
    canPay: false,
    canCancel: false,
    inspectionResult: 'NOT_AS_DESCRIBED',
  }));
  render(<OrderDetailScreen orderId={37} />);

  expect(screen.getByText(/ผลตรวจ: 🟠 ไม่ตรงตามประกาศ/)).toBeTruthy();
  expect(screen.getByText(/ถ้าไม่ตอบภายใน 72 ชม./)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'ดูผลตรวจและเลือก' })).toBeTruthy();
});
