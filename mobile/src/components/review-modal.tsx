import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/auth-provider';
import { useTheme } from '@/hooks/use-theme';
import { useOrderReview } from '@/reviews/use-order-review';
import { MaxContentWidth } from '@/constants/theme';
import { Button, Loading } from './order-ui';
import { ThemedText } from './themed-text';

type Props = { visible: boolean; orderId: number; productName: string; sellerName?: string; imageUrl?: string | null;
  onClose(): void; onSubmitted?(): void };

export function ReviewModal(props: Props) {
  const auth = useAuth();
  return <Modal visible={props.visible} animationType="slide" onRequestClose={props.onClose}>
    {props.visible && <ReviewForm key={`${auth.session?.user.id}:${props.orderId}`} {...props} />}
  </Modal>;
}

export function ReviewForm({ orderId, productName, sellerName, onClose, onSubmitted }: Props) {
  const theme = useTheme();
  const model = useOrderReview(orderId);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [tried, setTried] = useState(false);
  const disabled = model.busy || model.lockedDraft;
  return <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
    <ScrollView contentContainerStyle={styles.content}>
      <Button label="กลับ" onPress={onClose} />
      <ThemedText type="subtitle">รีวิวผู้ขาย</ThemedText>
      <ThemedText>{productName}</ThemedText>
      {!!sellerName && <ThemedText>{sellerName}</ThemedText>}
      <ThemedText>คำสั่งซื้อ #{orderId} · ส่งรีวิวแล้วแก้ไขไม่ได้</ThemedText>
      {model.busy && <Loading label="กำลังโหลดหรือส่งรีวิว" />}
      {model.error && <ThemedText accessibilityRole="alert">{model.error}</ThemedText>}
      <Button label="โหลดรีวิวอีกครั้ง" disabled={model.busy} onPress={() => void model.reload()} />
      {model.data?.review ? <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <ThemedText>คุณรีวิวคำสั่งซื้อนี้แล้ว</ThemedText>
        <ThemedText>{'★'.repeat(model.data.review.rating)} ({model.data.review.rating}/5)</ThemedText>
        <ThemedText>{model.data.review.comment}</ThemedText>
      </View> : model.data?.can_review ? <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <ThemedText>คะแนนผู้ขาย</ThemedText>
        <View style={styles.stars}>{[1,2,3,4,5].map(star => <Pressable key={star} accessibilityRole="button"
          accessibilityLabel={`คะแนนผู้ขาย ${star} ดาว`} disabled={disabled} onPress={() => setRating(star)}>
          <ThemedText style={{ fontSize: 34, color: star <= rating ? '#F59E0B' : theme.textSecondary }}>★</ThemedText>
        </Pressable>)}</View>
        {tried && !rating && <ThemedText accessibilityRole="alert">กรุณาให้ดาว</ThemedText>}
        <TextInput accessibilityLabel="ความคิดเห็น" placeholder="เล่าเพิ่มเติม (ไม่บังคับ)" placeholderTextColor={theme.textSecondary}
          multiline value={comment} onChangeText={setComment} editable={!disabled}
          style={[styles.input, { color: theme.text, borderColor: theme.border }]} />
        {Array.from(comment).length > 1000 && <ThemedText accessibilityRole="alert">ข้อความต้องไม่เกิน 1000 ตัวอักษร</ThemedText>}
        {model.lockedDraft && <ThemedText>เก็บข้อความเดิมไว้สำหรับลองส่งซ้ำ หากส่งแล้วให้โหลดรีวิวอีกครั้ง</ThemedText>}
        <Button label="ส่งรีวิว" disabled={model.busy || Array.from(comment).length > 1000} onPress={() => {
          setTried(true); if (!rating) return;
          void model.submit({ rating, comment }).then(ok => { if (ok) { onSubmitted?.(); onClose(); } });
        }} />
      </View> : model.data && <ThemedText>รีวิวได้เมื่อคำสั่งซื้อเสร็จสมบูรณ์และระบบปล่อยยอดให้ผู้ขายแล้ว</ThemedText>}
    </ScrollView>
  </SafeAreaView>;
}

export function OrderReviewEntry({ orderId, productName, onReviewed }: { orderId: number; productName: string; onReviewed?(): void }) {
  const auth = useAuth();
  return <ReviewEntry key={`${auth.session?.user.id}:${orderId}`} orderId={orderId} productName={productName} onReviewed={onReviewed} />;
}
function ReviewEntry({ orderId, productName, onReviewed }: { orderId: number; productName: string; onReviewed?(): void }) {
  const model = useOrderReview(orderId);
  const [visible, setVisible] = useState(false);
  return <View style={styles.card}>
    {model.busy && <Loading label="กำลังตรวจสอบสิทธิ์รีวิว" />}
    {model.error && <><ThemedText accessibilityRole="alert">{model.error}</ThemedText><Button label="ลองโหลดสิทธิ์รีวิวใหม่" onPress={() => void model.reload()} /></>}
    {model.data?.review && <><ThemedText>คุณรีวิวคำสั่งซื้อนี้แล้ว · {model.data.review.rating}/5</ThemedText><ThemedText>{model.data.review.comment}</ThemedText></>}
    {model.data?.can_review && <Button label="รีวิวผู้ขาย" onPress={() => setVisible(true)} />}
    <ReviewModal visible={visible} orderId={orderId} productName={productName} onClose={() => setVisible(false)}
      onSubmitted={() => { void model.reload(); onReviewed?.(); }} />
  </View>;
}
const styles = StyleSheet.create({ content: { padding: 20, gap: 14, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center' },
  card: { padding: 16, borderRadius: 18, borderWidth: 1, gap: 12 }, stars: { flexDirection: 'row', gap: 16 },
  input: { minHeight: 100, borderWidth: 1, padding: 12, borderRadius: 12, textAlignVertical: 'top' } });
