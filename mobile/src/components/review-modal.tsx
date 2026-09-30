import React, { useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';
import { useThemePreference } from '@/theme/theme-provider';
import { ThemedText } from './themed-text';
import { WondeeLoader } from './wondee/loader';

export const SELLER_REVIEW_TAGS = ['แพ็กดี', 'ตรงปก', 'ส่งไว', 'สื่อสารดี'];
export const INSPECTION_REVIEW_TAGS = [
  'ตรวจละเอียด',
  'รวดเร็ว',
  'รูปหลักฐานชัด',
  'อธิบายเข้าใจง่าย',
];

export interface ReviewSubmitData {
  orderId: number;
  productStars: number;
  sellerStars: number;
  inspectionStars: number;
  comment: string;
  sellerTags: string[];
  inspectionTags: string[];
  hasPhoto: boolean;
}

interface ReviewModalProps {
  visible: boolean;
  onClose: () => void;
  orderId: number;
  productName: string;
  sellerName?: string;
  imageUrl?: string | null;
  onSubmit: (data: ReviewSubmitData) => Promise<void> | void;
}

export function ReviewModal({
  visible,
  onClose,
  orderId,
  productName,
  sellerName = 'มายด์ มือสอง',
  imageUrl,
  onSubmit,
}: ReviewModalProps) {
  const theme = useTheme();
  const { scheme } = useThemePreference();
  const isDark = scheme === 'dark';

  const [productStars, setProductStars] = useState(0);
  const [sellerStars, setSellerStars] = useState(0);
  const [inspectionStars, setInspectionStars] = useState(0);

  const [comment, setComment] = useState('');
  const [sellerTags, setSellerTags] = useState<string[]>([]);
  const [inspectionTags, setInspectionTags] = useState<string[]>([]);
  const [hasPhoto, setHasPhoto] = useState(false);

  const [tried, setTried] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const toggleSellerTag = (tag: string) => {
    setSellerTags(current =>
      current.includes(tag) ? current.filter(t => t !== tag) : [...current, tag]
    );
  };

  const toggleInspectionTag = (tag: string) => {
    setInspectionTags(current =>
      current.includes(tag) ? current.filter(t => t !== tag) : [...current, tag]
    );
  };

  const handleSubmit = async () => {
    setTried(true);
    if (!productStars || !sellerStars || !inspectionStars) {
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        orderId,
        productStars,
        sellerStars,
        inspectionStars,
        comment: comment.trim(),
        sellerTags,
        inspectionTags,
        hasPhoto,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const renderStarSelector = (
    value: number,
    onChange: (val: number) => void,
    hasError: boolean,
    labelPrefix: string
  ) => {
    return (
      <View style={{ gap: 4 }}>
        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map(star => (
            <Pressable
              key={star}
              accessibilityRole="button"
              accessibilityLabel={`${labelPrefix} ${star} ดาว`}
              onPress={() => onChange(star)}
              hitSlop={8}
              style={styles.starTouch}>
              <ThemedText
                style={[
                  styles.starGlyph,
                  star <= value ? styles.starFilled : styles.starEmpty,
                ]}>
                ★
              </ThemedText>
            </Pressable>
          ))}
        </View>
        {hasError ? (
          <ThemedText style={styles.errorText} accessibilityRole="alert">
            กรุณาให้ดาว
          </ThemedText>
        ) : null}
      </View>
    );
  };

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
            ให้คะแนนและรีวิว
          </ThemedText>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          {/* Order / Product Summary Banner */}
          <View style={styles.orderSummaryRow}>
            <View
              style={[
                styles.itemIconBox,
                { backgroundColor: isDark ? '#1E293B' : '#E0E7FF' },
              ]}>
              {imageUrl ? (
                <Image
                  source={{ uri: imageUrl }}
                  style={styles.itemImage}
                  resizeMode="cover"
                />
              ) : (
                <ThemedText style={{ fontSize: 24 }}>📦</ThemedText>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText
                style={[styles.summaryProductName, { color: theme.text }]}
                numberOfLines={1}>
                {productName}
              </ThemedText>
              <ThemedText style={styles.summaryOrderNotice}>
                คำสั่งซื้อ #{orderId} · ส่งรีวิวแล้วแก้ไขไม่ได้
              </ThemedText>
            </View>
          </View>

          {/* Card 1: สินค้า */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}>
            <View>
              <ThemedText style={[styles.cardTitle, { color: theme.text }]}>
                1. สินค้า
              </ThemedText>
              <ThemedText style={styles.cardSubtitle}>
                ตรงกับที่ประกาศและผลตรวจไหม
              </ThemedText>
            </View>

            {renderStarSelector(
              productStars,
              setProductStars,
              tried && productStars === 0,
              'คะแนนสินค้า'
            )}

            <TextInput
              style={[
                styles.textareaInput,
                {
                  backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                  color: theme.text,
                  borderColor: theme.border,
                },
              ]}
              multiline
              numberOfLines={3}
              maxLength={500}
              placeholder="เล่าเพิ่มเติม (ไม่บังคับ)"
              placeholderTextColor="#94A3B8"
              value={comment}
              onChangeText={setComment}
            />

            <View style={styles.photoRow}>
              {hasPhoto ? (
                <View
                  style={[
                    styles.photoThumb,
                    { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' },
                  ]}>
                  <ThemedText style={{ fontSize: 20 }}>📷</ThemedText>
                </View>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="เพิ่มรูปภาพ"
                onPress={() => setHasPhoto(true)}
                style={styles.addPhotoBtn}>
                <ThemedText style={styles.addPhotoBtnText}>+ รูป</ThemedText>
              </Pressable>
            </View>
          </View>

          {/* Card 2: ผู้ขาย */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}>
            <View>
              <ThemedText style={[styles.cardTitle, { color: theme.text }]}>
                2. ผู้ขาย
              </ThemedText>
              <ThemedText style={styles.cardSubtitle}>
                {sellerName}
              </ThemedText>
            </View>

            {renderStarSelector(
              sellerStars,
              setSellerStars,
              tried && sellerStars === 0,
              'คะแนนผู้ขาย'
            )}

            <View style={styles.tagsWrapper}>
              {SELLER_REVIEW_TAGS.map(tag => {
                const selected = sellerTags.includes(tag);
                return (
                  <Pressable
                    key={tag}
                    accessibilityRole="button"
                    accessibilityLabel={`แท็ก ${tag}`}
                    onPress={() => toggleSellerTag(tag)}
                    style={[
                      styles.tagChip,
                      selected
                        ? styles.tagChipSelected
                        : [
                            styles.tagChipUnselected,
                            { borderColor: isDark ? '#334155' : '#CBD5E1' },
                          ],
                    ]}>
                    <ThemedText
                      style={[
                        styles.tagChipText,
                        selected
                          ? styles.tagChipTextSelected
                          : { color: theme.textSecondary },
                      ]}>
                      {tag}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Card 3: บริการตรวจสอบ */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}>
            <View>
              <ThemedText style={[styles.cardTitle, { color: theme.text }]}>
                3. บริการตรวจสอบ
              </ThemedText>
              <ThemedText style={styles.cardSubtitle}>
                ศูนย์ตรวจสอบ 2NDHAND · คะแนนนี้เห็นเฉพาะทีมงาน
              </ThemedText>
            </View>

            {renderStarSelector(
              inspectionStars,
              setInspectionStars,
              tried && inspectionStars === 0,
              'คะแนนบริการตรวจ'
            )}

            <View style={styles.tagsWrapper}>
              {INSPECTION_REVIEW_TAGS.map(tag => {
                const selected = inspectionTags.includes(tag);
                return (
                  <Pressable
                    key={tag}
                    accessibilityRole="button"
                    accessibilityLabel={`แท็ก ${tag}`}
                    onPress={() => toggleInspectionTag(tag)}
                    style={[
                      styles.tagChip,
                      selected
                        ? styles.tagChipSelected
                        : [
                            styles.tagChipUnselected,
                            { borderColor: isDark ? '#334155' : '#CBD5E1' },
                          ],
                    ]}>
                    <ThemedText
                      style={[
                        styles.tagChipText,
                        selected
                          ? styles.tagChipTextSelected
                          : { color: theme.textSecondary },
                      ]}>
                      {tag}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </ScrollView>

        {/* Bottom Bar with Submit Button */}
        <View
          style={[
            styles.bottomBar,
            {
              backgroundColor: theme.surface,
              borderTopColor: theme.border,
            },
          ]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="ส่งรีวิว"
            disabled={submitting}
            onPress={handleSubmit}
            style={({ pressed }) => [
              styles.submitBtn,
              { opacity: pressed || submitting ? 0.85 : 1 },
            ]}>
            {submitting ? (
              <WondeeLoader size={20} />
            ) : (
              <ThemedText style={styles.submitBtnText}>ส่งรีวิว</ThemedText>
            )}
          </Pressable>
        </View>
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
    gap: 14,
  },
  orderSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 4,
  },
  itemIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  itemImage: {
    width: 48,
    height: 48,
  },
  summaryProductName: {
    fontSize: 13,
    fontWeight: '700',
  },
  summaryOrderNotice: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  cardSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  starTouch: {
    padding: 2,
  },
  starGlyph: {
    fontSize: 32,
    lineHeight: 36,
  },
  starFilled: {
    color: '#F59E0B',
  },
  starEmpty: {
    color: '#94A3B8',
    opacity: 0.35,
  },
  errorText: {
    fontSize: 11,
    color: '#EF4444',
    fontWeight: '600',
  },
  textareaInput: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    fontSize: 12,
    textAlignVertical: 'top',
    minHeight: 64,
  },
  photoRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  photoThumb: {
    width: 56,
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoBtn: {
    width: 56,
    height: 56,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  tagsWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  tagChipSelected: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  tagChipUnselected: {
    backgroundColor: 'transparent',
  },
  tagChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  tagChipTextSelected: {
    color: '#FFFFFF',
  },
  bottomBar: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  submitBtn: {
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
