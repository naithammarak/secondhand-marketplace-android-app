import { useLocalSearchParams } from 'expo-router';

import { CheckoutScreen } from '@/components/checkout-screen';
import { parseRouteId } from '@/orders/route-params';

export default function CheckoutRoute() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  return <CheckoutScreen productId={parseRouteId(productId)} />;
}
