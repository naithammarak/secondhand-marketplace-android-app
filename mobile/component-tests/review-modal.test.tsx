import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ReviewModal, OrderReviewEntry } from '@/components/review-modal';
const mockService = { get: jest.fn(), submit: jest.fn() };
let mockOwner = 'a';
jest.mock('@/auth/auth-provider', () => ({ useAuth: () => ({ session: { user: { id: mockOwner } } }) }));
jest.mock('@/auth/supabase-client', () => ({ getSupabaseClient: () => ({ auth: {
  getSession: async () => ({data:{session:{user:{id:mockOwner},access_token:mockOwner}}}), refreshSession: jest.fn(),
} }) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'stable-review-key-0001' }));
jest.mock('@/services/review-service', () => ({ createReviewService: () => mockService }));
const saved = {id:7,order_id:40,rating:4,comment:'ดี <b>plain text</b>',created_at:'2026-10-02T00:00:00Z'};
beforeEach(() => { jest.clearAllMocks(); mockOwner='a'; mockService.get.mockResolvedValue({order_id:40,can_review:true,review:null}); });
const props = () => ({ visible:true,orderId:40,productName:'นาฬิกา',onClose:jest.fn(),onSubmitted:jest.fn() });

test('seller rating only, closes and refreshes only after persisted response; double press once', async () => {
  let finish!: (value:any)=>void;
  mockService.submit.mockImplementation(() => new Promise(resolve => { finish=resolve; }));
  const p=props(); render(<ReviewModal {...p} />);
  await screen.findByText('คะแนนผู้ขาย');
  expect(screen.queryByLabelText('คะแนนสินค้า 5 ดาว')).toBeNull();
  fireEvent.press(screen.getByText('ส่งรีวิว')); expect(mockService.submit).not.toHaveBeenCalled();
  expect(screen.getByText('กรุณาให้ดาว')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('คะแนนผู้ขาย 4 ดาว'));
  fireEvent.changeText(screen.getByLabelText('ความคิดเห็น'), saved.comment);
  fireEvent.press(screen.getByText('ส่งรีวิว')); fireEvent.press(screen.getByText('ส่งรีวิว'));
  await waitFor(() => expect(mockService.submit).toHaveBeenCalledTimes(1));
  expect(mockService.submit.mock.calls[0].slice(0,4)).toEqual(['a',40,{rating:4,comment:saved.comment},'stable-review-key-0001']);
  expect(p.onClose).not.toHaveBeenCalled(); expect(p.onSubmitted).not.toHaveBeenCalled();
  await act(async () => finish(saved));
  expect(p.onClose).toHaveBeenCalledTimes(1); expect(p.onSubmitted).toHaveBeenCalledTimes(1);
});

test('failed submit retains exact draft and retry key without false success', async () => {
  mockService.submit.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(saved);
  const p=props(); render(<ReviewModal {...p} />); await screen.findByText('คะแนนผู้ขาย');
  fireEvent.press(screen.getByLabelText('คะแนนผู้ขาย 4 ดาว')); fireEvent.changeText(screen.getByLabelText('ความคิดเห็น'),saved.comment);
  fireEvent.press(screen.getByText('ส่งรีวิว')); await screen.findByRole('alert');
  expect(p.onClose).not.toHaveBeenCalled(); expect(screen.getByDisplayValue(saved.comment)).toBeTruthy();
  expect(screen.getByLabelText('ความคิดเห็น').props.editable).toBe(false);
  fireEvent.press(screen.getByText('ส่งรีวิว'));
  await waitFor(() => expect(p.onClose).toHaveBeenCalledTimes(1));
  expect(mockService.submit.mock.calls[1].slice(0,4)).toEqual(mockService.submit.mock.calls[0].slice(0,4));
});

test('server eligibility controls entry and existing review replaces form', async () => {
  mockService.get.mockResolvedValue({order_id:40,can_review:false,review:saved});
  render(<OrderReviewEntry orderId={40} productName="นาฬิกา" />);
  await screen.findByText('คุณรีวิวคำสั่งซื้อนี้แล้ว · 4/5');
  expect(screen.queryByRole('button',{name:'รีวิวผู้ขาย'})).toBeNull();
  expect(screen.getByText(saved.comment)).toBeTruthy();
});

test('pending or inactive order never renders submit', async () => {
  mockService.get.mockResolvedValue({order_id:40,can_review:false,review:null});
  render(<ReviewModal {...props()} />);
  await screen.findByText('รีวิวได้เมื่อคำสั่งซื้อเสร็จสมบูรณ์และระบบปล่อยยอดให้ผู้ขายแล้ว');
  expect(screen.queryByText('ส่งรีวิว')).toBeNull();
});

test('account switch clears draft; late successful old submission cannot navigate new account', async () => {
  let finish!: (value:any)=>void;
  mockService.submit.mockImplementation(() => new Promise(resolve => { finish=resolve; }));
  const p=props(); const ui=render(<ReviewModal {...p} />); await screen.findByText('คะแนนผู้ขาย');
  fireEvent.press(screen.getByLabelText('คะแนนผู้ขาย 4 ดาว')); fireEvent.changeText(screen.getByLabelText('ความคิดเห็น'),'PRIVATE A');
  fireEvent.press(screen.getByText('ส่งรีวิว')); await waitFor(() => expect(mockService.submit).toHaveBeenCalled());
  mockOwner='b'; mockService.get.mockResolvedValue({order_id:40,can_review:false,review:null});
  ui.rerender(<ReviewModal {...p} />);
  await act(async () => finish({...saved,comment:'PRIVATE A'}));
  expect(screen.queryByDisplayValue('PRIVATE A')).toBeNull(); expect(p.onClose).not.toHaveBeenCalled();
  expect(p.onSubmitted).not.toHaveBeenCalled();
});
