import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { ReviewModal } from '@/components/review-modal';
import { Button } from '@/components/order-ui';
import { ThemedText } from '@/components/themed-text';
import { parseRouteId } from '@/orders/route-params';

export default function OrderReviewRoute() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const id = parseRouteId(orderId);

  return (
    <View style={{ flex: 1 }}>
      {id !== null && <ReviewModal
        visible={true}
        orderId={id}
        productName={`คำสั่งซื้อ #${id}`}
        onClose={() => router.back()}
      />}
      {id === null && <><ThemedText>เลขคำสั่งซื้อไม่ถูกต้อง</ThemedText><Button label="กลับ" onPress={() => router.back()} /></>}
    </View>
  );
}
