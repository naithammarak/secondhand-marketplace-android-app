import { marketplaceReturn } from '@/auth/marketplace-return-instance';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { useAuth } from '@/auth/auth-provider';
import { createLoginController, type LoginAdapter, type LoginState } from '@/auth/login-controller';
import { ThemedText } from './themed-text';
import { Button, Card, Loading, Screen, styles as orderUiStyles } from './order-ui';
import { BrandIcon, BrandWordmark } from './wondee/brand-logo';
import { useTheme } from '@/hooks/use-theme';
import { useThemePreference } from '@/theme/theme-provider';
import { MaxContentWidth } from '@/constants/theme';
import { ConsentModal } from './consent-modal';

const messages: Record<LoginState, string> = {
  ready: 'เข้าสู่ระบบเพื่อใช้งานบัญชีของคุณ',
  unavailable: 'ยังไม่เปิดให้เข้าสู่ระบบ กรุณาลองใหม่ภายหลัง',
  waiting: 'กำลังเข้าสู่ระบบผ่าน Google',
  processing: 'กำลังตรวจสอบบัญชี',
  cancelled: 'ยกเลิกการเข้าสู่ระบบแล้ว คุณสามารถลองใหม่ได้',
  'oauth-error': 'เข้าสู่ระบบ Google ไม่สำเร็จ กรุณาลองใหม่',
  'backend-error': 'ตรวจสอบบัญชีไม่สำเร็จ กรุณาลองใหม่',
  unauthorized: 'เซสชันไม่พร้อมใช้งาน กรุณาเข้าสู่ระบบใหม่',
  forbidden: 'บัญชียังไม่ได้รับสิทธิ์ใช้งาน กรุณาติดต่อผู้ดูแล',
  'network-error': 'เชื่อมต่อบริการตรวจบัญชีไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่',
  'server-error': 'บริการตรวจสอบบัญชีขัดข้อง กรุณาลองใหม่ภายหลัง',
  success: 'เข้าสู่ระบบและตรวจสอบบัญชีสำเร็จ',
};

function CloseIcon({ color = '#64748B', size = 20 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 6L18 18M18 6L6 18" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
    </Svg>
  );
}

function SearchCheckIcon({ color = '#0284C7', size = 20 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="11" cy="11" r="6.5" stroke={color} strokeWidth="2" />
      <Path d="M20 20L15.8 15.8M8.5 11L10.3 12.8L13.5 9.5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ShieldMoneyIcon({ color = '#059669', size = 20 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3L19.5 6V11.5C19.5 15.9 16.3 19.8 12 21C7.7 19.8 4.5 15.9 4.5 11.5V6L12 3Z" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <Path d="M12 8.5V15.5M9.8 10.3C9.8 9.3 10.8 8.7 12 8.7C13.2 8.7 14.2 9.3 14.2 10.3C14.2 11.3 13.2 11.7 12 12C10.8 12.3 9.8 12.7 9.8 13.7C9.8 14.7 10.8 15.3 12 15.3C13.2 15.3 14.2 14.7 14.2 13.7" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

function VerifiedStoreIcon({ color = '#7C3AED', size = 20 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="5" width="18" height="14" rx="2.5" stroke={color} strokeWidth="2" />
      <Circle cx="9" cy="11" r="2.2" stroke={color} strokeWidth="2" />
      <Path d="M5.8 16C6.4 14.5 7.6 13.7 9 13.7C10.4 13.7 11.6 14.5 12.2 16M14.5 10H18.5M14.5 13.5H17.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

export function LoginScreen({ adapter: adapterOverride }: { adapter?: LoginAdapter }) {
  const auth = useAuth();
  const theme = useTheme();
  const { scheme } = useThemePreference();
  const isDark = scheme === 'dark';
  const params = typeof useLocalSearchParams === 'function' ? (useLocalSearchParams<{ reason?: string; showConsent?: string }>() ?? {}) : {};
  const reasonText = params?.reason ? (params.reason === 'buy' ? 'เข้าสู่ระบบเพื่อซื้อสินค้าชิ้นนี้' : params.reason) : null;

  const [controller] = useState(() => createLoginController(adapterOverride ?? auth.loginAdapter));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const hadSession = useRef(false);
  const redirected = useRef(false);
  const [consentVisible, setConsentVisible] = useState(params.showConsent === 'true');

  useEffect(() => () => controller.cancel(), [controller]);
  useEffect(() => {
    if (state === 'cancelled') void marketplaceReturn.clear().catch(() => undefined);
  }, [state]);

  useEffect(() => {
    if (auth.session) {
      hadSession.current = true;
    } else if (hadSession.current) {
      // ออกจากระบบแล้วรีเซ็ตสถานะ เพื่อให้ปุ่ม Google กลับมาและล็อกอินซ้ำได้
      hadSession.current = false;
      redirected.current = false;
      controller.reset();
    }
  }, [auth.session, controller]);

  useEffect(() => {
    if (!auth.session || auth.initializing || auth.accountChecking || auth.accountError
      || auth.account?.source !== 'backend' || !auth.account.role || state === 'cancelled'
      || redirected.current) return;
    let active = true;
    void marketplaceReturn.peek().then(destination => {
      if (!active || !destination) return;
      redirected.current = true;
      if (destination.kind === 'checkout') router.replace({ pathname: '/checkout/[productId]', params: { productId: String(destination.productId) } });
      else router.replace(destination.kind === 'orders' ? '/orders' : '/sell');
      void marketplaceReturn.clear().catch(() => undefined);
    }).catch(() => { redirected.current = false; });
    return () => { active = false; };
  }, [auth.session, auth.initializing, auth.accountChecking, auth.accountError, auth.account, state]);

  const accountReady = auth.account?.source === 'backend' && !!auth.account.role;
  const busy = state === 'waiting' || state === 'processing';

  const handleClose = () => {
    controller.cancel();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <Screen>
      <SafeAreaView style={[orderUiStyles.content, { flex: 1, alignSelf: 'center', width: '100%', gap: 0, backgroundColor: isDark ? '#090D16' : '#F8FAFC' }]}>
        {/* Top bar with Close (X) button */}
        <View style={localStyles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="ปิด"
            onPress={handleClose}
            style={({ pressed }) => [
              localStyles.closeBtn,
              {
                backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
                borderColor: isDark ? '#334155' : '#E2E8F0',
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <CloseIcon color={theme.text} size={20} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={[localStyles.scrollContent, { maxWidth: MaxContentWidth, alignSelf: 'center', width: '100%' }]} showsVerticalScrollIndicator={false}>
          {/* Logo & Brand Header */}
          <View style={localStyles.brandHeader}>
            <BrandIcon size={76} />
            <View style={{ marginTop: 8 }}>
              <BrandWordmark width={148} height={48} />
            </View>
            <ThemedText style={[localStyles.tagline, { color: theme.textSecondary }]}>
              ตลาดมือสองที่ตรวจสภาพก่อนถึงมือคุณ
            </ThemedText>

            {/* Optional Reason Badge */}
            {reasonText && (
              <View style={[localStyles.reasonBadge, { backgroundColor: isDark ? '#064E3B30' : '#ECFDF5', borderColor: isDark ? '#05966950' : '#A7F3D0' }]}>
                <ThemedText style={localStyles.reasonBadgeText}>
                  🔒 {reasonText}
                </ThemedText>
              </View>
            )}
          </View>

          {/* Value Proposition 3 Cards */}
          <View
            style={[
              localStyles.featuresCard,
              {
                backgroundColor: isDark ? '#131D2E' : '#FFFFFF',
                borderColor: isDark ? '#1E293B' : '#E2E8F0',
              },
            ]}
          >
            <View style={localStyles.featureRow}>
              <View style={[localStyles.featureIconWrapper, { backgroundColor: isDark ? '#0369A120' : '#E0F2FE' }]}>
                <SearchCheckIcon color="#0284C7" size={20} />
              </View>
              <View style={localStyles.featureTextGroup}>
                <ThemedText style={[localStyles.featureTitle, { color: theme.text }]}>
                  ตรวจสินค้าทุกชิ้น
                </ThemedText>
                <ThemedText style={[localStyles.featureDesc, { color: theme.textSecondary }]}>
                  ศูนย์ตรวจสภาพและความแท้ก่อนส่งถึงคุณ
                </ThemedText>
              </View>
            </View>

            <View style={[localStyles.featureDivider, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]} />

            <View style={localStyles.featureRow}>
              <View style={[localStyles.featureIconWrapper, { backgroundColor: isDark ? '#065F4620' : '#ECFDF5' }]}>
                <ShieldMoneyIcon color="#059669" size={20} />
              </View>
              <View style={localStyles.featureTextGroup}>
                <ThemedText style={[localStyles.featureTitle, { color: theme.text }]}>
                  พักเงินจนได้ของ
                </ThemedText>
                <ThemedText style={[localStyles.featureDesc, { color: theme.textSecondary }]}>
                  เงินถึงผู้ขายเมื่อคุณได้รับสินค้าแล้วเท่านั้น
                </ThemedText>
              </View>
            </View>

            <View style={[localStyles.featureDivider, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]} />

            <View style={localStyles.featureRow}>
              <View style={[localStyles.featureIconWrapper, { backgroundColor: isDark ? '#5B21B620' : '#EDE9FE' }]}>
                <VerifiedStoreIcon color="#7C3AED" size={20} />
              </View>
              <View style={localStyles.featureTextGroup}>
                <ThemedText style={[localStyles.featureTitle, { color: theme.text }]}>
                  ผู้ขายยืนยันตัวตน
                </ThemedText>
                <ThemedText style={[localStyles.featureDesc, { color: theme.textSecondary }]}>
                  ตรวจบัตรประชาชนและบัญชีธนาคารทุกร้าน
                </ThemedText>
              </View>
            </View>
          </View>

          {/* Action / Auth Status Card */}
          <Card>
            <ThemedText accessibilityLiveRegion="polite">{auth.accountError ? messages[auth.accountError] : messages[state]}</ThemedText>
            {(auth.initializing || auth.accountChecking) && <Loading label="กำลังตรวจสอบบัญชี" />}
            {!auth.session && <Button label="เข้าสู่ระบบด้วย Google" variant="primary" busy={busy} onPress={() => { void controller.start(); }} />}
            {busy && <Button label="ยกเลิกการเข้าสู่ระบบ" onPress={() => controller.cancel()} />}
            {!!auth.session && auth.accountError && <Button label="ลองตรวจบัญชีอีกครั้ง" onPress={() => { void auth.retryAccount(); }} />}
            {!!auth.session && !auth.accountError && !auth.accountChecking && !accountReady && <><ThemedText accessibilityRole="alert">บริการบัญชียังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง</ThemedText><Button label="อัปเดตบัญชี" onPress={() => { void auth.retryAccount(); }} /></>}
            {!!auth.session && accountReady && !auth.accountError && !auth.accountChecking && <Button label="ไปที่โปรไฟล์" variant="primary" onPress={() => router.replace('/profile')} />}
            <Button label="ดูสินค้าก่อน" onPress={() => { controller.cancel(); void marketplaceReturn.clear().catch(() => undefined).then(() => router.replace('/')); }} />
          </Card>

          {/* Legal disclaimer footer */}
          <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center', lineHeight: 18 }}>
            อ่านและบันทึกการรับทราบได้ที่โปรไฟล์:{' '}
            <ThemedText style={{ color: '#059669', fontWeight: '700' }}>
              ข้อกำหนดการใช้งาน
            </ThemedText>{' '}
            และ{' '}
            <ThemedText style={{ color: '#059669', fontWeight: '700' }}>
              นโยบายความเป็นส่วนตัว
            </ThemedText>
          </ThemedText>
        </ScrollView>

        {/* Consent Modal for new user onboarding */}
        <ConsentModal
          visible={consentVisible}
          userName={auth.account?.fullName ?? (auth.session?.user?.user_metadata?.full_name as string | undefined)}
          onAgree={async () => {
            setConsentVisible(false);
          }}
          onCancel={() => {
            setConsentVisible(false);
          }}
        />
      </SafeAreaView>
    </Screen>
  );
}

const localStyles = StyleSheet.create({
  topBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 20,
    justifyContent: 'center',
  },
  brandHeader: {
    alignItems: 'center',
    textAlign: 'center',
  },
  tagline: {
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },
  reasonBadge: {
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  reasonBadgeText: {
    color: '#059669',
    fontSize: 12,
    fontWeight: '700',
  },
  featuresCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTextGroup: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  featureDesc: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  featureDivider: {
    height: 1,
    width: '100%',
  },
});
