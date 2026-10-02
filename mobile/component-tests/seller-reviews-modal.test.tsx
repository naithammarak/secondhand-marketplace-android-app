import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SellerReviewsModal } from '@/components/seller-reviews-modal';
const mockList = jest.fn();
jest.mock('@/services/review-service', () => ({ createReviewService: () => ({publicList:mockList}) }));
const zero = {seller_id:3,summary:{count:0,average_rating:null,distribution:{'1':0,'2':0,'3':0,'4':0,'5':0}},items:[],total:0,limit:20,offset:0};
const item=(id:number) => ({id,rating:5,comment:`Comment ${id}`,created_at:'2026-10-02T00:00:00Z',reviewer_label:'ผู้ซื้อที่ยืนยันการซื้อ',product_name:'สินค้าทดสอบ'});
beforeEach(() => { jest.clearAllMocks(); mockList.mockResolvedValue(zero); });

test('honest zero with no mock scores or reviewer identities', async () => {
  const onClose=jest.fn(); render(<SellerReviewsModal visible sellerId={3} sellerName="ร้านทดสอบ" onClose={onClose} />);
  await screen.findByText('ยังไม่มีรีวิวจากผู้ซื้อที่ซื้อสำเร็จ');
  expect(screen.getByText('0 รีวิว')).toBeTruthy(); expect(screen.queryByText('4.8')).toBeNull();
  expect(screen.queryByText('ก***น')).toBeNull();
  fireEvent.press(screen.getByText('กลับ')); expect(onClose).toHaveBeenCalledTimes(1);
});
test('all-review aggregate stays true across pages and failed next page can retry', async () => {
  const summary={count:21,average_rating:5,distribution:{'1':0,'2':0,'3':0,'4':0,'5':21}};
  mockList.mockResolvedValueOnce({...zero,summary,total:21,items:Array.from({length:20},(_,i)=>item(i+1))})
    .mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({...zero,summary,total:21,offset:20,items:[item(21)]});
  render(<SellerReviewsModal visible sellerId={3} onClose={jest.fn()} />); await screen.findByText('21 รีวิว');
  fireEvent.press(screen.getByText('หน้าถัดไป')); await screen.findByRole('alert');
  expect(screen.getByText('Comment 1')).toBeTruthy();
  fireEvent.press(screen.getByText('หน้าถัดไป')); await screen.findByText('Comment 21');
  expect(screen.queryByText('Comment 1')).toBeNull(); expect(screen.getByText('21 รีวิว')).toBeTruthy();
  expect(screen.queryByText('หน้าถัดไป')).toBeNull(); expect(screen.getByText('หน้าก่อน')).toBeTruthy();
  expect(mockList.mock.calls[2].slice(0,3)).toEqual([3,20,20]);
});
test('late previous seller page cannot replace new seller state', async () => {
  let finish!: (value:any)=>void;
  mockList.mockImplementationOnce(() => new Promise(resolve => {finish=resolve;})).mockResolvedValueOnce({...zero,seller_id:4});
  const ui=render(<SellerReviewsModal visible sellerId={3} onClose={jest.fn()} />);
  await waitFor(() => expect(mockList).toHaveBeenCalledTimes(1));
  ui.rerender(<SellerReviewsModal visible sellerId={4} onClose={jest.fn()} />); await screen.findByText('0 รีวิว');
  await act(async () => finish({...zero,items:[item(99)]}));
  expect(screen.queryByText('Comment 99')).toBeNull();
});
