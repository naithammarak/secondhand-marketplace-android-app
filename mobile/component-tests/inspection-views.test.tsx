import { fireEvent, render, screen } from '@testing-library/react-native';
import { BuyerResultView, CertificateSheet, InspectorWorkView, SellerShipView, type InspectionOutcome } from '@/components/inspection/views';
const cert = { number: 'fixture-C1', issuedAt: '2026-09-27T06:00:00Z', publicUrl: 'https://example.invalid/c/abc' };
const props = { summary: 'รายงานจากผู้ตรวจ', inspectedAt: cert.issuedAt, certificate: cert, nextAction: 'WAIT_BUYER_DECISION' as const, certificateDecision: true, canDecide: true };
test.each(['NOT_AS_DESCRIBED','FAKE'] as InspectionOutcome[])('%s never offers certificate or decisions, even with malformed positive flags', outcome => {
  const decide = jest.fn(); render(<BuyerResultView {...props} outcome={outcome} onDecision={decide} />);
  expect(screen.queryByText('ดูใบรับรองผลการตรวจ')).toBeNull();
  expect(screen.queryByText('ยอมรับผลตรวจ')).toBeNull();
  expect(decide).not.toHaveBeenCalled();
});
test('a decision requires all server capabilities and a separate confirmation', () => {
  const decide = jest.fn(); const view = render(<BuyerResultView {...props} outcome="PASS" canDecide={false} onDecision={decide} />);
  expect(screen.queryByText('ยอมรับผลตรวจ')).toBeNull();
  view.rerender(<BuyerResultView {...props} outcome="PASS" onDecision={decide} />);
  fireEvent.press(screen.getByText('ยอมรับผลตรวจ'));
  expect(decide).not.toHaveBeenCalled();
  expect(screen.getByText(/ไม่ใช่การยืนยันรับสินค้า/)).toBeTruthy();
  fireEvent.press(screen.getByText('ยืนยันยอมรับผลตรวจ'));
  expect(decide).toHaveBeenCalledWith('CONFIRM');
});
test('public certificate capability is independent and no QR is invented', () => {
  render(<CertificateSheet visible enabled={false} outcome="PASS" certificate={cert} onClose={() => {}} />);
  expect(screen.getByText(cert.number)).toBeTruthy();
  expect(screen.queryByText('เปิดใบรับรองสาธารณะ')).toBeNull();
  expect(screen.queryByLabelText('QR เปิดใบรับรองสาธารณะ')).toBeNull();
});
test('ship trims valid fields, but unavailable integration cannot submit', () => {
  const submit = jest.fn(); const view = render(<SellerShipView orderId={42} productName="เสื้อ" />);
  expect(screen.getByRole('button', { name: 'ยืนยันการจัดส่งเข้าศูนย์' }).props.accessibilityState.disabled).toBe(true);
  view.rerender(<SellerShipView orderId={42} productName="เสื้อ" onSubmit={submit} />);
  fireEvent.press(screen.getByText('ยืนยันการจัดส่งเข้าศูนย์')); expect(submit).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByLabelText('ผู้ให้บริการขนส่ง'), '  ขนส่งตัวอย่าง  ');
  fireEvent.changeText(screen.getByLabelText('เลขติดตามพัสดุ'), '  TRACK42  ');
  fireEvent.press(screen.getByText('ยืนยันการจัดส่งเข้าศูนย์'));
  expect(submit).toHaveBeenCalledWith({ carrier: 'ขนส่งตัวอย่าง', tracking_number: 'TRACK42' });
});
test('inspection finalization uses only currently available selected evidence and needs confirmation', () => {
  const finalize = jest.fn(); const photos = [1,2].map(id => ({ id, label: `ภาพ ${id}`, source: { uri: `https://example.invalid/${id}` } }));
  const view = render(<InspectorWorkView productName="เสื้อ" step={2} photos={photos} onFinalize={finalize} />);
  fireEvent.press(screen.getByText('ผ่านการตรวจตามรายงาน'));
  fireEvent.changeText(screen.getByLabelText('สรุปผลการตรวจ'), 'ตรวจพบสินค้าตรงตามประกาศ ไม่มีความเสียหาย');
  fireEvent.press(screen.getByRole('checkbox', { name: 'ภาพ 1' }));
  view.rerender(<InspectorWorkView productName="เสื้อ" step={2} photos={[photos[1]]} onFinalize={finalize} />);
  expect(screen.getByText('ตรวจทานและยืนยันผล').parent?.props.accessibilityState?.disabled ?? screen.getByRole('button', { name: 'ตรวจทานและยืนยันผล' }).props.accessibilityState.disabled).toBe(true);
  fireEvent.press(screen.getByRole('checkbox', { name: 'ภาพ 2' }));
  fireEvent.press(screen.getByText('ตรวจทานและยืนยันผล')); expect(finalize).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('บันทึกผลและออกใบรับรอง'));
  expect(finalize).toHaveBeenCalledWith(expect.objectContaining({ result: 'PASS', evidence_ids: [2] }));
});

test('reject reason is optional, trimmed, bounded, and requires confirmation', () => {
  const decide = jest.fn(); render(<BuyerResultView {...props} outcome="PASS" onDecision={decide} />);
  fireEvent.press(screen.getByText('ไม่ยอมรับผลตรวจ'));
  fireEvent.changeText(screen.getByLabelText('เหตุผลที่ไม่ยอมรับ (ไม่บังคับ)'), 'ก'.repeat(501));
  fireEvent.press(screen.getByText('ยืนยันไม่ยอมรับผลตรวจ'));
  expect(decide).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByLabelText('เหตุผลที่ไม่ยอมรับ (ไม่บังคับ)'), '  สภาพไม่ตรงที่คาด  ');
  fireEvent.press(screen.getByText('ยืนยันไม่ยอมรับผลตรวจ'));
  expect(decide).toHaveBeenCalledWith('REJECT', 'สภาพไม่ตรงที่คาด');
});
test('shipping accepts the contract boundary of one character after trimming', () => {
  const submit = jest.fn(); render(<SellerShipView orderId={42} productName="เสื้อ" onSubmit={submit} />);
  fireEvent.changeText(screen.getByLabelText('ผู้ให้บริการขนส่ง'), ' A ');
  fireEvent.changeText(screen.getByLabelText('เลขติดตามพัสดุ'), ' 1 ');
  fireEvent.press(screen.getByText('ยืนยันการจัดส่งเข้าศูนย์'));
  expect(submit).toHaveBeenCalledWith({ carrier: 'A', tracking_number: '1' });
});

test('positive decision fails closed when its certificate is absent', () => {
  render(<BuyerResultView {...props} outcome="PASS" certificate={null} onDecision={jest.fn()} />);
  expect(screen.queryByText('ยอมรับผลตรวจ')).toBeNull();
});

test('a saved rejection shows its recorded reason and return next step without decision controls', () => {
  render(<BuyerResultView {...props} outcome="PASS" canDecide={false} nextAction="RETURN_TO_SELLER"
    recordedDecision={{ decision: 'REJECT', reason: 'สภาพไม่ตรง', decidedAt: '2026-09-29T00:00:00Z' }} onDecision={jest.fn()} />);
  expect(screen.getByText('บันทึกคำตัดสิน: ไม่ยอมรับผลตรวจ')).toBeTruthy();
  expect(screen.getByText('เหตุผล: สภาพไม่ตรง')).toBeTruthy();
  expect(screen.getByText(/ขั้นตอนถัดไปคือส่งสินค้าคืนผู้ขาย/)).toBeTruthy();
  expect(screen.queryByText('ยอมรับผลตรวจ')).toBeNull();
  expect(screen.queryByText('การตัดสินผลตรวจยังไม่พร้อมใช้งานสำหรับรายการนี้')).toBeNull();
});

test('failed inspection offers reject refund and accept as-is options', () => {
  const decide = jest.fn();
  render(<BuyerResultView {...props} outcome="NOT_AS_DESCRIBED" canDecide={true} nextAction="WAIT_BUYER_DECISION" onDecision={decide} />);
  expect(screen.getByText('ปฏิเสธ · คืนเงิน')).toBeTruthy();
  expect(screen.getByText('ยอมรับตามสภาพจริง')).toBeTruthy();
  expect(screen.getByText(/ถ้าไม่เลือกภายใน 72 ชม./)).toBeTruthy();

  // Test Reject flow: does not require typing reason
  fireEvent.press(screen.getByText('ปฏิเสธ · คืนเงิน'));
  expect(screen.getByText(/ไม่ต้องกรอกเหตุผล/)).toBeTruthy();
  fireEvent.press(screen.getByText('ยืนยันคืนเงิน'));
  expect(decide).toHaveBeenCalledWith('REJECT', 'สินค้าไม่ตรงตามประกาศ');
});

test('failed inspection accept as-is requires acknowledgment checkbox before confirming', () => {
  const decide = jest.fn();
  render(<BuyerResultView {...props} outcome="NOT_AS_DESCRIBED" canDecide={true} nextAction="WAIT_BUYER_DECISION" onDecision={decide} />);

  fireEvent.press(screen.getByText('ยอมรับตามสภาพจริง'));
  expect(screen.getByText(/ไม่ออกใบรับรองดิจิทัล เพราะผลตรวจไม่ผ่าน/)).toBeTruthy();

  // Confirm button disabled before check
  fireEvent.press(screen.getByText('ยืนยันยอมรับ'));
  expect(decide).not.toHaveBeenCalled();

  // Check the checkbox and confirm
  fireEvent.press(screen.getByRole('checkbox', { name: 'ฉันเข้าใจเงื่อนไขและต้องการรับสินค้าตามสภาพจริง' }));
  fireEvent.press(screen.getByText('ยืนยันยอมรับ'));
  expect(decide).toHaveBeenCalledWith('CONFIRM');
});
