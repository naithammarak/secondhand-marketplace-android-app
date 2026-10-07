import { act, fireEvent, render, screen } from '@testing-library/react-native';

import NewProductScreen from '@/app/product/new';
import { ProductServiceError } from '@/services/product-service';

const mockPush = jest.fn();
const mockCreate = jest.fn();
let mockDraft: any;
let mockParams: any = {};

jest.mock('expo-router', () => ({
  router: { push: (...args: any[]) => mockPush(...args), replace: jest.fn() },
  useFocusEffect: () => {},
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/auth/auth-provider', () => ({ useAuth: () => ({ session: { access_token: 'seller-token' } }) }));
jest.mock('@/products/product-runtime', () => ({ isProductMockModeEnabled: () => false }));
jest.mock('@/services/product-service', () => {
  const actual = jest.requireActual('@/services/product-service');
  return { ...actual, createProductService: () => ({ createProduct: (...args: any[]) => mockCreate(...args) }) };
});
jest.mock('@/components/product-form', () => ({
  ProductForm: ({ onSubmit, submitDisabled, submitError }: any) => {
    const { Text, TouchableOpacity } = require('react-native');
    return (
      <>
        <Text>{submitError}</Text>
        <Text>{submitDisabled ? 'draft-disabled' : 'draft-ready'}</Text>
        <TouchableOpacity onPress={() => onSubmit(mockDraft)}><Text>submit-draft</Text></TouchableOpacity>
      </>
    );
  },
}));

test('uncertain create keeps the draft, requires inventory check, then allows explicit reuse', async () => {
  mockPush.mockClear();
  mockCreate.mockReset();
  mockDraft = { name: 'เสื้อเดิม', price: '12.34' };
  mockCreate.mockRejectedValueOnce(new ProductServiceError('timeout', 'หมดเวลา'));
  mockCreate.mockResolvedValueOnce({ id: 'new-product' });
  render(<NewProductScreen />);

  await act(async () => { fireEvent.press(screen.getByText('submit-draft')); });
  expect(screen.getByText('draft-disabled')).toBeTruthy();
  expect(mockCreate).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('ตรวจแล้วไม่พบสินค้า ใช้แบบร่างนี้ต่อ')).toBeNull();

  fireEvent.press(screen.getByText('ตรวจสินค้าของฉันก่อนลงซ้ำ'));
  expect(mockPush).toHaveBeenCalledWith('/product/mine');
  fireEvent.press(screen.getByText('ตรวจแล้วไม่พบสินค้า ใช้แบบร่างนี้ต่อ'));
  expect(screen.getByText('draft-ready')).toBeTruthy();
  await act(async () => { fireEvent.press(screen.getByText('submit-draft')); });
  expect(mockCreate).toHaveBeenCalledTimes(2);
  expect(mockCreate.mock.calls[1][0]).toBe(mockDraft);
});

test('a second timeout requires a new inventory check before the draft can be submitted again', async () => {
  mockPush.mockClear();
  mockCreate.mockReset();
  mockDraft = { name: 'เสื้อเดิม', price: '12.34' };
  mockCreate.mockRejectedValueOnce(new ProductServiceError('timeout', 'หมดเวลาครั้งแรก'));
  mockCreate.mockRejectedValueOnce(new ProductServiceError('timeout', 'หมดเวลาครั้งที่สอง'));
  render(<NewProductScreen />);

  await act(async () => { fireEvent.press(screen.getByText('submit-draft')); });
  expect(screen.queryByText('ตรวจแล้วไม่พบสินค้า ใช้แบบร่างนี้ต่อ')).toBeNull();
  fireEvent.press(screen.getByText('ตรวจสินค้าของฉันก่อนลงซ้ำ'));
  fireEvent.press(screen.getByText('ตรวจแล้วไม่พบสินค้า ใช้แบบร่างนี้ต่อ'));

  await act(async () => { fireEvent.press(screen.getByText('submit-draft')); });
  expect(mockCreate).toHaveBeenCalledTimes(2);
  expect(screen.getByText('draft-disabled')).toBeTruthy();
  expect(screen.queryByText('ตรวจแล้วไม่พบสินค้า ใช้แบบร่างนี้ต่อ')).toBeNull();
  await act(async () => { fireEvent.press(screen.getByText('submit-draft')); });
  expect(mockCreate).toHaveBeenCalledTimes(2);

  fireEvent.press(screen.getByText('ตรวจสินค้าของฉันก่อนลงซ้ำ'));
  expect(mockPush).toHaveBeenCalledTimes(2);
  fireEvent.press(screen.getByText('ตรวจแล้วไม่พบสินค้า ใช้แบบร่างนี้ต่อ'));
  expect(screen.getByText('draft-ready')).toBeTruthy();
});

test('relist params from old links are ignored; no relist workflow or invented result banner', () => {
  mockParams = { relistOrderId: '37', relistName: 'แจ็คเก็ตหนัง Zara ไซซ์ L', relistReason: 'fail' };
  render(<NewProductScreen />);
  expect(screen.getByText('ลงขายสินค้า')).toBeTruthy();
  expect(screen.queryByText('ลงขายอีกครั้ง')).toBeNull();
  expect(screen.queryByText(/ผลตรวจ: ไม่ตรงตามประกาศ/)).toBeNull();
});
