import { useLocalSearchParams } from 'expo-router';

import { OrderDetailScreen } from '@/components/order-detail-screen';
import { parseRouteId } from '@/orders/route-params';

export default function OrderDetailRoute() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  return <OrderDetailScreen orderId={parseRouteId(orderId)} />;
}
