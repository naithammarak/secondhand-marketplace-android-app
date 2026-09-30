import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ReviewModal } from '@/components/review-modal';

test('validates stars requirement and submits review with tags and comment', async () => {
  const onClose = jest.fn();
  const onSubmit = jest.fn();

  render(
    <ReviewModal
      visible={true}
      orderId={40}
      productName="นาฬิกา Seiko 5"
      sellerName="มายด์ มือสอง"
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );

  expect(screen.getByText('ให้คะแนนและรีวิว')).toBeTruthy();
  expect(screen.getByText('นาฬิกา Seiko 5')).toBeTruthy();
  expect(screen.getByText('1. สินค้า')).toBeTruthy();
  expect(screen.getByText('2. ผู้ขาย')).toBeTruthy();
  expect(screen.getByText('3. บริการตรวจสอบ')).toBeTruthy();

  // Pressing submit without stars should trigger errors
  fireEvent.press(screen.getByRole('button', { name: 'ส่งรีวิว' }));
  expect(onSubmit).not.toHaveBeenCalled();
  expect(screen.getAllByText('กรุณาให้ดาว').length).toBeGreaterThan(0);

  // Rate product 5 stars
  fireEvent.press(screen.getByLabelText('คะแนนสินค้า 5 ดาว'));

  // Rate seller 4 stars and select tag
  fireEvent.press(screen.getByLabelText('คะแนนผู้ขาย 4 ดาว'));
  fireEvent.press(screen.getByRole('button', { name: 'แท็ก แพ็กดี' }));

  // Rate inspection 5 stars and select tag
  fireEvent.press(screen.getByLabelText('คะแนนบริการตรวจ 5 ดาว'));
  fireEvent.press(screen.getByRole('button', { name: 'แท็ก ตรวจละเอียด' }));

  // Type comment
  fireEvent.changeText(screen.getByPlaceholderText('เล่าเพิ่มเติม (ไม่บังคับ)'), 'สินค้าสวยงาม ตรงตามผลตรวจ');

  // Submit
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'ส่งรีวิว' }));
  });

  expect(onSubmit).toHaveBeenCalledWith({
    orderId: 40,
    productStars: 5,
    sellerStars: 4,
    inspectionStars: 5,
    comment: 'สินค้าสวยงาม ตรงตามผลตรวจ',
    sellerTags: ['แพ็กดี'],
    inspectionTags: ['ตรวจละเอียด'],
    hasPhoto: false,
  });
  expect(onClose).toHaveBeenCalled();
});
