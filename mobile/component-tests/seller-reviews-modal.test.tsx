import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { SellerReviewsModal } from '@/components/seller-reviews-modal';

test('renders seller reviews modal with rating summary and reviews list', () => {
  const onClose = jest.fn();
  render(
    <SellerReviewsModal
      visible={true}
      onClose={onClose}
      sellerName="มายด์ มือสอง"
    />
  );

  expect(screen.getByText('รีวิวผู้ขาย')).toBeTruthy();
  expect(screen.getByText('4.8')).toBeTruthy();
  expect(screen.getByText('มายด์ มือสอง')).toBeTruthy();
  expect(screen.getByText('✓ ผู้ขายยืนยันตัวตนแล้ว · ขายแล้ว 41 ชิ้น')).toBeTruthy();
  expect(screen.getByText('ก***น')).toBeTruthy();
  expect(screen.getByText('ของตรงปกมาก แพ็กมาดีสุด ๆ')).toBeTruthy();

  fireEvent.press(screen.getByRole('button', { name: 'กลับ' }));
  expect(onClose).toHaveBeenCalledTimes(1);
});
