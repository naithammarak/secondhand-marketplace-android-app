import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';
import { useThemePreference } from '@/theme/theme-provider';
import { ThemedText } from './themed-text';

export interface SellerReviewItem {
  id: string;
  who: string;
  stars: number;
  productScore: number;
  text?: string;
  tags: string[];
  item: string;
  at: string;
}

export const INITIAL_SELLER_REVIEWS: SellerReviewItem[] = [
  {
    id: '1',
    who: 'ก***น',
    stars: 5,
    productScore: 5,
    text: 'ของตรงปกมาก แพ็กมาดีสุด ๆ',
    tags: ['แพ็กดี', 'ตรงปก'],
    item: 'กระเป๋าผ้า Canvas สีครีม',
    at: '25 ก.ย. 2026',
  },
  {
    id: '2',
    who: 'พ***ร',
    stars: 5,
    productScore: 4,
    text: '',
    tags: ['ส่งไว'],
    item: 'เสื้อยืดวินเทจ ลายวง ปี 90s',
    at: '18 ก.ย. 2026',
  },
  {
    id: '3',
    who: 'ธ***ย',
    stars: 4,
    productScore: 4,
    text: 'สภาพดีตามผลตรวจ ส่งช้านิดหน่อย',
    tags: ['ตรงปก'],
    item: 'รองเท้าผ้าใบ Nike Air ไซซ์ 42',
    at: '10 ก.ย. 2026',
  },
];

interface SellerReviewsModalProps {
  visible: boolean;
  onClose: () => void;
  sellerName?: string;
  reviews?: SellerReviewItem[];
}

export function SellerReviewsModal({
  visible,
  onClose,
  sellerName = 'มายด์ มือสอง',
  reviews = INITIAL_SELLER_REVIEWS,
}: SellerReviewsModalProps) {
  const theme = useTheme();
  const { scheme } = useThemePreference();
  const isDark = scheme === 'dark';

  const distribution = [
    { star: 5, pct: 81 },
    { star: 4, pct: 13 },
    { star: 3, pct: 3 },
    { star: 2, pct: 3 },
    { star: 1, pct: 0 },
  ];

  const totalReviewsCount = 29 + reviews.length;

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      onRequestClose={onClose}>
      <SafeAreaView
        style={[
          styles.container,
          { backgroundColor: isDark ? '#0F172A' : '#F8FAFC' },
        ]}>
        {/* Header */}
        <View
          style={[
            styles.header,
            {
              backgroundColor: theme.surface,
              borderBottomColor: theme.border,
            },
          ]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="กลับ"
            onPress={onClose}
            hitSlop={12}
            style={styles.backButton}>
            <ThemedText style={{ fontSize: 20, color: theme.text }}>‹</ThemedText>
          </Pressable>
          <ThemedText style={[styles.headerTitle, { color: theme.text }]}>
            รีวิวผู้ขาย
          </ThemedText>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          {/* Average Rating & Bar Chart Card */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}>
            <View style={styles.ratingScoreCol}>
              <ThemedText style={[styles.bigRatingText, { color: theme.text }]}>
                4.8
              </ThemedText>
              <ThemedText style={styles.starsRowYellow}>★★★★★</ThemedText>
              <ThemedText style={styles.reviewCountText}>
                {totalReviewsCount} รีวิว
              </ThemedText>
            </View>

            <View style={styles.ratingBarsCol}>
              {distribution.map(d => (
                <View key={d.star} style={styles.barRow}>
                  <ThemedText style={styles.barStarNumber}>{d.star}</ThemedText>
                  <View
                    style={[
                      styles.barTrack,
                      { backgroundColor: isDark ? '#334155' : '#E2E8F0' },
                    ]}>
                    <View
                      style={[
                        styles.barFill,
                        { width: `${d.pct}%` },
                      ]}
                    />
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* Seller Profile Summary Card */}
          <View
            style={[
              styles.card,
              styles.sellerCardRow,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}>
            <View style={styles.avatarCircle}>
              <ThemedText style={styles.avatarText}>
                {sellerName.charAt(0) || 'ม'}
              </ThemedText>
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={[styles.sellerNameText, { color: theme.text }]}>
                {sellerName}
              </ThemedText>
              <ThemedText style={styles.sellerBadgeText}>
                ✓ ผู้ขายยืนยันตัวตนแล้ว · ขายแล้ว 41 ชิ้น
              </ThemedText>
            </View>
          </View>

          {/* Review List */}
          <View style={{ gap: 10 }}>
            {reviews.map(item => (
              <View
                key={item.id}
                style={[
                  styles.card,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                  },
                ]}>
                <View style={styles.reviewHeaderRow}>
                  <ThemedText style={[styles.reviewerName, { color: theme.text }]}>
                    {item.who}
                  </ThemedText>
                  <ThemedText style={styles.reviewDateText}>
                    {item.at}
                  </ThemedText>
                </View>

                {/* Stars and product score */}
                <View style={styles.starsAndScoreRow}>
                  <ThemedText style={styles.starsRowYellow}>
                    {'★'.repeat(item.stars)}
                    <ThemedText style={styles.starsRowEmpty}>
                      {'★'.repeat(Math.max(0, 5 - item.stars))}
                    </ThemedText>
                  </ThemedText>
                  <ThemedText style={styles.productScoreLabel}>
                    สินค้า {item.productScore}/5
                  </ThemedText>
                </View>

                {item.text ? (
                  <ThemedText style={[styles.reviewCommentText, { color: theme.textSecondary }]}>
                    {item.text}
                  </ThemedText>
                ) : null}

                {item.tags.length > 0 ? (
                  <View style={styles.tagsContainer}>
                    {item.tags.map(t => (
                      <View
                        key={t}
                        style={[
                          styles.tagPill,
                          {
                            backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
                          },
                        ]}>
                        <ThemedText style={styles.tagPillText}>{t}</ThemedText>
                      </View>
                    ))}
                  </View>
                ) : null}

                <ThemedText style={styles.itemPurchasedText}>
                  ซื้อ: {item.item}
                </ThemedText>
              </View>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
  },
  headerSpacer: {
    width: 36,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  ratingScoreCol: {
    alignItems: 'center',
    width: 100,
  },
  bigRatingText: {
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 36,
  },
  starsRowYellow: {
    color: '#F59E0B',
    fontSize: 14,
    marginTop: 2,
  },
  starsRowEmpty: {
    color: '#94A3B8',
    opacity: 0.4,
  },
  reviewCountText: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  ratingBarsCol: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  barStarNumber: {
    fontSize: 10,
    color: '#94A3B8',
    width: 10,
    textAlign: 'center',
  },
  barTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: '#F59E0B',
    borderRadius: 3,
  },
  sellerCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#059669',
    fontSize: 16,
    fontWeight: '700',
  },
  sellerNameText: {
    fontSize: 13,
    fontWeight: '700',
  },
  sellerBadgeText: {
    fontSize: 11,
    color: '#059669',
    marginTop: 1,
    fontWeight: '500',
  },
  reviewHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reviewerName: {
    fontSize: 13,
    fontWeight: '600',
  },
  reviewDateText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  starsAndScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  productScoreLabel: {
    fontSize: 11,
    color: '#94A3B8',
  },
  reviewCommentText: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  tagPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  tagPillText: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '500',
  },
  itemPurchasedText: {
    fontSize: 10.5,
    color: '#94A3B8',
    marginTop: 6,
  },
});
