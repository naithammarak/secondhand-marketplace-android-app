import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/use-theme';
import { useSellerReviews } from '@/reviews/use-seller-reviews';
import { MaxContentWidth } from '@/constants/theme';
import { Button, Loading } from './order-ui';
import { ThemedText } from './themed-text';

export function SellerReviewsModal({ visible, onClose, sellerId, sellerName }: {
  visible: boolean; onClose(): void; sellerId: number | null; sellerName?: string;
}) {
  const theme = useTheme();
  const { page, busy, error, load } = useSellerReviews(sellerId, visible);
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView contentContainerStyle={styles.content}>
        <Button label="กลับ" onPress={onClose} />
        <ThemedText type="subtitle">รีวิวผู้ขาย</ThemedText>
        {!!sellerName && <ThemedText>{sellerName}</ThemedText>}
        {busy && <Loading label="กำลังโหลดรีวิว" />}
        {(!sellerId || error) && <ThemedText accessibilityRole="alert">โหลดรีวิวไม่สำเร็จ กรุณาลองใหม่</ThemedText>}
        <Button label="โหลดรีวิวอีกครั้ง" disabled={busy || !sellerId} onPress={() => void load(page?.offset ?? 0)} />
        {page && <>
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {page.summary.average_rating === null ? <ThemedText>ยังไม่มีรีวิวจากผู้ซื้อที่ซื้อสำเร็จ</ThemedText>
              : <ThemedText type="title">{page.summary.average_rating.toFixed(1)} / 5</ThemedText>}
            <ThemedText>{page.summary.count} รีวิว</ThemedText>
            {[5,4,3,2,1].map(stars => <View key={stars} style={styles.row}>
              <ThemedText>{stars} ★</ThemedText>
              <View style={[styles.track, { backgroundColor: theme.border }]}><View style={{ height: 8, backgroundColor: '#F59E0B',
                width: `${page.summary.count ? page.summary.distribution[String(stars)] / page.summary.count * 100 : 0}%` }} /></View>
              <ThemedText>{page.summary.distribution[String(stars)]}</ThemedText>
            </View>)}
          </View>
          {page.items.map(item => <View key={item.id} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <ThemedText>{item.reviewer_label}</ThemedText>
            <ThemedText>{'★'.repeat(item.rating)} · {item.rating}/5</ThemedText>
            <ThemedText>{item.comment}</ThemedText><ThemedText>{item.product_name}</ThemedText><ThemedText>{item.created_at}</ThemedText>
          </View>)}
          {page.offset > 0 && <Button label="หน้าก่อน" disabled={busy} onPress={() => void load(Math.max(0,page.offset-page.limit))} />}
          {page.offset + page.items.length < page.total && <Button label="หน้าถัดไป" disabled={busy} onPress={() => void load(page.offset+page.limit)} />}
        </>}
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

export function SellerReviewSummary({ sellerId }: { sellerId: number | null }) {
  const { page, busy, error, load } = useSellerReviews(sellerId);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  return <ThemedText>{busy ? 'กำลังโหลดคะแนนผู้ขาย' : error || !page ? 'ดูรีวิวผู้ขาย'
    : page.summary.average_rating === null ? 'ยังไม่มีรีวิวจากผู้ซื้อที่ซื้อสำเร็จ'
      : `★ ${page.summary.average_rating.toFixed(1)} (${page.summary.count} รีวิว) ›`}</ThemedText>;
}
const styles = StyleSheet.create({ content: { padding: 20, gap: 14, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center' },
  card: { padding: 16, borderRadius: 18, borderWidth: 1, gap: 12 }, row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  track: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' } });
