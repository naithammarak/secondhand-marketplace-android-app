import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { CheckoutScreen } from '@/components/checkout-screen';
import { initialCheckoutState } from '@/orders/checkout-store';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
  Redirect: () => null,
  useRouter: () => ({ push: mockPush, back: mockBack, replace: mockReplace }),
}));

jest.mock('@/auth/auth-provider', () => ({
  useAuth: () => ({ session: { user: { id: 'buyer-test' } }, initializing: false }),
}));

const mockCheckoutStore = {
  open: jest.fn().mockResolvedValue(undefined),
  close: jest.fn(),
  submit: jest.fn(),
  clearFieldError: jest.fn(),
  reloadQuote: jest.fn(),
};

const mockDetailStore = {
  open: jest.fn().mockResolvedValue(undefined),
  pay: jest.fn().mockResolvedValue({}),
};

let mockCheckoutState: any;
let mockDetailState: any;

jest.mock('@/orders/orders-provider', () => ({
  useCheckout: () => ({ state: mockCheckoutState, store: mockCheckoutStore }),
  useOrderDetail: () => ({ state: mockDetailState, store: mockDetailStore }),
}));

const quote = {
  product: { id: 7, name: 'กระเป๋าหนังแท้', condition: 'LIKE_NEW', size: 'M', imageUrl: null },
  currency: 'THB',
  itemPrice: '3850.00',
  shippingFee: '50.00',
  inspectionFee: '100.00',
  totalAmount: '4000.00',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCheckoutState = {
    ...initialCheckoutState,
    owner: 'buyer-test',
    productId: 7,
    quote,
  };
  mockDetailState = {
    owner: 'buyer-test',
    orderId: null,
    order: null,
    paying: null,
  };
});

test('renders checkout screen with product card, address fields, and price summary', () => {
  render(<CheckoutScreen productId={7} />);
  expect(screen.getByText('กระเป๋าหนังแท้')).toBeTruthy();
  expect(screen.getByText('สภาพเหมือนใหม่')).toBeTruthy();
  expect(screen.getByText('ขนาด M')).toBeTruthy();
  expect(screen.getByText('ที่อยู่จัดส่ง')).toBeTruthy();
  expect(screen.getByText('ใช้ที่อยู่ล่าสุด')).toBeTruthy();
  expect(screen.getByText('วิธีชำระเงิน')).toBeTruthy();
  expect(screen.getByText('พร้อมเพย์ QR')).toBeTruthy();
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

test('pay later button in PromptPay QR modal navigates to order detail', () => {
  mockCheckoutState.createdOrderId = 42;
  render(<CheckoutScreen productId={7} />);
  expect(screen.getByText('สแกนเพื่อชำระเงิน')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'ชำระภายหลัง' }));
  expect(mockReplace).toHaveBeenCalledWith({ pathname: '/orders/[orderId]', params: { orderId: '42' } });
});

test('simulate success in PromptPay QR modal pays and navigates to receipt', async () => {
  mockCheckoutState.createdOrderId = 42;
  render(<CheckoutScreen productId={7} />);
  fireEvent.press(screen.getByRole('button', { name: 'จำลองจ่ายสำเร็จ' }));
  await waitFor(() => {
    expect(mockDetailStore.pay).toHaveBeenCalledWith('SUCCESS');
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/receipt/[orderId]', params: { orderId: '42' } });
  });
});

test('simulate failure and expiry in PromptPay QR modal', () => {
  mockCheckoutState.createdOrderId = 42;
  render(<CheckoutScreen productId={7} />);
  fireEvent.press(screen.getByRole('button', { name: 'จำลองจ่ายล้มเหลว' }));
  expect(screen.getByText('ชำระเงินไม่สำเร็จ สินค้ายังถูกจองไว้ให้คุณ ลองใหม่ได้')).toBeTruthy();

  fireEvent.press(screen.getByRole('button', { name: 'จำลองหมดเวลา' }));
  expect(screen.getByText('หมดเวลาชำระเงิน')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'กลับไปดูสินค้า' })).toBeTruthy();
});
