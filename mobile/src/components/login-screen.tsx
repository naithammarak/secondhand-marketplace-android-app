import { marketplaceReturn } from '@/auth/marketplace-return-instance';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { useAuth } from '@/auth/auth-provider';
import { createLoginController, type LoginAdapter, type LoginState } from '@/auth/login-controller';
import { ThemedText } from './themed-text';
import { Button, Loading, Screen } from './order-ui';
import { BrandIcon, BrandWordmark } from './wondee/brand-logo';
import { useTheme } from '@/hooks/use-theme';
import { useThemePreference } from '@/theme/theme-provider';

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
  const params = typeof useLocalSearchParams === 'function' ? (useLocalSearchParams<{ reason?: string }>() ?? {}) : {};
  const reasonText = params?.reason ? (params.reason === 'buy' ? 'เข้าสู่ระบบเพื่อซื้อสินค้าชิ้นนี้' : params.reason) : null;

  const [controller] = useState(() => createLoginController(adapterOverride ?? auth.loginAdapter));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const hadSession = useRef(false);
  const redirected = useRef(false);

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
    // ปิดหน้า login = เลือกดูสินค้าต่อ จึงล้างปลายทางที่จะพากลับหลังล็อกอินด้วย
    controller.cancel();
    void marketplaceReturn.clear().catch(() => undefined);
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const errorState = auth.accountError ?? (['cancelled', 'oauth-error', 'backend-error', 'unauthorized', 'forbidden', 'network-error', 'server-error', 'unavailable'].includes(state) ? state : null);
  const checking = auth.initializing || auth.accountChecking;

  return (
    <Screen>
      <SafeAreaView style={[localStyles.page, { backgroundColor: theme.background }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="ปิด"
          onPress={handleClose}
          style={({ pressed }) => [localStyles.closeBtn, { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 }]}>
          <CloseIcon color={theme.text} size={20} />
        </Pressable>

        <ScrollView contentContainerStyle={localStyles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={localStyles.brandHeader}>
            <BrandIcon size={84} />
            <View style={{ marginTop: 8 }}>
              <BrandWordmark width={150} height={53} />
            </View>
            <ThemedText style={[localStyles.tagline, { color: theme.textSecondary }]}>
              ตลาดมือสองที่ตรวจสภาพก่อนถึงมือคุณ
            </ThemedText>
            {reasonText ? (
              <View style={localStyles.reasonBadge}>
                <ThemedText style={localStyles.reasonBadgeText}>{reasonText}</ThemedText>
              </View>
            ) : null}
          </View>

          <View style={[localStyles.featuresCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {[
              { icon: <SearchCheckIcon color="#0ea5e9" size={18} />, bg: 'rgba(14, 165, 233, 0.15)', title: 'ตรวจสินค้าทุกชิ้น', desc: 'ศูนย์ตรวจสภาพและความแท้ก่อนส่งถึงคุณ' },
              { icon: <ShieldMoneyIcon color="#10b981" size={18} />, bg: 'rgba(16, 185, 129, 0.15)', title: 'พักเงินจนได้ของ', desc: 'เงินถึงผู้ขายเมื่อคุณได้รับสินค้าแล้วเท่านั้น' },
              { icon: <VerifiedStoreIcon color="#8b5cf6" size={18} />, bg: 'rgba(139, 92, 246, 0.15)', title: 'ผู้ขายยืนยันตัวตน', desc: 'ตรวจบัตรประชาชนและบัญชีธนาคารทุกร้าน' },
            ].map(feature => (
              <View key={feature.title} style={localStyles.featureRow}>
                <View style={[localStyles.featureIcon, { backgroundColor: feature.bg }]}>{feature.icon}</View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={[localStyles.featureTitle, { color: theme.text }]}>{feature.title}</ThemedText>
                  <ThemedText style={[localStyles.featureDesc, { color: theme.textSecondary }]}>{feature.desc}</ThemedText>
                </View>
              </View>
            ))}
          </View>

          {/* ส่วนล่าง: ปุ่ม Google แบบ design หรือสถานะบัญชีเมื่อเข้าสู่ระบบแล้ว */}
          <View style={localStyles.bottom}>
            {errorState ? (
              <View accessibilityRole="alert" style={[localStyles.notice, state === 'cancelled' && !auth.accountError ? localStyles.noticeNeutral : localStyles.noticeError]}>
                <ThemedText style={[localStyles.noticeText, { color: state === 'cancelled' && !auth.accountError ? theme.textSecondary : '#f43f5e' }]}>
                  {messages[errorState]}
                </ThemedText>
              </View>
            ) : null}

            {checking ? <Loading label="กำลังตรวจสอบบัญชี" /> : null}

            {!auth.session ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="เข้าสู่ระบบด้วย Google"
                  accessibilityState={{ disabled: busy || state === 'unavailable', busy }}
                  disabled={busy || state === 'unavailable'}
                  onPress={() => { void controller.start(); }}
                  style={({ pressed }) => [
                    localStyles.googleBtn,
                    { borderColor: isDark ? '#ffffff' : '#dadce0', opacity: busy || state === 'unavailable' ? 0.6 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
                  ]}>
                  {busy ? <ActivityIndicator color="#1f2937" /> : <GoogleIcon />}
                  <ThemedText style={localStyles.googleText}>{busy ? messages[state] : 'เข้าสู่ระบบด้วย Google'}</ThemedText>
                </Pressable>
                {busy ? (
                  <Pressable accessibilityRole="button" accessibilityLabel="ยกเลิกการเข้าสู่ระบบ" onPress={() => controller.cancel()} style={localStyles.linkBtn}>
                    <ThemedText style={[localStyles.linkText, { color: theme.textSecondary }]}>ยกเลิกการเข้าสู่ระบบ</ThemedText>
                  </Pressable>
                ) : null}
              </>
            ) : (
              <View style={[localStyles.sessionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <ThemedText accessibilityLiveRegion="polite" style={[localStyles.sessionText, { color: theme.text }]}>
                  {auth.accountError ? messages[auth.accountError] : checking ? messages.processing : 'คุณเข้าสู่ระบบอยู่แล้ว'}
                </ThemedText>
                {auth.accountError ? <Button label="ลองตรวจบัญชีอีกครั้ง" onPress={() => { void auth.retryAccount(); }} /> : null}
                {!auth.accountError && !auth.accountChecking && !accountReady ? <>
                  <ThemedText accessibilityRole="alert" style={[localStyles.noticeText, { color: '#f43f5e' }]}>บริการบัญชียังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง</ThemedText>
                  <Button label="อัปเดตบัญชี" onPress={() => { void auth.retryAccount(); }} />
                </> : null}
                {accountReady && !auth.accountError && !auth.accountChecking
                  ? <Button label="ไปที่โปรไฟล์" variant="primary" onPress={() => router.replace('/profile')} /> : null}
              </View>
            )}

            <ThemedText style={[localStyles.legal, { color: isDark ? '#64748b' : '#94a3b8' }]}>
              อ่านและบันทึกการรับทราบได้ที่โปรไฟล์:{' '}
              <ThemedText style={localStyles.legalLink}>ข้อกำหนดการใช้งาน</ThemedText>
              {' '}และ{' '}
              <ThemedText style={localStyles.legalLink}>นโยบายความเป็นส่วนตัว</ThemedText>
            </ThemedText>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

function GoogleIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.05h3.9c2.28-2.1 3.64-5.2 3.64-9.14z" />
      <Path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.9-3.05c-1.08.72-2.45 1.16-4.03 1.16-3.1 0-5.72-2.1-6.66-4.93H1.3v3.13C3.28 21.36 7.37 24 12 24z" />
      <Path fill="#FBBC05" d="M5.34 14.27c-.24-.72-.38-1.49-.38-2.27s.14-1.55.38-2.27V6.6H1.3C.47 8.24 0 10.06 0 12s.47 3.76 1.3 5.4l4.04-3.13z" />
      <Path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.45-3.45C17.95 1.19 15.24 0 12 0 7.37 0 3.28 2.64 1.3 6.6l4.04 3.13C6.28 6.85 8.9 4.75 12 4.75z" />
    </Svg>
  );
}

const localStyles = StyleSheet.create({
  page: { flex: 1, width: '100%', alignSelf: 'center' },
  closeBtn: {
    position: 'absolute',
    left: 12,
    top: 12,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 16,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  brandHeader: { alignItems: 'center' },
  tagline: { fontSize: 14, lineHeight: 20, marginTop: 10, textAlign: 'center' },
  reasonBadge: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  reasonBadgeText: { color: '#059669', fontSize: 11.5, lineHeight: 16, fontWeight: '700' },
  featuresCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 14, marginTop: 24 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  featureIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  featureTitle: { fontSize: 12.5, lineHeight: 18, fontWeight: '700' },
  featureDesc: { fontSize: 11, lineHeight: 16 },
  bottom: { marginTop: 'auto', paddingTop: 24, gap: 12 },
  notice: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  noticeError: { backgroundColor: 'rgba(244, 63, 94, 0.1)' },
  noticeNeutral: { backgroundColor: 'rgba(100, 116, 139, 0.12)' },
  noticeText: { fontSize: 11.5, lineHeight: 17, fontWeight: '600' },
  googleBtn: {
    height: 48,
    borderRadius: 16,
    borderWidth: 1.5,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  googleText: { color: '#1f2937', fontSize: 13, fontWeight: '700' },
  linkBtn: { alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 12 },
  linkText: { fontSize: 12, fontWeight: '600' },
  sessionCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 10 },
  sessionText: { fontSize: 13, lineHeight: 19, fontWeight: '600' },
  legal: { fontSize: 10.5, lineHeight: 17, textAlign: 'center', paddingHorizontal: 8, marginTop: 4 },
  legalLink: { fontSize: 10.5, fontWeight: '700', color: '#10b981' },
});
