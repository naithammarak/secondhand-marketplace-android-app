import { fireEvent, render, screen } from '@testing-library/react-native';
import { BuyerResultView, CertificateSheet, InspectorWorkView, SellerShipView, type InspectionOutcome } from '@/components/inspection/views';
const cert = { number: 'fixture-C1', issuedAt: '2026-09-27T06:00:00Z', publicUrl: 'https://example.invalid/c/abc' };
const props = { summary: 'รายงานจากผู้ตรวจ', inspectedAt: cert.issuedAt, certificate: cert, nextAction: 'WAIT_BUYER_DECISION' as const, certificateDecision: true, canDecide: true };

test('revoked certificate sheet retains public lookup but never shows a valid seal', () => {
  render(<CertificateSheet visible enabled outcome="PASS" certificate={{ ...cert, status: 'REVOKED' }} onClose={() => {}} />);
  expect(screen.getByText('ใบรับรองนี้ถูกเพิกถอน')).toBeTruthy();
  expect(screen.getByText(cert.number)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'เปิดใบรับรองสาธารณะ' })).toBeTruthy();
  expect(screen.queryByText('● ใช้งานได้')).toBeNull();
  expect(screen.queryByText('ผ่านการตรวจตามรายงาน')).toBeNull();
});

test('revoked certificate does not offer a new decision even with stale capability flags', () => {
  render(<BuyerResultView {...props} outcome="PASS" certificate={{ ...cert, status: 'REVOKED' }} onDecision={jest.fn()} />);
  expect(screen.getByText('ใบรับรองนี้ถูกเพิกถอน')).toBeTruthy();
  expect(screen.queryByText('ยอมรับผลการตรวจ')).toBeNull();
});
test.each(['NOT_AS_DESCRIBED','FAKE'] as InspectionOutcome[])('%s never offers certificate or decisions, even with malformed positive flags', outcome => {
  const decide = jest.fn(); render(<BuyerResultView {...props} outcome={outcome} onDecision={decide} />);
  expect(screen.queryByText('ดูใบรับรองผลการตรวจ')).toBeNull();
  expect(screen.queryByText('ยอมรับผลการตรวจ')).toBeNull();
  expect(decide).not.toHaveBeenCalled();
});
test('a decision requires all server capabilities and a separate confirmation', () => {
  const decide = jest.fn(); const view = render(<BuyerResultView {...props} outcome="PASS" canDecide={false} onDecision={decide} />);
  expect(screen.queryByText('ยอมรับผลการตรวจ')).toBeNull();
  view.rerender(<BuyerResultView {...props} outcome="PASS" onDecision={decide} />);
  fireEvent.press(screen.getByText('ยอมรับผลการตรวจ'));
  expect(decide).not.toHaveBeenCalled();
  expect(screen.getAllByText(/ไม่ใช่การยืนยันรับสินค้า/).length).toBeGreaterThan(0);
  fireEvent.press(screen.getByText('ยืนยันยอมรับผลการตรวจ'));
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
  fireEvent.press(screen.getByText('ปฏิเสธผลการตรวจและส่งคืน'));
  fireEvent.changeText(screen.getByLabelText('เหตุผลที่ปฏิเสธ (ไม่บังคับ)'), 'ก'.repeat(501));
  fireEvent.press(screen.getByText('ยืนยันปฏิเสธผลการตรวจและส่งคืน'));
  expect(decide).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByLabelText('เหตุผลที่ปฏิเสธ (ไม่บังคับ)'), '  สภาพไม่ตรงที่คาด  ');
  fireEvent.press(screen.getByText('ยืนยันปฏิเสธผลการตรวจและส่งคืน'));
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
  expect(screen.queryByText('ยอมรับผลการตรวจ')).toBeNull();
});

test('a saved rejection shows its recorded reason and return next step without decision controls', () => {
  render(<BuyerResultView {...props} outcome="PASS" canDecide={false} nextAction="RETURN_TO_SELLER"
    recordedDecision={{ decision: 'REJECT', reason: 'สภาพไม่ตรง', decidedAt: '2026-09-29T00:00:00Z' }} onDecision={jest.fn()} />);
  expect(screen.getByText('บันทึกคำตัดสิน: ปฏิเสธผลการตรวจและส่งคืน')).toBeTruthy();
  expect(screen.getByText('เหตุผล: สภาพไม่ตรง')).toBeTruthy();
  expect(screen.getByText(/ขั้นตอนถัดไปคือส่งสินค้าคืนผู้ขาย/)).toBeTruthy();
  expect(screen.queryByText('ยอมรับผลการตรวจ')).toBeNull();
  expect(screen.queryByText('การตัดสินผลตรวจยังไม่พร้อมใช้งานสำหรับรายการนี้')).toBeNull();
});

test.each(['NOT_AS_DESCRIBED', 'FAKE'] as const)('negative result %s cannot submit a buyer decision or promise timed acceptance', (outcome) => {
  const decide = jest.fn();
  render(<BuyerResultView {...props} outcome={outcome} canDecide={true} nextAction="WAIT_BUYER_DECISION" onDecision={decide} />);
  expect(screen.queryByText('ยอมรับตามสภาพจริง')).toBeNull();
  expect(screen.queryByText('ปฏิเสธ · คืนเงิน')).toBeNull();
  expect(screen.queryByText(/72 ชม/)).toBeNull();
  expect(screen.getByText(/ไม่มีใบรับรองและไม่เปิดให้ยอมรับผลตรวจ/)).toBeTruthy();
  expect(decide).not.toHaveBeenCalled();
});

test('certificate shows the real inspection date, not the issue date', () => {
  render(<CertificateSheet visible enabled outcome="PASS" certificate={{ ...cert, issuedAt: '2026-09-29T06:00:00Z' }}
    inspectedAt="2026-09-27T06:00:00Z" onClose={() => {}} />);
  expect(screen.getByText(new Date('2026-09-27T06:00:00Z').toLocaleDateString('th-TH'))).toBeTruthy();
  expect(screen.getByText(new Date('2026-09-29T06:00:00Z').toLocaleDateString('th-TH'))).toBeTruthy();
});

test('certificate without an inspection time does not reuse the issue date as the inspection date', () => {
  render(<CertificateSheet visible enabled outcome="PASS" certificate={cert} onClose={() => {}} />);
  expect(screen.queryByText('ตรวจเมื่อ')).toBeNull();
  expect(screen.getByText('ออกใบรับรอง')).toBeTruthy();
});

test('a negative result states the next step once', () => {
  render(<BuyerResultView {...props} outcome="FAKE" certificate={null} nextAction="RETURN_TO_SELLER" />);
  expect(screen.getAllByText('ขั้นตอนถัดไป')).toHaveLength(1);
  expect(screen.getAllByText(/สินค้าจะถูกส่งคืนผู้ขาย/)).toHaveLength(1);
});

test('summary lines in "label: value" form render as report rows', () => {
  render(<BuyerResultView {...props} outcome="PASS" summary={'ความแท้: ตรวจแล้วตรงตามหลักฐาน\nสภาพ: ตรงกับที่ประกาศ'} />);
  expect(screen.getByText('ความแท้')).toBeTruthy();
  expect(screen.getByText('ตรวจแล้วตรงตามหลักฐาน')).toBeTruthy();
});
