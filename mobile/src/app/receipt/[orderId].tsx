import { useLocalSearchParams } from 'expo-router';

import { ReceiptScreen } from '@/components/receipt-screen';
import { parseRouteId } from '@/orders/route-params';

export default function ReceiptRoute() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  return <ReceiptScreen orderId={parseRouteId(orderId)} />;
}
