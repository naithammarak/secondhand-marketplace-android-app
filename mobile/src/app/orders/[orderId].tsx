import { BuyerOrderScreen } from '@/components/buyer-order-screens';
import { isBuyerOrdersMode } from '@/runtime/catalog-capability';
import { useLocalSearchParams } from 'expo-router';

import { OrderDetailScreen } from '@/components/order-detail-screen';
import { parseRouteId } from '@/orders/route-params';

export default function OrderDetailRoute() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  return isBuyerOrdersMode() ? <BuyerOrderScreen orderId={parseRouteId(orderId)} /> : <OrderDetailScreen orderId={parseRouteId(orderId)} />;
}
