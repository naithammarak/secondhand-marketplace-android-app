import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';
import { useThemePreference } from '@/theme/theme-provider';
import { ThemedText } from './themed-text';
import { BrandIcon } from './wondee/brand-logo';
import { WondeeLoader } from './wondee/loader';
import { MaxContentWidth } from '@/constants/theme';

interface ConsentModalProps {
  visible: boolean;
  userName?: string | null;
  loading?: boolean;
  onAgree(options: { photoConsent: boolean }): void;
  onCancel(): void;
}

function CheckmarkIcon({ size = 12 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M20 6L9 17L4 12"
        stroke="#ffffff"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function ConsentModal({
  visible,
  userName,
  loading = false,
  onAgree,
  onCancel,
}: ConsentModalProps) {
  const theme = useTheme();
  const { scheme } = useThemePreference();
  const isDark = scheme === 'dark';

  const [termsAccepted, setTermsAccepted] = useState(false);
  const [photoConsent, setPhotoConsent] = useState(false);

  const displayName = userName?.trim() ? userName : 'สมชาย';

  const handleStart = () => {
    if (!termsAccepted || loading) return;
    onAgree({ photoConsent });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onCancel}
    >
      <SafeAreaView
        style={[
          styles.container,
          { backgroundColor: isDark ? '#090D16' : '#F8FAFC' },
        ]}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.scrollContent,
            { maxWidth: MaxContentWidth, alignSelf: 'center', width: '100%' },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Header & Logo */}
          <View style={styles.headerArea}>
            <View style={styles.brandIconWrapper}>
              <BrandIcon size={56} />
            </View>
            <ThemedText style={[styles.welcomeTitle, { color: theme.text }]}>
              ยินดีต้อนรับ {displayName} 👋
            </ThemedText>
            <ThemedText
              style={[styles.welcomeSubtitle, { color: theme.textSecondary }]}
            >
              สร้างบัญชีจาก Google เรียบร้อย · ก่อนเริ่มใช้งาน โปรดอ่านและยอมรับข้อตกลง
            </ThemedText>
          </View>

          {/* Card 1: Terms & PDPA (Mandatory) */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: isDark ? '#131D2E' : '#FFFFFF',
                borderColor: isDark ? '#1E293B' : '#E2E8F0',
              },
            ]}
          >
            <Pressable
              accessibilityRole="checkbox"
              accessibilityLabel="ฉันยอมรับข้อกำหนดการใช้งาน และ นโยบายความเป็นส่วนตัว ของ 2NDHAND"
              accessibilityState={{ checked: termsAccepted }}
              onPress={() => setTermsAccepted(!termsAccepted)}
              style={styles.checkboxRow}
            >
              <View
                style={[
                  styles.checkboxBox,
                  {
                    backgroundColor: termsAccepted ? '#059669' : 'transparent',
                    borderColor: termsAccepted
                      ? '#059669'
                      : isDark
                      ? '#64748B'
                      : '#CBD5E1',
                  },
                ]}
              >
                {termsAccepted && <CheckmarkIcon size={12} />}
              </View>

              <View style={{ flex: 1 }}>
                <ThemedText style={[styles.termsText, { color: theme.text }]}>
                  ฉันยอมรับ{' '}
                  <ThemedText style={styles.termsHighlight}>
                    ข้อกำหนดการใช้งาน
                  </ThemedText>{' '}
                  และ{' '}
                  <ThemedText style={styles.termsHighlight}>
                    นโยบายความเป็นส่วนตัว (PDPA)
                  </ThemedText>{' '}
                  ของ 2NDHAND <ThemedText style={styles.requiredStar}>*</ThemedText>
                </ThemedText>
              </View>
            </Pressable>

            <ThemedText
              style={[styles.termsDisclaimer, { color: theme.textSecondary }]}
            >
              เราเก็บชื่อ อีเมล และข้อมูลการสั่งซื้อเพื่อให้บริการ · ขอดู แก้ไข
              หรือลบข้อมูลได้ที่ &quot;ข้อมูลส่วนตัว&quot;
            </ThemedText>
          </View>

          {/* Card 2: Photo Consent (Optional) */}
          <View
            style={[
              styles.card,
              styles.switchRow,
              {
                backgroundColor: isDark ? '#131D2E' : '#FFFFFF',
                borderColor: isDark ? '#1E293B' : '#E2E8F0',
              },
            ]}
          >
            <View style={{ flex: 1, paddingRight: 12 }}>
              <ThemedText style={[styles.switchTitle, { color: theme.text }]}>
                ใช้รูปสินค้าของฉันเป็นฐานข้อมูลอ้างอิงการตรวจ{' '}
                <ThemedText style={styles.optionalLabel}>(ไม่บังคับ)</ThemedText>
              </ThemedText>
              <ThemedText
                style={[styles.switchDesc, { color: theme.textSecondary }]}
              >
                ช่วยให้ศูนย์ตรวจของแท้ได้แม่นยำขึ้น · สามารถเปลี่ยนได้ภายหลังที่
                &quot;ข้อมูลส่วนตัว&quot;
              </ThemedText>
            </View>

            <Switch
              accessibilityLabel="ยินยอมใช้รูปสินค้า"
              value={photoConsent}
              onValueChange={setPhotoConsent}
              trackColor={{ false: isDark ? '#334155' : '#CBD5E1', true: '#059669' }}
              thumbColor="#FFFFFF"
            />
          </View>

          {/* Card 3: Role Notice Info Box */}
          <View
            style={[
              styles.roleNoticeBox,
              {
                backgroundColor: isDark ? '#064E3B20' : '#ECFDF5',
                borderColor: isDark ? '#05966950' : '#A7F3D0',
              },
            ]}
          >
            <ThemedText style={styles.roleNoticeEmoji}>🛒</ThemedText>
            <ThemedText
              style={[
                styles.roleNoticeText,
                { color: isDark ? '#6EE7B7' : '#065F46' },
              ]}
            >
              คุณเริ่มต้นเป็น
              <ThemedText
                style={{
                  fontWeight: '700',
                  color: isDark ? '#A7F3D0' : '#047857',
                }}
              >
                ผู้ซื้อ
              </ThemedText>{' '}
              · อยากขายของ? ยืนยันตัวตนเพื่อเปิดร้านได้ทุกเมื่อที่หน้าโปรไฟล์
            </ThemedText>
          </View>
        </ScrollView>

        {/* Bottom Actions */}
        <View
          style={[
            styles.bottomBar,
            {
              backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
              borderTopColor: isDark ? '#1E293B' : '#E2E8F0',
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="เริ่มใช้งาน"
            disabled={!termsAccepted || loading}
            onPress={handleStart}
            style={({ pressed }) => [
              styles.startBtn,
              {
                backgroundColor: termsAccepted ? '#059669' : isDark ? '#1E293B' : '#E2E8F0',
                opacity: pressed ? 0.85 : !termsAccepted ? 0.5 : 1,
              },
            ]}
          >
            {loading ? (
              <WondeeLoader size={20} />
            ) : (
              <ThemedText
                style={[
                  styles.startBtnText,
                  { color: termsAccepted ? '#FFFFFF' : isDark ? '#64748B' : '#94A3B8' },
                ]}
              >
                เริ่มใช้งาน
              </ThemedText>
            )}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="ยกเลิกและออกจากระบบ"
            disabled={loading}
            onPress={onCancel}
            style={styles.cancelBtn}
          >
            <ThemedText
              style={[styles.cancelBtnText, { color: theme.textSecondary }]}
            >
              ยกเลิกและออกจากระบบ
            </ThemedText>
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
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 36,
    paddingBottom: 24,
    gap: 16,
  },
  headerArea: {
    alignItems: 'center',
    textAlign: 'center',
    marginBottom: 8,
  },
  brandIconWrapper: {
    marginBottom: 12,
  },
  welcomeTitle: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
  },
  welcomeSubtitle: {
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 12,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  termsText: {
    fontSize: 13,
    lineHeight: 20,
  },
  termsHighlight: {
    color: '#059669',
    fontWeight: '700',
  },
  requiredStar: {
    color: '#E11D48',
    fontWeight: '700',
  },
  termsDisclaimer: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8,
    paddingLeft: 34,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchTitle: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },
  optionalLabel: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '400',
  },
  switchDesc: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  roleNoticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  roleNoticeEmoji: {
    fontSize: 18,
    marginTop: 1,
  },
  roleNoticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 20,
    borderTopWidth: 1,
    gap: 10,
  },
  startBtn: {
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  cancelBtn: {
    paddingVertical: 6,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
