import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useProfile } from '@/profile/use-profile';
import { ProfileDetails } from '@/components/profile-details';
const mockService = { get: jest.fn(), save: jest.fn(), acknowledge: jest.fn() };
let mockOwner = 'a';
jest.mock('@/auth/auth-provider', () => ({ useAuth: () => ({ session: { user: { id: mockOwner } } }) }));
jest.mock('@/auth/supabase-client', () => ({ getSupabaseClient: () => ({ auth: {
  getSession: async () => ({data:{session:{user:{id:mockOwner},access_token:mockOwner}}}), refreshSession: jest.fn(),
} }) }));
jest.mock('@/services/profile-service', () => ({ createProfileService: () => mockService, POLICY_VERSION: 'submission-2026-10-01' }));
const profile = {id:1,full_name:'Original',email:'private@example.test',role:'BUYER',status:'ACTIVE',privacy_policy_version:null,privacy_acknowledged_at:null};
function Harness() { const model=useProfile(); return <ProfileDetails key={mockOwner} model={model} />; }
beforeEach(() => { jest.clearAllMocks(); mockOwner='a'; mockService.get.mockResolvedValue(profile); });

test('failed save retains draft, retry only updates after persisted response and double taps send once', async () => {
  mockService.save.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({...profile,full_name:'Changed'});
  render(<Harness />);
  await screen.findByDisplayValue('Original');
  fireEvent.changeText(screen.getByLabelText('ชื่อที่แสดง'),'Changed');
  fireEvent.press(screen.getByText('บันทึกชื่อ')); fireEvent.press(screen.getByText('บันทึกชื่อ'));
  await screen.findByRole('alert');
  expect(mockService.save).toHaveBeenCalledTimes(1);
  expect(screen.getByDisplayValue('Changed')).toBeTruthy(); expect(screen.queryByText('บันทึกชื่อแล้ว')).toBeNull();
  fireEvent.press(screen.getByText('บันทึกชื่อ'));
  await screen.findByText('บันทึกชื่อแล้ว'); expect(mockService.save).toHaveBeenCalledTimes(2);
});
test('account switch clears private data and late save cannot populate next account', async () => {
  let finish!: (value:any)=>void;
  mockService.save.mockImplementation(() => new Promise(resolve => { finish=resolve; }));
  const ui=render(<Harness />); await screen.findByDisplayValue('Original');
  fireEvent.changeText(screen.getByLabelText('ชื่อที่แสดง'),'PRIVATE A');
  fireEvent.press(screen.getByText('บันทึกชื่อ'));
  await waitFor(() => expect(mockService.save).toHaveBeenCalled());
  mockOwner='b'; mockService.get.mockResolvedValue({...profile,id:2,full_name:'Second',email:'second@example.test'});
  ui.rerender(<Harness />); await screen.findByDisplayValue('Second');
  await act(async () => finish({...profile,full_name:'PRIVATE A'}));
  expect(screen.queryByDisplayValue('PRIVATE A')).toBeNull(); expect(screen.queryByText('private@example.test')).toBeNull();
  expect(screen.queryByText('บันทึกชื่อแล้ว')).toBeNull();
});
test('policy records through server and failure keeps modal open for retry', async () => {
  mockService.acknowledge.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({...profile,privacy_policy_version:'submission-2026-10-01',privacy_acknowledged_at:'2026-10-02T00:00:00Z'});
  render(<Harness />); await screen.findByDisplayValue('Original');
  fireEvent.press(screen.getByText('อ่านข้อกำหนดและนโยบายความเป็นส่วนตัว'));
  await waitFor(() => expect(mockService.get).toHaveBeenCalledTimes(2));
  fireEvent.press(screen.getByLabelText('รับทราบนโยบายต้นแบบ'));
  fireEvent.press(screen.getByText('บันทึกการรับทราบ'));
  await screen.findByRole('alert'); expect(screen.getByText('บันทึกการรับทราบ')).toBeTruthy();
  fireEvent.press(screen.getByText('บันทึกการรับทราบ'));
  await waitFor(() => expect(mockService.acknowledge).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByText('บันทึกการรับทราบ')).toBeNull());
});
