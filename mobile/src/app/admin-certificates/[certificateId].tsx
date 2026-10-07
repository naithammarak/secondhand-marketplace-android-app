import { useLocalSearchParams } from 'expo-router';
import { AdminCertificateScreen } from '@/components/admin-certificate-screen';
import { parseRouteId } from '@/orders/route-params';
export default function AdminCertificateRoute() {
  const { certificateId } = useLocalSearchParams<{ certificateId?: string }>();
  return <AdminCertificateScreen certificateId={parseRouteId(certificateId)} />;
}
