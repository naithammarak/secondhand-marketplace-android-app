import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SplashScreenView } from '@/components/wondee/splash-screen';

describe('SplashScreenView', () => {
  it('renders skip button and calls onFinish when pressed', () => {
    const onFinish = jest.fn();
    render(<SplashScreenView onFinish={onFinish} />);

    const skipButton = screen.getByRole('button', { name: 'ข้าม' });
    expect(skipButton).toBeTruthy();

    fireEvent.press(skipButton);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('renders the container and wordmark elements', () => {
    const onFinish = jest.fn();
    render(<SplashScreenView onFinish={onFinish} />);

    expect(screen.getByTestId('splash-screen-container')).toBeTruthy();
    expect(screen.getByLabelText('2NDHAND Marketplace')).toBeTruthy();
  });
});
