import { fireEvent, render, screen } from '@testing-library/react-native';
import { DeliveryCaseReview, ReturnExceptionReview, newEventId } from '@/components/staff/admin-delivery';
import { StaffScreen } from '@/components/staff/staff-ui';
import { deliveryReviewFixture, returnReviewFixture } from '@/fulfillment/fixtures';

jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: jest.fn(), Redirect: () => null }));
let mockAccount: Record<string, unknown> = { role: 'BUYER', source: 'backend' };
jest.mock('@/auth/auth-provider', () => ({ useAuth: () => ({ initializing: false, accountChecking: false, accountError: null, session: { user: { id: 'u1' } }, account: mockAccount, retryAccount: jest.fn() }) }));

const REASON = 'ตรวจหลักฐานจากผู้ซื้อและผู้ขายแล้ว';

test('non-receipt resolution: issued refs only, one exclusive outcome, reason required', () => {
  const onResolve = jest.fn();
  render(<DeliveryCaseReview review={deliveryReviewFixture} busy={false} onResolve={onResolve} />);
  expect(screen.getByText(deliveryReviewFixture.report.reason)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'ตรวจทานและตัดสิน' }).props.accessibilityState.disabled).toBe(true);
  fireEvent.press(screen.getByRole('button', { name: 'คืนเงินผู้ซื้อ (REFUND)' }));
  expect(screen.getByText(/ไม่มีการจ่ายผู้ขายและไม่มีค่าธรรมเนียม/)).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'ปล่อยเงินให้ผู้ขาย (RELEASE)' }));
  expect(screen.queryByText(/ไม่มีการจ่ายผู้ขาย/)).toBeNull(); // switching replaces, never both
  fireEvent.press(screen.getByRole('button', { name: 'คืนเงินผู้ซื้อ (REFUND)' }));
  fireEvent.changeText(screen.getByLabelText('เหตุผลของผู้ดูแล'), REASON);
  fireEvent.press(screen.getByRole('button', { name: 'ตรวจทานและตัดสิน' }));
  fireEvent.press(screen.getByRole('button', { name: 'ยืนยันการตัดสิน' }));
  expect(onResolve).toHaveBeenCalledWith({ resolution: 'REFUND', reason: REASON, evidence_refs: ['delivery-report:91', 'delivery-audit:23'] });
});

test('return exception requires the issued shipment and audit refs plus a reason', () => {
  const onConfirm = jest.fn();
  render(<ReturnExceptionReview review={returnReviewFixture} busy={false} onConfirm={onConfirm} />);
  expect(screen.getByText(/ไม่มีการเลือกยอดเงิน/)).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText('เหตุผลยืนยันว่าผู้ขายได้รับคืนจริง'), REASON);
  fireEvent.press(screen.getByRole('button', { name: 'return-shipment:13' })); // deselect -> only one ref
  expect(screen.getByRole('button', { name: 'ตรวจทานการยืนยันรับคืน' }).props.accessibilityState.disabled).toBe(true);
  fireEvent.press(screen.getByRole('button', { name: 'return-shipment:13' }));
  fireEvent.press(screen.getByRole('button', { name: 'ตรวจทานการยืนยันรับคืน' }));
  fireEvent.press(screen.getByRole('button', { name: 'ยืนยัน' }));
  expect(onConfirm).toHaveBeenCalledWith({ reason: REASON, evidence_refs: ['delivery-audit:24', 'return-shipment:13'] });
});

test('demo event ids satisfy the server identity pattern', () => {
  expect(newEventId(7, 13)).toMatch(/^[A-Za-z0-9_-]{8,100}$/);
});

test('staff screens deny other roles and never show staff data', () => {
  mockAccount = { role: 'BUYER', source: 'backend' };
  render(<StaffScreen title="จัดการการจัดส่ง" role="ADMIN"><></></StaffScreen>);
  expect(screen.getByTestId('staff-denied')).toBeTruthy();
});
