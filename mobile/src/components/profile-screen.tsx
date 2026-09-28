import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/auth-provider';
import { marketplaceReturn } from '@/auth/marketplace-return-instance';
import { useVerification } from '@/verification/verification-provider';
import { useTheme } from '@/hooks/use-theme';
import { useThemePreference, type ThemePreference } from '@/theme/theme-provider';
import { MarketplaceHeader } from './marketplace-header';
import { MarketplaceNav } from './marketplace-nav';
import { Button, Card, Loading, Screen } from './order-ui';
import { ThemedText } from './themed-text';
import { WondeeMascot, type MascotVariant } from './wondee/brand';

const statusLabels = {
  NOT_SUBMITTED: 'ขอเปิดร้านค้า',
  PENDING: 'คำขอเปิดร้านอยู่ระหว่างตรวจสอบ',
  APPROVED: 'ร้านค้าได้รับอนุมัติ',
  REJECTED: 'แก้ไขคำขอเปิดร้าน',
};

const MASCOT_OPTIONS: { variant: MascotVariant; name: string }[] = [
  { variant: 'neutral', name: 'น้องวนดี' },
  { variant: 'inspector', name: 'พี่วนดีตรวจตรา' },
  { variant: 'courier', name: 'วนดีสายส่ง' },
  { variant: 'pass', name: 'วนดีรับรองแล้ว' },
  { variant: 'minor', name: 'วนดีตาเหยี่ยว' },
];

export function ProfileScreen() {
  const auth = useAuth();
  const theme = useTheme();
  const { preference, setPreference } = useThemePreference();
  const { state, store } = useVerification();
  const [logoutError, setLogoutError] = useState(false);
  const [focused, setFocused] = useState(false);
  const [mascotIdx, setMascotIdx] = useState(0);

  const owner = auth.session?.user.id;

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      if (owner) void auth.retryAccount();
      if (
        owner &&
        state.owner === owner &&
        (auth.account?.role === 'BUYER' || auth.account?.role === 'SELLER')
      ) {
        void store.refresh();
      }
      return () => setFocused(false);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [owner, state.owner, store, auth.account?.role]),
  );

  const account =
    auth.session && !auth.accountError && auth.account?.source === 'backend' ? auth.account : null;
  const customer =
    account?.source === 'backend' && (account.role === 'BUYER' || account.role === 'SELLER');
  const record = customer && state.owner === owner ? state.record : null;
  const approved =
    account?.role === 'SELLER' && record?.status === 'APPROVED' && !state.loadError && !auth.accountChecking;
  const waitingSellerAccess = account?.role === 'BUYER' && record?.status === 'APPROVED';

  const currentMascot = MASCOT_OPTIONS[mascotIdx];
  const handleCycleMascot = () => {
    setMascotIdx(prev => (prev + 1) % MASCOT_OPTIONS.length);
  };

  const displayName = auth.session
    ? account?.fullName ?? 'คุณสมชาย ใจดี'
    : 'ยินดีต้อนรับสู่ Wondee';

  const roleText = account?.role ?? (auth.session ? 'BUYER' : 'GUEST');

  const openShopBtnLabel = waitingSellerAccess
    ? 'ตรวจสอบสิทธิ์ผู้ขายอีกครั้ง'
    : record
      ? statusLabels[record.status]
      : 'ขอเปิดร้านค้า';

  return (
    <Screen>
      <SafeAreaView style={[styles.screenContent, { flex: 1, alignSelf: 'center' }]}>
        <MarketplaceHeader title="ฉัน" />

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {auth.initializing ? (
            <Loading label="กำลังตรวจสอบบัญชี" />
          ) : (
            <>
              {/* Card 1: User Identity Card */}
              <View
                style={[
                  styles.card,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                ]}>
                <View style={styles.identityRow}>
                  {/* Mascot Avatar with Cycle Button */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="สลับรูปมาสคอต"
                    onPress={handleCycleMascot}
                    style={({ pressed }) => [
                      styles.avatarWrapper,
                      { opacity: pressed ? 0.85 : 1 },
                    ]}>
                    <View style={styles.avatarCircle}>
                      <WondeeMascot
                        size={46}
                        variant={currentMascot.variant}
                        animate={focused}
                      />
                    </View>
                    <View style={styles.switchBadge}>
                      <ThemedText style={styles.switchBadgeText}>สลับ ↺</ThemedText>
                    </View>
                  </Pressable>

                  {/* User Details */}
                  <View style={styles.identityInfo}>
                    <View style={styles.nameRoleRow}>
                      <ThemedText style={[styles.nameText, { color: theme.text }]} numberOfLines={1}>
                        {displayName}
                      </ThemedText>
                      <View style={styles.roleBadge}>
                        <ThemedText style={styles.roleBadgeText}>{roleText}</ThemedText>
                      </View>
                    </View>

                    <ThemedText style={styles.mascotSubtitleText}>
                      มาสคอต : {currentMascot.name}  ( แตะรูปเพื่อสลับ )
                    </ThemedText>

                    <View style={styles.memberStatusRow}>
                      <ThemedText style={styles.memberDateText}>สมาชิก ก.ย. 2026</ThemedText>
                      <ThemedText style={styles.memberDotText}> • </ThemedText>
                      <ThemedText style={styles.verifiedText}>
                        {auth.session ? 'ยืนยันอีเมลแล้ว' : 'เข้าสู่ระบบเพื่อใช้งาน'}
                      </ThemedText>
                    </View>
                  </View>
                </View>

                {auth.accountChecking && <Loading label="กำลังอัปเดตบัญชี" />}
                {auth.accountError && (
                  <View style={styles.accountErrorBox}>
                    <ThemedText accessibilityRole="alert" style={{ color: theme.danger }}>
                      ตรวจสอบบัญชีไม่สำเร็จ กรุณาลองใหม่
                    </ThemedText>
                    <Button
                      label="ตรวจสอบบัญชีอีกครั้ง"
                      onPress={() => {
                        void auth.retryAccount();
                      }}
                    />
                  </View>
                )}
                {auth.session && account && !account.role && (
                  <View style={styles.accountErrorBox}>
                    <ThemedText>บัญชียังไม่พร้อมใช้งาน กรุณาอัปเดตข้อมูลจากระบบ</ThemedText>
                    <Button
                      label="อัปเดตบัญชี"
                      onPress={() => {
                        void auth.retryAccount();
                      }}
                    />
                  </View>
                )}
              </View>

              {/* Card 2: Open Shop Banner (Buyer/Guest) OR Approved Seller Management */}
              {customer && !approved && (
                <View style={styles.sellerBanner}>
                  <View style={styles.sellerBannerHeader}>
                    <View style={styles.opportunityBadge}>
                      <ThemedText style={styles.opportunityBadgeText}>
                        ✨ {waitingSellerAccess ? 'อนุมัติแล้ว' : 'โอกาสสำหรับคุณ'}
                      </ThemedText>
                    </View>
                    <View style={styles.tagIconCircle}>
                      <ThemedText style={{ fontSize: 18 }}>🏷️</ThemedText>
                    </View>
                  </View>

                  <ThemedText style={styles.sellerBannerTitle}>
                    {waitingSellerAccess
                      ? 'คำขอร้านได้รับอนุมัติแล้ว'
                      : 'ต้องการเปิดร้านขายสินค้า?'}
                  </ThemedText>

                  <ThemedText style={styles.sellerBannerSubtitle}>
                    {waitingSellerAccess
                      ? 'บัญชียังรอเปิดสิทธิ์ผู้ขาย กรุณาตรวจสอบสิทธิ์อีกครั้งหรือติดต่อผู้ดูแล'
                      : 'ยกระดับบัญชีเป็นผู้ขาย ส่งต่อของรัก สร้างรายได้ง่ายๆ พร้อมระบบคุ้มครอง'}
                  </ThemedText>

                  {!!record?.rejectReason && (
                    <ThemedText style={[styles.sellerBannerSubtitle, { color: '#f87171', marginTop: 4 }]}>
                      {record.rejectReason}
                    </ThemedText>
                  )}

                  <View style={styles.sellerBannerDivider} />

                  <View style={styles.sellerBannerFooter}>
                    <ThemedText style={styles.idCardNotice}>ยืนยันตัวตนด้วยบัตร ปชช.</ThemedText>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={openShopBtnLabel}
                      onPress={() => {
                        if (waitingSellerAccess) void auth.retryAccount();
                        else router.push('/seller-verification');
                      }}
                      style={({ pressed }) => [
                        styles.openShopButton,
                        { opacity: pressed ? 0.85 : 1 },
                      ]}>
                      <ThemedText style={styles.openShopButtonText}>
                        {waitingSellerAccess ? openShopBtnLabel : `${openShopBtnLabel} >`}
                      </ThemedText>
                    </Pressable>
                  </View>
                </View>
              )}

              {/* Card 2 (Alternative): Approved Seller Shop Tools */}
              {approved && (
                <View
                  style={[
                    styles.card,
                    { backgroundColor: theme.surface, borderColor: theme.border },
                  ]}>
                  <View style={styles.sellerApprovedHeader}>
                    <View style={styles.opportunityBadge}>
                      <ThemedText style={styles.opportunityBadgeText}>✨ ร้านค้าของคุณ</ThemedText>
                    </View>
                    <ThemedText style={styles.verifiedText}>อนุมัติผู้ขายแล้ว</ThemedText>
                  </View>
                  <ThemedText style={[styles.nameText, { color: theme.text, marginTop: 4 }]}>
                    {record?.shopName ?? 'ร้านค้าที่ได้รับอนุมัติ'}
                  </ThemedText>
                  <ThemedText style={{ fontSize: 12, color: theme.textSecondary }}>
                    คุณสามารถลงขายสินค้าและจัดการคำสั่งขายได้ทันที
                  </ThemedText>
                  <View style={{ gap: 8, marginTop: 6 }}>
                    <Button
                      label="ลงขายสินค้า"
                      variant="primary"
                      onPress={() => router.push('/product/new')}
                    />
                    <Button label="สินค้าของฉัน" onPress={() => router.push('/product/mine')} />
                    <Button
                      label="คำสั่งขาย"
                      onPress={() =>
                        router.push({ pathname: '/orders', params: { view: 'seller' } })
                      }
                    />
                  </View>
                </View>
              )}

              {/* Card 3: 3 Quick Stats Cards */}
              <View style={styles.statsRow}>
                {/* 1. My Orders */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="คำสั่งซื้อของฉัน"
                  onPress={() =>
                    router.push({ pathname: '/orders', params: { view: 'buyer' } })
                  }
                  style={({ pressed }) => [
                    styles.statCard,
                    {
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}>
                  <ThemedText style={[styles.statNumber, { color: theme.text }]}>2</ThemedText>
                  <ThemedText style={styles.statLabel}>คำสั่งซื้อของฉัน</ThemedText>
                </Pressable>

                {/* 2. Favorites */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="สินค้าที่ถูกใจ"
                  onPress={() => router.push('/')}
                  style={({ pressed }) => [
                    styles.statCard,
                    {
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}>
                  <ThemedText style={[styles.statNumber, { color: theme.text }]}>5</ThemedText>
                  <ThemedText style={styles.statLabel}>สินค้าที่ถูกใจ</ThemedText>
                </Pressable>

                {/* 3. Discount Coupons */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="คูปองส่วนลด"
                  onPress={() => router.push('/')}
                  style={({ pressed }) => [
                    styles.statCard,
                    {
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}>
                  <ThemedText style={[styles.statNumber, { color: '#10b981' }]}>1</ThemedText>
                  <ThemedText style={styles.statLabel}>คูปองส่วนลด</ThemedText>
                </Pressable>
              </View>

              {/* Card 4: Wondee Inspection Hub */}
              <View
                style={[
                  styles.card,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                ]}>
                {/* Hub Header */}
                <View style={styles.hubHeaderRow}>
                  <View style={styles.shieldIconContainer}>
                    <ThemedText style={{ fontSize: 18 }}>🛡️</ThemedText>
                  </View>
                  <View style={styles.hubTitleContainer}>
                    <ThemedText style={[styles.hubTitleText, { color: theme.text }]}>
                      Wondee Inspection Hub
                    </ThemedText>
                    <ThemedText style={styles.hubSubtitleText}>
                      ศูนย์ตรวจสอบสภาพ & ออกใบรับรอง
                    </ThemedText>
                  </View>
                  <View style={styles.officialBadge}>
                    <ThemedText style={styles.officialBadgeText}>Official</ThemedText>
                  </View>
                </View>

                {/* 2 Quick Action Buttons Side-by-Side */}
                <View style={styles.hubActionsRow}>
                  {/* Seller Send Inspection */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="ผู้ขายส่งตรวจ"
                    onPress={() =>
                      router.push({ pathname: '/orders', params: { view: 'seller' } })
                    }
                    style={({ pressed }) => [
                      styles.hubSubButton,
                      {
                        backgroundColor: theme.backgroundElement ?? '#10151f',
                        borderColor: theme.border,
                        opacity: pressed ? 0.8 : 1,
                      },
                    ]}>
                    <ThemedText style={{ fontSize: 18 }}>🚚</ThemedText>
                    <View style={{ flex: 1 }}>
                      <ThemedText style={[styles.hubSubButtonTitle, { color: theme.text }]}>
                        ผู้ขายส่งตรวจ
                      </ThemedText>
                      <ThemedText style={styles.hubSubButtonSubtitle}>
                        แจ้งเลข Tracking
                      </ThemedText>
                    </View>
                  </Pressable>

                  {/* Buyer View E-Cert */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="ผู้ซื้อดู E-Cert"
                    onPress={() =>
                      router.push({ pathname: '/orders', params: { view: 'buyer' } })
                    }
                    style={({ pressed }) => [
                      styles.hubSubButton,
                      {
                        backgroundColor: theme.backgroundElement ?? '#10151f',
                        borderColor: theme.border,
                        opacity: pressed ? 0.8 : 1,
                      },
                    ]}>
                    <ThemedText style={{ fontSize: 18 }}>📜</ThemedText>
                    <View style={{ flex: 1 }}>
                      <ThemedText style={[styles.hubSubButtonTitle, { color: theme.text }]}>
                        ผู้ซื้อดู E-Cert
                      </ThemedText>
                      <ThemedText style={styles.hubSubButtonSubtitle}>
                        ผลตรวจ 4 ระดับ
                      </ThemedText>
                    </View>
                  </Pressable>
                </View>

                {/* Inspector View Button */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="เข้าสู่มุมมองเจ้าหน้าที่ตรวจ"
                  onPress={() => router.push('/inspections')}
                  style={({ pressed }) => [
                    styles.inspectorButton,
                    { opacity: pressed ? 0.85 : 1 },
                  ]}>
                  <ThemedText style={{ fontSize: 16 }}>🔬</ThemedText>
                  <ThemedText style={styles.inspectorButtonText}>
                    เข้าสู่มุมมองเจ้าหน้าที่ตรวจ (INS-042)
                  </ThemedText>
                  <ThemedText style={styles.inspectorChevron}>›</ThemedText>
                </Pressable>
              </View>

              {/* Staff Roles (Admin / Inspector / Courier) */}
              {account?.role === 'ADMIN' && (
                <View
                  style={[
                    styles.card,
                    { backgroundColor: theme.surface, borderColor: theme.border },
                  ]}>
                  <ThemedText style={[styles.menuSectionTitle, { color: theme.text }]}>
                    เมนูผู้ดูแลระบบ (Admin)
                  </ThemedText>
                  <Button
                    label="ตรวจคำขอยืนยันตัวตน"
                    onPress={() => router.push('/admin-verifications')}
                  />
                  <Button
                    label="มอบหมายผู้ขนส่ง"
                    onPress={() => router.push('/admin-deliveries')}
                  />
                </View>
              )}
              {account?.role === 'COURIER' && (
                <View
                  style={[
                    styles.card,
                    { backgroundColor: theme.surface, borderColor: theme.border },
                  ]}>
                  <ThemedText style={[styles.menuSectionTitle, { color: theme.text }]}>
                    เมนูผู้ขนส่ง (Courier)
                  </ThemedText>
                  <Button label="งานส่งเข้าศูนย์" onPress={() => router.push('/courier')} />
                </View>
              )}
              {account?.role === 'INSPECTOR' && (
                <View
                  style={[
                    styles.card,
                    { backgroundColor: theme.surface, borderColor: theme.border },
                  ]}>
                  <ThemedText style={[styles.menuSectionTitle, { color: theme.text }]}>
                    เมนูเจ้าหน้าที่ตรวจสอบ (Inspector)
                  </ThemedText>
                  <Button label="งานตรวจสินค้า" onPress={() => router.push('/inspections')} />
                </View>
              )}

              {/* Card 5: Menu List Section */}
              <View
                style={[
                  styles.card,
                  { backgroundColor: theme.surface, borderColor: theme.border, padding: 0 },
                ]}>
                {/* Menu Item 1: Order History */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="ประวัติการสั่งซื้อสินค้า"
                  onPress={() =>
                    router.push({ pathname: '/orders', params: { view: 'buyer' } })
                  }
                  style={({ pressed }) => [
                    styles.menuListItem,
                    { opacity: pressed ? 0.7 : 1 },
                  ]}>
                  <ThemedText style={styles.menuItemIcon}>📦</ThemedText>
                  <ThemedText style={[styles.menuItemTitle, { color: theme.text }]}>
                    ประวัติการสั่งซื้อสินค้า
                  </ThemedText>
                  <ThemedText style={styles.menuItemChevron}>›</ThemedText>
                </Pressable>

                <View style={[styles.menuDivider, { backgroundColor: theme.border }]} />

                {/* Menu Item 2: Shipping Address */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="ที่อยู่สำหรับจัดส่ง"
                  onPress={() =>
                    router.push({ pathname: '/orders', params: { view: 'buyer' } })
                  }
                  style={({ pressed }) => [
                    styles.menuListItem,
                    { opacity: pressed ? 0.7 : 1 },
                  ]}>
                  <ThemedText style={styles.menuItemIcon}>📍</ThemedText>
                  <ThemedText style={[styles.menuItemTitle, { color: theme.text }]}>
                    ที่อยู่สำหรับจัดส่ง
                  </ThemedText>
                  <ThemedText style={styles.menuItemChevron}>›</ThemedText>
                </Pressable>
              </View>

              {/* Card 6: Theme Preference Setting (Streamlined & Clean) */}
              <View
                style={[
                  styles.card,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                ]}>
                <View style={styles.themeHeaderRow}>
                  <ThemedText style={[styles.themeTitleText, { color: theme.text }]}>
                    🎨 การแสดงผล (ธีม)
                  </ThemedText>
                  <ThemedText style={{ fontSize: 11, color: theme.textSecondary }}>
                    {preference === 'dark'
                      ? 'โหมดมืด'
                      : preference === 'light'
                        ? 'โหมดสว่าง'
                        : 'ตามระบบ'}
                  </ThemedText>
                </View>

                {/* Sleek Segmented Pill Control */}
                <View
                  style={[
                    styles.themeSegmentContainer,
                    { backgroundColor: theme.backgroundElement ?? '#0f141d' },
                  ]}>
                  {([
                    { key: 'dark', label: 'มืด', icon: '🌙' },
                    { key: 'light', label: 'สว่าง', icon: '☀️' },
                    { key: 'system', label: 'ตามอุปกรณ์', icon: '⚙️' },
                  ] as const).map(item => {
                    const active = preference === item.key;
                    return (
                      <Pressable
                        key={item.key}
                        accessibilityRole="button"
                        accessibilityLabel={`ธีม${item.label}`}
                        onPress={() => setPreference(item.key)}
                        style={({ pressed }) => [
                          styles.themeSegmentItem,
                          active && styles.themeSegmentItemActive,
                          { opacity: pressed ? 0.8 : 1 },
                        ]}>
                        <ThemedText
                          style={[
                            styles.themeSegmentText,
                            active
                              ? styles.themeSegmentTextActive
                              : { color: theme.textSecondary },
                          ]}>
                          {item.icon} {item.label}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Logout / Login Button */}
              {auth.session ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="ออกจากระบบ"
                  onPress={() => {
                    void marketplaceReturn
                      .clear()
                      .catch(() => undefined)
                      .then(() => auth.logout())
                      .catch(() => setLogoutError(true));
                  }}
                  style={({ pressed }) => [
                    styles.logoutButton,
                    {
                      borderColor: '#ef444444',
                      backgroundColor: pressed ? '#ef444415' : 'transparent',
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}>
                  <ThemedText style={styles.logoutButtonText}>ออกจากระบบ</ThemedText>
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="เข้าสู่ระบบด้วย Google"
                  onPress={() => router.push('/login')}
                  style={({ pressed }) => [
                    styles.loginButton,
                    { opacity: pressed ? 0.85 : 1 },
                  ]}>
                  <ThemedText style={styles.loginButtonText}>เข้าสู่ระบบด้วย Google</ThemedText>
                </Pressable>
              )}

              {logoutError && (
                <ThemedText accessibilityRole="alert" style={{ color: theme.danger, textAlign: 'center' }}>
                  ออกจากระบบไม่สำเร็จ กรุณาลองใหม่
                </ThemedText>
              )}
            </>
          )}
        </ScrollView>

        <MarketplaceNav selected="profile" />
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    width: '100%',
    maxWidth: 800,
    gap: 0,
  },
  scrollContent: {
    padding: 16,
    gap: 14,
    paddingBottom: 24,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatarCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 2,
    borderColor: '#10b981',
    backgroundColor: '#07241d',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  switchBadge: {
    position: 'absolute',
    bottom: -2,
    right: -4,
    backgroundColor: '#8b5cf6',
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 2,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1,
  },
  switchBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  identityInfo: {
    flex: 1,
    gap: 4,
  },
  nameRoleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nameText: {
    fontSize: 16,
    fontWeight: '700',
  },
  roleBadge: {
    backgroundColor: '#064e3b',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#34d399',
  },
  mascotSubtitleText: {
    fontSize: 11,
    color: '#94a3b8',
  },
  memberStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
  },
  memberDateText: {
    fontSize: 11,
    color: '#94a3b8',
  },
  memberDotText: {
    fontSize: 11,
    color: '#94a3b8',
  },
  verifiedText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#10b981',
  },
  accountErrorBox: {
    gap: 6,
    paddingTop: 6,
  },
  sellerBanner: {
    backgroundColor: '#07241d',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    padding: 16,
    gap: 8,
  },
  sellerBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  opportunityBadge: {
    backgroundColor: '#10b981',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  opportunityBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#022c22',
  },
  tagIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0d382d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellerBannerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 4,
  },
  sellerBannerSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    lineHeight: 18,
  },
  sellerBannerDivider: {
    height: 1,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    marginVertical: 4,
  },
  sellerBannerFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  idCardNotice: {
    fontSize: 12,
    fontWeight: '500',
    color: '#10b981',
  },
  openShopButton: {
    backgroundColor: '#10b981',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  openShopButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  sellerApprovedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 4,
  },
  hubHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  shieldIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#0d2822',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hubTitleContainer: {
    flex: 1,
    gap: 2,
  },
  hubTitleText: {
    fontSize: 14,
    fontWeight: '700',
  },
  hubSubtitleText: {
    fontSize: 11,
    color: '#2dd4bf',
  },
  officialBadge: {
    backgroundColor: '#092d27',
    borderWidth: 1,
    borderColor: 'rgba(15, 118, 110, 0.3)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  officialBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2dd4bf',
  },
  hubActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  hubSubButton: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hubSubButtonTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  hubSubButtonSubtitle: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 1,
  },
  inspectorButton: {
    backgroundColor: '#0c2624',
    borderWidth: 1,
    borderColor: 'rgba(15, 118, 110, 0.3)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  inspectorButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2dd4bf',
    flex: 1,
    marginLeft: 8,
  },
  inspectorChevron: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2dd4bf',
  },
  menuSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  menuListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  menuItemIcon: {
    fontSize: 18,
  },
  menuItemTitle: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  menuItemChevron: {
    fontSize: 18,
    color: '#64748B',
    fontWeight: '600',
  },
  menuDivider: {
    height: 1,
  },
  themeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  themeTitleText: {
    fontSize: 13,
    fontWeight: '700',
  },
  themeSegmentContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 3,
    gap: 4,
  },
  themeSegmentItem: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeSegmentItemActive: {
    backgroundColor: '#10b981',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  themeSegmentText: {
    fontSize: 12,
    fontWeight: '500',
  },
  themeSegmentTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  logoutButton: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#EF4444',
  },
  loginButton: {
    backgroundColor: '#10b981',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

