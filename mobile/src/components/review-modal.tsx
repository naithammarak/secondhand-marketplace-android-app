import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
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
function StarIcon({ color, size = 22 }: { color: string; size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" stroke={color} strokeWidth={2} strokeLinejoin="round" />
  </Svg>;
}

function ReviewEntry({ orderId, productName, onReviewed }: { orderId: number; productName: string; onReviewed?(): void }) {
  const theme = useTheme();
  const model = useOrderReview(orderId);
  const [visible, setVisible] = useState(false);
  const review = model.data?.review;
  const canReview = !!model.data?.can_review;
  // ไม่มีอะไรให้แสดง (ไม่มีรีวิวและยังรีวิวไม่ได้) ก็ไม่แสดงการ์ดว่าง
  if (!model.busy && !model.error && !review && !canReview) return null;
  return <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
    {model.busy && <Loading label="กำลังตรวจสอบสิทธิ์รีวิว" />}
    {model.error && <><ThemedText accessibilityRole="alert" style={{ fontSize: 12, color: theme.danger }}>{model.error}</ThemedText>
      <Button label="ลองโหลดสิทธิ์รีวิวใหม่" onPress={() => void model.reload()} /></>}
    {review && <View style={styles.entryRow}>
      <StarIcon color="#f59e0b" size={18} />
      <View style={{ flex: 1, gap: 2 }}>
        <ThemedText style={[styles.entryTitle, { color: theme.text }]}>คุณรีวิวคำสั่งซื้อนี้แล้ว · {review.rating}/5</ThemedText>
        <ThemedText style={{ fontSize: 12, lineHeight: 16, color: '#f59e0b', letterSpacing: 1 }} accessibilityLabel={`${review.rating} ดาว`}>
          {'★'.repeat(review.rating)}<ThemedText style={{ fontSize: 12, color: 'rgba(100, 116, 139, 0.4)' }}>{'★'.repeat(Math.max(0, 5 - review.rating))}</ThemedText>
        </ThemedText>
        {review.comment ? <ThemedText style={[styles.entryText, { color: theme.textSecondary }]}>{review.comment}</ThemedText> : null}
      </View>
    </View>}
    {canReview && <View style={styles.entryRow}>
      <StarIcon color="#fbbf24" />
      <View style={{ flex: 1 }}>
        <ThemedText style={[styles.entryTitle, { color: theme.text }]}>ให้คะแนนการซื้อครั้งนี้</ThemedText>
        <ThemedText style={[styles.entryText, { color: theme.textSecondary }]}>รีวิวผู้ขายจากคำสั่งซื้อนี้</ThemedText>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="รีวิวผู้ขาย" onPress={() => setVisible(true)}
        style={({ pressed }) => [styles.entryButton, { backgroundColor: pressed ? '#10b981' : '#059669' }]}>
        <ThemedText style={styles.entryButtonText}>รีวิว</ThemedText>
      </Pressable>
    </View>}
    <ReviewModal visible={visible} orderId={orderId} productName={productName} onClose={() => setVisible(false)}
      onSubmitted={() => { void model.reload(); onReviewed?.(); }} />
  </View>;
}
const styles = StyleSheet.create({ content: { padding: 20, gap: 14, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center' },
  card: { padding: 16, borderRadius: 16, borderWidth: 1, gap: 12 },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  entryTitle: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  entryText: { fontSize: 11, lineHeight: 17 },
  entryButton: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 },
  entryButtonText: { fontSize: 12, fontWeight: '700', color: '#ffffff' },
  stars: { flexDirection: 'row', gap: 16 },
  input: { minHeight: 100, borderWidth: 1, padding: 12, borderRadius: 12, textAlignVertical: 'top' } });
