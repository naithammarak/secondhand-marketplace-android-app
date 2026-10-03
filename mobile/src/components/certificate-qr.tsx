/** QR for the opaque public certificate URL returned by the server (no login, no PII). */
import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

export function isPublicCertificateUrl(value: string | null | undefined): value is string {
  try { return !!value && new URL(value).protocol === 'https:'; } catch { return false; }
}

export function CertificateQr({ url, size = 168 }: { url: string; size?: number }) {
  if (!isPublicCertificateUrl(url)) return null;
  // White quiet zone so phone cameras can read it in dark theme too.
  return <View accessibilityRole="image" accessibilityLabel="QR เปิดใบรับรองสาธารณะ" testID="certificate-qr"
    style={{ alignSelf: 'center', backgroundColor: '#ffffff', padding: 12, borderRadius: 12 }}>
    <QRCode value={url} size={size} color="#0f172a" backgroundColor="#ffffff" ecl="M" />
  </View>;
}
