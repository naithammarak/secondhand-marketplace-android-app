import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useAuth } from '@/auth/auth-provider';
import { marketplaceReturn } from '@/auth/marketplace-return-instance';
import { useVerification } from '@/verification/verification-provider';
import { useTheme } from '@/hooks/use-theme';
import { useThemePreference } from '@/theme/theme-provider';
import { MarketplaceHeader } from './marketplace-header';
import { MarketplaceNav } from './marketplace-nav';
import { Button, Loading, Screen } from './order-ui';
import { ThemedText } from './themed-text';
import { WondeeMascot, type MascotVariant } from './wondee/brand';
import { WondeeLoader } from './wondee/loader';

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
  const { preference, scheme, setPreference } = useThemePreference();
  const isDark = scheme === 'dark';
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

  const [isManualRefresh, setIsManualRefresh] = useState(false);

  const handleManualRefresh = useCallback(async () => {
    setIsManualRefresh(true);
    try {
      if (owner) await auth.retryAccount();
      if (
        owner &&
        state.owner === owner &&
        (auth.account?.role === 'BUYER' || auth.account?.role === 'SELLER')
      ) {
        await store.refresh();
      }
    } finally {
      setIsManualRefresh(false);
    }
  }, [auth, owner, state.owner, store]);

  const pullToRefresh = usePullToRefresh({
    refreshing: isManualRefresh,
    onRefresh: () => {
      void handleManualRefresh();
    },
  });

  return (
    <Screen>
      <SafeAreaView style={[styles.screenContent, { flex: 1, alignSelf: 'center' }]}>
        <MarketplaceHeader title="ฉัน" />

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          alwaysBounceVertical={true}
          onScroll={pullToRefresh.handleScroll}
          scrollEventThrottle={16}
          {...(Platform.OS === 'web'
            ? {
                onWheel: pullToRefresh.handleWheel,
                onPointerDown: pullToRefresh.handlePointerDown,
                onPointerUp: pullToRefresh.handlePointerUp,
              }
            : {})}
          refreshControl={
            <RefreshControl
              refreshing={isManualRefresh}
              colors={['#059669']}
              tintColor="#059669"
              onRefresh={handleManualRefresh}
            />
          }>
          {Platform.OS === 'web' && isManualRefresh ? (
            <View style={{ paddingVertical: 8, alignItems: 'center' }}>
              <Loading label="กำลังอัปเดตบัญชี..." />
            </View>
          ) : null}
          {auth.initializing ? (
            <Loading label="กำลังตรวจสอบบัญชี" />
          ) : (
            <>
              {/* Card 1: User Identity Card */}
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: theme.surface,
                    borderColor: isDark ? '#1E293B' : '#EDF2F7',
                    shadowColor: '#0F172A',
                    shadowOpacity: isDark ? 0.25 : 0.06,
                  },
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
                    <View
                      style={[
                        styles.avatarCircle,
                        {
                          backgroundColor: isDark ? '#07241D' : '#ECFDF5',
                          borderColor: '#10B981',
                        },
                      ]}>
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
                      <View
                        style={[
                          styles.roleBadge,
                          isDark ? styles.roleBadgeDark : styles.roleBadgeLight,
                        ]}>
                        <ThemedText
                          style={[
                            styles.roleBadgeText,
                            isDark ? styles.roleBadgeTextDark : styles.roleBadgeTextLight,
                          ]}>
                          {roleText}
                        </ThemedText>
                      </View>
                    </View>

                    <View style={styles.memberStatusRow}>
                      <ThemedText style={styles.memberDateText}>สมาชิก ก.ย. 2026</ThemedText>
                    </View>
                  </View>
                </View>

                {!account && auth.accountChecking && <Loading label="กำลังอัปเดตบัญชี" />}
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

              {/* Card 2: Open Shop Card (Prototype vfRenderCard: NONE / PENDING / REJECTED) */}
              {customer && !approved && (
                <View
                  style={[
                    styles.sellerBanner,
                    isDark ? styles.sellerBannerDark : styles.sellerBannerLight,
                  ]}>
                  {record?.status === 'PENDING' ? (
                    <View style={{ gap: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <WondeeLoader size={36} accessibilityLabel="กำลังตรวจสอบคำขอเปิดร้าน" />
                        <View style={{ flex: 1 }}>
                          <ThemedText style={[styles.sellerBannerTitle, isDark ? styles.sellerBannerTitleDark : styles.sellerBannerTitleLight]}>
                            กำลังตรวจสอบคำขอเปิดร้าน
                          </ThemedText>
                          <ThemedText style={[styles.sellerBannerSubtitle, isDark ? styles.sellerBannerSubtitleDark : styles.sellerBannerSubtitleLight]}>
                            ปกติใช้เวลา 1–2 วันทำการ
                          </ThemedText>
                        </View>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={openShopBtnLabel}
                        onPress={() => router.push('/seller-verification')}
                        style={({ pressed }) => [
                          styles.openShopButton,
                          isDark ? styles.openShopButtonDark : styles.openShopButtonLight,
                          { opacity: pressed ? 0.85 : 1, width: '100%' },
                        ]}>
                        <ThemedText style={styles.openShopButtonText}>ดูสถานะคำขอ</ThemedText>
                      </Pressable>
                    </View>
                  ) : record?.status === 'REJECTED' ? (
                    <View style={{ gap: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <View style={[styles.tagIconCircle, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.18)' : '#FEE2E2' }]}>
                          <ThemedText style={{ fontSize: 18, color: '#EF4444', fontWeight: '800' }}>!</ThemedText>
                        </View>
                        <View style={{ flex: 1 }}>
                          <ThemedText style={[styles.sellerBannerTitle, { color: '#EF4444' }]}>
                            คำขอเปิดร้านถูกปฏิเสธ
                          </ThemedText>
                          <ThemedText style={[styles.sellerBannerSubtitle, isDark ? styles.sellerBannerSubtitleDark : styles.sellerBannerSubtitleLight]}>
                            ดูเหตุผลแล้วแก้ไขส่งใหม่ได้
                          </ThemedText>
                        </View>
                      </View>
                      {!!record?.rejectReason && (
                        <View style={{ backgroundColor: isDark ? 'rgba(239, 68, 68, 0.1)' : '#FEF2F2', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: isDark ? 'rgba(239, 68, 68, 0.3)' : '#FCA5A5' }}>
                          <ThemedText style={{ color: '#EF4444', fontSize: 12, lineHeight: 16 }}>
                            {record.rejectReason}
                          </ThemedText>
                        </View>
                      )}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={openShopBtnLabel}
                        onPress={() => router.push('/seller-verification')}
                        style={({ pressed }) => [
                          styles.openShopButton,
                          { backgroundColor: '#059669', opacity: pressed ? 0.85 : 1, width: '100%' },
                        ]}>
                        <ThemedText style={[styles.openShopButtonText, { color: '#FFFFFF' }]}>แก้ไขและส่งใหม่</ThemedText>
                      </Pressable>
                    </View>
                  ) : waitingSellerAccess ? (
                    <View style={{ gap: 12 }}>
                      <ThemedText style={[styles.sellerBannerTitle, isDark ? styles.sellerBannerTitleDark : styles.sellerBannerTitleLight]}>
                        คำขอร้านได้รับอนุมัติแล้ว
                      </ThemedText>
                      <ThemedText style={[styles.sellerBannerSubtitle, isDark ? styles.sellerBannerSubtitleDark : styles.sellerBannerSubtitleLight]}>
                        บัญชียังรอเปิดสิทธิ์ผู้ขาย กรุณาตรวจสอบสิทธิ์อีกครั้งหรือติดต่อผู้ดูแล
                      </ThemedText>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={openShopBtnLabel}
                        onPress={() => { void auth.retryAccount(); }}
                        style={({ pressed }) => [
                          styles.openShopButton,
                          isDark ? styles.openShopButtonDark : styles.openShopButtonLight,
                          { opacity: pressed ? 0.85 : 1, width: '100%' },
                        ]}>
                        <ThemedText style={styles.openShopButtonText}>{openShopBtnLabel}</ThemedText>
                      </Pressable>
                    </View>
                  ) : (
                    <View style={{ gap: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                        <View style={[styles.tagIconCircle, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#D1FAE5' }]}>
                          <ThemedText style={{ fontSize: 20 }}>🏪</ThemedText>
                        </View>
                        <View style={{ flex: 1 }}>
                          <ThemedText style={[styles.sellerBannerTitle, isDark ? styles.sellerBannerTitleDark : styles.sellerBannerTitleLight]}>
                            เปิดร้าน ขายของได้ใน 3 ขั้น
                          </ThemedText>
                          <ThemedText style={[styles.sellerBannerSubtitle, isDark ? styles.sellerBannerSubtitleDark : styles.sellerBannerSubtitleLight, { marginTop: 2 }]}>
                            ยืนยันตัวตนด้วยบัตรประชาชนและบัญชีธนาคาร แล้วเริ่มลงขายได้เลย
                          </ThemedText>
                        </View>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={openShopBtnLabel}
                        onPress={() => router.push('/seller-verification')}
                        style={({ pressed }) => [
                          styles.openShopButton,
                          { backgroundColor: '#059669', opacity: pressed ? 0.85 : 1, width: '100%' },
                        ]}>
                        <ThemedText style={[styles.openShopButtonText, { color: '#FFFFFF' }]}>
                          {openShopBtnLabel === 'ขอเปิดร้านค้า' ? 'เริ่มยืนยันตัวตน' : openShopBtnLabel}
                        </ThemedText>
                      </Pressable>
                    </View>
                  )}
                </View>
              )}

              {/* Card 2 (Alternative): Approved Seller Shop Tools */}
              {approved && (
                <View
                  style={[
                    styles.card,
                    {
                      backgroundColor: theme.surface,
                      borderColor: isDark ? '#1E293B' : '#EDF2F7',
                      shadowColor: '#0F172A',
                      shadowOpacity: isDark ? 0.25 : 0.06,
                    },
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
                      borderColor: isDark ? '#1E293B' : '#EDF2F7',
                      shadowColor: '#0F172A',
                      shadowOpacity: isDark ? 0.2 : 0.06,
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
                      borderColor: isDark ? '#1E293B' : '#EDF2F7',
                      shadowColor: '#0F172A',
                      shadowOpacity: isDark ? 0.2 : 0.06,
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
                      borderColor: isDark ? '#1E293B' : '#EDF2F7',
                      shadowColor: '#0F172A',
                      shadowOpacity: isDark ? 0.2 : 0.06,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}>
                  <ThemedText style={[styles.statNumber, { color: '#10B981' }]}>1</ThemedText>
                  <ThemedText style={styles.statLabel}>คูปองส่วนลด</ThemedText>
                </Pressable>
              </View>

              {/* Card 4: Wondee Inspection Hub */}
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: theme.surface,
                    borderColor: isDark ? '#1E293B' : '#EDF2F7',
                    shadowColor: '#0F172A',
                    shadowOpacity: isDark ? 0.25 : 0.06,
                  },
                ]}>
                {/* Hub Header */}
                <View style={styles.hubHeaderRow}>
                  <View
                    style={[
                      styles.shieldIconContainer,
                      {
                        backgroundColor: isDark ? '#0D2822' : '#ECFDF5',
                        borderColor: isDark ? 'transparent' : '#A7F3D0',
                        borderWidth: isDark ? 0 : 1,
                      },
                    ]}>
                    <ThemedText style={{ fontSize: 18 }}>🛡️</ThemedText>
                  </View>
                  <View style={styles.hubTitleContainer}>
                    <ThemedText style={[styles.hubTitleText, { color: theme.text }]}>
                      Wondee Inspection Hub
                    </ThemedText>
                    <ThemedText style={[styles.hubSubtitleText, { color: isDark ? '#2DD4BF' : '#0D9488' }]}>
                      ศูนย์ตรวจสอบสภาพ & ออกใบรับรอง
                    </ThemedText>
                  </View>
                  <View
                    style={[
                      styles.officialBadge,
                      {
                        backgroundColor: isDark ? '#092D27' : '#CCFBF1',
                        borderColor: isDark ? 'rgba(15, 118, 110, 0.3)' : '#5EEAD4',
                      },
                    ]}>
                    <ThemedText
                      style={[
                        styles.officialBadgeText,
                        { color: isDark ? '#2DD4BF' : '#0F766E' },
                      ]}>
                      Official
                    </ThemedText>
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
                        backgroundColor: isDark ? '#10151F' : '#F8FAFC',
                        borderColor: isDark ? '#1E293B' : '#E2E8F0',
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
                        backgroundColor: isDark ? '#10151F' : '#F8FAFC',
                        borderColor: isDark ? '#1E293B' : '#E2E8F0',
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
                    {
                      backgroundColor: isDark ? '#0C2624' : '#F0FDFA',
                      borderColor: isDark ? 'rgba(15, 118, 110, 0.3)' : '#99F6E4',
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}>
                  <ThemedText style={{ fontSize: 16 }}>🔬</ThemedText>
                  <ThemedText
                    style={[
                      styles.inspectorButtonText,
                      { color: isDark ? '#2DD4BF' : '#0D9488' },
                    ]}>
                    เข้าสู่มุมมองเจ้าหน้าที่ตรวจ (INS-042)
                  </ThemedText>
                  <ThemedText
                    style={[
                      styles.inspectorChevron,
                      { color: isDark ? '#2DD4BF' : '#0D9488' },
                    ]}>
                    ›
                  </ThemedText>
                </Pressable>
              </View>

              {/* Staff Roles (Admin / Inspector / Courier) */}
              {account?.role === 'ADMIN' && (
                <View
                  style={[
                    styles.card,
                    {
                      backgroundColor: theme.surface,
                      borderColor: isDark ? '#1E293B' : '#EDF2F7',
                      shadowColor: '#0F172A',
                      shadowOpacity: isDark ? 0.25 : 0.06,
                    },
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
                  <Button
                    label="จัดการใบรับรอง"
                    disabled={auth.accountChecking}
                    onPress={() => router.push('/admin-certificates')}
                  />
                </View>
              )}
              {account?.role === 'COURIER' && (
                <View
                  style={[
                    styles.card,
                    {
                      backgroundColor: theme.surface,
                      borderColor: isDark ? '#1E293B' : '#EDF2F7',
                      shadowColor: '#0F172A',
                      shadowOpacity: isDark ? 0.25 : 0.06,
                    },
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
                    {
                      backgroundColor: theme.surface,
                      borderColor: isDark ? '#1E293B' : '#EDF2F7',
                      shadowColor: '#0F172A',
                      shadowOpacity: isDark ? 0.25 : 0.06,
                    },
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
                  {
                    backgroundColor: theme.surface,
                    borderColor: isDark ? '#1E293B' : '#EDF2F7',
                    shadowColor: '#0F172A',
                    shadowOpacity: isDark ? 0.25 : 0.06,
                    padding: 0,
                  },
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

                <View style={[styles.menuDivider, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]} />

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
                  {
                    backgroundColor: theme.surface,
                    borderColor: isDark ? '#1E293B' : '#EDF2F7',
                    shadowColor: '#0F172A',
                    shadowOpacity: isDark ? 0.25 : 0.06,
                  },
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
                    {
                      backgroundColor: isDark ? '#0F141D' : '#F1F5F9',
                      borderWidth: isDark ? 0 : 1,
                      borderColor: '#E2E8F0',
                    },
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
                      borderColor: isDark ? '#EF444444' : '#FECACA',
                      backgroundColor: pressed
                        ? isDark ? '#EF444420' : '#FEE2E2'
                        : isDark ? 'transparent' : '#FEF2F2',
                      shadowColor: '#EF4444',
                      shadowOpacity: isDark ? 0 : 0.05,
                      opacity: pressed ? 0.85 : 1,
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
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 3,
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
    borderWidth: 2.5,
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
    elevation: 3,
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
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
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
  },
  roleBadgeDark: {
    backgroundColor: '#064e3b',
    borderColor: '#047857',
  },
  roleBadgeLight: {
    backgroundColor: '#d1fae5',
    borderColor: '#a7f3d0',
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  roleBadgeTextDark: {
    color: '#34d399',
  },
  roleBadgeTextLight: {
    color: '#065f46',
  },
  memberStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  memberDateText: {
    fontSize: 12,
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
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  sellerBannerDark: {
    backgroundColor: '#07241d',
    borderColor: 'rgba(16, 185, 129, 0.25)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  sellerBannerLight: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  sellerBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  opportunityBadge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  opportunityBadgeDark: {
    backgroundColor: '#10b981',
  },
  opportunityBadgeLight: {
    backgroundColor: '#10b981',
  },
  opportunityBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  opportunityBadgeTextDark: {
    color: '#022c22',
  },
  opportunityBadgeTextLight: {
    color: '#ffffff',
  },
  tagIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagIconCircleDark: {
    backgroundColor: '#0d382d',
  },
  tagIconCircleLight: {
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  sellerBannerTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },
  sellerBannerTitleDark: {
    color: '#FFFFFF',
  },
  sellerBannerTitleLight: {
    color: '#0f172a',
  },
  sellerBannerSubtitle: {
    fontSize: 12,
    lineHeight: 18,
  },
  sellerBannerSubtitleDark: {
    color: '#94a3b8',
  },
  sellerBannerSubtitleLight: {
    color: '#475569',
  },
  sellerBannerDivider: {
    height: 1,
    marginVertical: 4,
  },
  sellerBannerDividerDark: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  sellerBannerDividerLight: {
    backgroundColor: '#dcfce7',
  },
  sellerBannerFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  idCardNotice: {
    fontSize: 12,
  },
  idCardNoticeDark: {
    color: '#10b981',
    fontWeight: '500',
  },
  idCardNoticeLight: {
    color: '#059669',
    fontWeight: '600',
  },
  openShopButton: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  openShopButtonDark: {
    backgroundColor: '#10b981',
  },
  openShopButtonLight: {
    backgroundColor: '#059669',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
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
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 2,
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
  },
  officialBadge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  officialBadgeText: {
    fontSize: 10,
    fontWeight: '700',
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
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  inspectorButtonText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
    marginLeft: 8,
  },
  inspectorChevron: {
    fontSize: 16,
    fontWeight: '700',
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
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
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
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 1,
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
