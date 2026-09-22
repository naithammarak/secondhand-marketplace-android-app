import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ProductImage } from '@/components/product-catalog-ui';

describe('ProductImage', () => {
  test('renders placeholder when uri is not provided', () => {
    render(<ProductImage uri={null} accessibilityLabel="ไม่มีรูปสินค้า" />);
    expect(screen.getByText('🖼')).toBeTruthy();
    expect(screen.getByLabelText('ไม่มีรูปสินค้า')).toBeTruthy();
  });

  test('renders image and switches to placeholder when image fails to load', () => {
    const { UNSAFE_getByType } = render(
      <ProductImage uri="https://example.com/item.jpg" accessibilityLabel="รูปสินค้า" />,
    );

    // Initial render should render Image component
    const image = screen.getByLabelText('รูปสินค้า');
    expect(image).toBeTruthy();

    // Trigger onError on Image
    act(() => {
      fireEvent(image, 'error', { nativeEvent: { error: 'Failed to load' } });
    });

    // Placeholder icon should now be visible
    expect(screen.getByText('🖼')).toBeTruthy();
  });

  test('resets failed state when uri changes after an image failure', () => {
    const view = render(
      <ProductImage uri="https://example.com/expired-signed-url.jpg" accessibilityLabel="รูปสินค้า" />,
    );

    const image = screen.getByLabelText('รูปสินค้า');
    expect(image).toBeTruthy();

    // Image fails to load (e.g. signed URL expired)
    act(() => {
      fireEvent(image, 'error', { nativeEvent: { error: 'Expired URL' } });
    });

    expect(screen.getByText('🖼')).toBeTruthy();

    // Component receives a new refreshed URL
    view.rerender(
      <ProductImage uri="https://example.com/new-signed-url.jpg" accessibilityLabel="รูปสินค้า" />,
    );

    // Placeholder icon should no longer be displayed; new Image component should render
    expect(screen.queryByText('🖼')).toBeNull();
    const newImage = screen.getByLabelText('รูปสินค้า');
    expect(newImage.props.source).toEqual([{ uri: 'https://example.com/new-signed-url.jpg' }]);
  });
});
