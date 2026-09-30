import { fireEvent, render, screen } from '@testing-library/react-native';

import { ReceiptScreen } from '@/components/receipt-screen';

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
  Redirect: () => null,
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

jest.mock('@/auth/auth-provider', () => ({
  useAuth: () => ({ session: { user: { id: 'buyer-test' } } }),
}));

const mockDetailStore = {
  open: jest.fn().mockResolvedValue(undefined),
  loadReceipt: jest.fn().mockResolvedValue(undefined),
};

let mockDetailState: any;

jest.mock('@/orders/orders-provider', () => ({
  useOrderDetail: () => ({ state: mockDetailState, store: mockDetailStore }),
}));

const mockReceipt = {
  receiptNo: 'RC-000042',
  orderId: 42,
  issuedAt: '2026-09-28T14:32:00Z',
  paymentMethod: 'พร้อมเพย์',
  currency: 'THB',
  productName: 'กระเป๋าหนังแท้วินเทจ',
  itemPrice: '3850.00',
  shippingFee: '50.00',
  inspectionFee: '100.00',
  totalAmount: '4000.00',
};

const mockOrder = {
  id: 42,
  shippingAddress: {
    recipientName: 'สมชาย ใจดี',
    phone: '0812345678',
    addressLine: '128/9 ซอยสุขุมวิท 39',
    subdistrict: 'คลองตันเหนือ',
    district: 'วัฒนา',
    province: 'กรุงเทพมหานคร',
    postalCode: '10110',
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockDetailState = {
    owner: 'buyer-test',
    orderId: 42,
    order: mockOrder,
    receipt: mockReceipt,
    receiptLoading: false,
    receiptError: null,
  };
});

test('renders order success header and receipt paper details', () => {
  render(<ReceiptScreen orderId={42} />);
  expect(screen.getByText('ชำระเงินสำเร็จ')).toBeTruthy();
  expect(screen.getByText('ผู้ขายจะส่งสินค้าเข้าตรวจสภาพก่อนส่งถึงคุณ')).toBeTruthy();
  expect(screen.getByText('ใบเสร็จรับเงิน')).toBeTruthy();
  expect(screen.getByText('RC-000042')).toBeTruthy();
  expect(screen.getByText('#42')).toBeTruthy();
  expect(screen.getByText('พร้อมเพย์')).toBeTruthy();
  expect(screen.getByText('กระเป๋าหนังแท้วินเทจ')).toBeTruthy();
  expect(screen.getByText('฿3,850.00')).toBeTruthy();
  expect(screen.getByText('฿50.00')).toBeTruthy();
  expect(screen.getByText('฿100.00')).toBeTruthy();
  expect(screen.getByText('฿4,000.00')).toBeTruthy();
  expect(screen.getByText(/จัดส่งถึง/)).toBeTruthy();
  expect(screen.getByText(/สมชาย ใจดี/)).toBeTruthy();
  expect(screen.getByText('เอกสารนี้ออกจากระบบจำลองเพื่อการทดสอบ ไม่ใช่ใบเสร็จทางภาษี')).toBeTruthy();
});

test('navigates to order detail when clicking ดูสถานะคำสั่งซื้อ', () => {
  render(<ReceiptScreen orderId={42} />);
  fireEvent.press(screen.getByRole('button', { name: 'ดูสถานะคำสั่งซื้อ' }));
  expect(mockReplace).toHaveBeenCalledWith({ pathname: '/orders/[orderId]', params: { orderId: '42' } });
});

test('navigates to home when clicking กลับหน้าแรก', () => {
  render(<ReceiptScreen orderId={42} />);
  fireEvent.press(screen.getByRole('button', { name: 'กลับหน้าแรก' }));
  expect(mockReplace).toHaveBeenCalledWith('/');
});
