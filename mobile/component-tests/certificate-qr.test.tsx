import { render, screen } from '@testing-library/react-native';
import { CertificateQr, isPublicCertificateUrl } from '@/components/certificate-qr';

test('QR renders only for the server HTTPS public certificate URL', () => {
  const view = render(<CertificateQr url="https://demo.trycloudflare.com/certificates/opaque-token-1234567890" />);
  expect(screen.getByTestId('certificate-qr')).toBeTruthy();
  view.rerender(<CertificateQr url="http://127.0.0.1:8091/certificates/opaque-token-1234567890" />);
  expect(screen.queryByTestId('certificate-qr')).toBeNull();
  expect(isPublicCertificateUrl('not a url')).toBe(false);
});
