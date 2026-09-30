import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { ReviewModal } from '@/components/review-modal';
import { parseRouteId } from '@/orders/route-params';

export default function OrderReviewRoute() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const id = parseRouteId(orderId) ?? 0;

  return (
    <View style={{ flex: 1 }}>
      <ReviewModal
        visible={true}
        orderId={id}
        productName="สินค้าคำสั่งซื้อ"
        onClose={() => router.back()}
        onSubmit={async () => {
          router.back();
        }}
      />
    </View>
  );
}
