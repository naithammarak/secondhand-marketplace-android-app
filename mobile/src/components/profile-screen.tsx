import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Constants from 'expo-constants';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
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
import { staffWorkspaceFor } from '@/navigation/routes';
import { useProfile } from '@/profile/use-profile';
import { ProfileDetails } from './profile-details';

const statusLabels = {
  NOT_SUBMITTED: 'ขอเปิดร้านค้า',
  PENDING: 'คำขอเปิดร้านอยู่ระหว่างตรวจสอบ',
  APPROVED: 'ร้านค้าได้รับอนุมัติ',
  REJECTED: 'แก้ไขคำขอเปิดร้าน',
};

export function ProfileScreen() {
  const auth = useAuth();
  const profileModel = useProfile();
  const theme = useTheme();
  const { preference, scheme, setPreference } = useThemePreference();
  const isDark = scheme === 'dark';
  const { state, store } = useVerification();
  const [logoutError, setLogoutError] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const owner = auth.session?.user.id;

  useFocusEffect(
    useCallback(() => {
      if (owner) void auth.retryAccount();
      if (
        owner &&
        state.owner === owner &&
        (auth.account?.role === 'BUYER' || auth.account?.role === 'SELLER')
      ) {
        void store.refresh();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [owner, state.owner, store, auth.account?.role]),
  );

  const account =
    auth.session && !auth.accountError && auth.account?.source === 'backend' ? auth.account : null;
  const customer =
    account?.source === 'backend' && (account.role === 'BUYER' || account.role === 'SELLER')
    && profileModel.profile?.status !== 'SUSPENDED' && profileModel.profile?.status !== 'CLOSED';
  const record = customer && state.owner === owner ? state.record : null;
  const verificationReady = state.owner === owner && !state.loading && !state.loadError && !!record;
  const approved =
    customer && account?.role === 'SELLER' && record?.status === 'APPROVED' && !state.loadError && !auth.accountChecking;
  const waitingSellerAccess = account?.role === 'BUYER' && record?.status === 'APPROVED';


  const displayName = auth.session
    ? profileModel.profile?.full_name ?? 'กำลังโหลดข้อมูลบัญชี'
    : 'ยินดีต้อนรับสู่ 2NDHAND';

  const roleText = profileModel.profile?.role ?? (auth.session ? '—' : 'GUEST');

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
      if (owner) await profileModel.reload();
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

  const muted = isDark ? '#64748b' : '#94a3b8';
  const email = profileModel.profile?.email ?? auth.session?.user?.email ?? null;
  const initial = (profileModel.profile?.full_name ?? email ?? '?').trim().charAt(0).toUpperCase() || '?';
  const version = Constants.expoConfig?.version;

  const doLogout = () => {
    setConfirmLogout(false);
    void marketplaceReturn
      .clear()
      .catch(() => undefined)
      .then(() => auth.logout())
      .catch(() => setLogoutError(true));
  };

  const card = (extra?: StyleProp<ViewStyle>) => [styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, extra];

  return (
    <Screen>
      <SafeAreaView style={[styles.screenContent, { flex: 1, alignSelf: 'center', backgroundColor: theme.background }]}>
        <MarketplaceHeader title="โปรไฟล์" />

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
            <RefreshControl refreshing={isManualRefresh} colors={['#059669']} tintColor="#059669" onRefresh={handleManualRefresh} />
          }>
          {Platform.OS === 'web' && isManualRefresh ? (
            <View style={{ paddingVertical: 8, alignItems: 'center' }}>
              <Loading label="กำลังอัปเดตบัญชี..." />
            </View>
          ) : null}
          {auth.initializing ? (
            <Loading label="กำลังตรวจสอบบัญชี" />
          ) : !auth.session ? (
            /* Guest: การ์ดเข้าสู่ระบบแบบ design */
            <View style={card(styles.guestCard)}>
              <View style={[styles.guestAvatar, { backgroundColor: theme.backgroundElement }]}>
                <PersonIcon color={muted} size={36} />
              </View>
              <ThemedText style={[styles.guestTitle, { color: theme.text }]}>เข้าสู่ระบบเพื่อใช้งานบัญชีของคุณ</ThemedText>
              <View style={{ gap: 4 }}>
                {['สั่งซื้อสินค้าและชำระเงิน', 'ติดตามสถานะคำสั่งซื้อ', 'เปิดร้านขายของมือสองของคุณ'].map(text => (
                  <ThemedText key={text} style={[styles.guestBullet, { color: theme.textSecondary }]}>• {text}</ThemedText>
                ))}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="เข้าสู่ระบบด้วย Google"
                onPress={() => router.push('/login')}
                style={({ pressed }) => [styles.primaryBtn, { backgroundColor: pressed ? '#10b981' : '#059669', alignSelf: 'stretch' }]}>
                <ThemedText style={styles.primaryBtnText}>เข้าสู่ระบบด้วย Google</ThemedText>
              </Pressable>
            </View>
          ) : (
            <>
              {/* ตัวตนผู้ใช้: ตัวอักษรแรกของชื่อแทน mascot/รูป (ไม่มีอัปโหลดรูปใน release นี้) */}
              <View style={card()}>
                <View style={styles.identityRow}>
                  <View style={styles.avatar}>
                    <ThemedText style={styles.avatarText}>{initial}</ThemedText>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <ThemedText style={[styles.nameText, { color: theme.text }]} numberOfLines={1}>{displayName}</ThemedText>
                    {email ? <ThemedText style={[styles.emailText, { color: muted }]} numberOfLines={1}>{email}</ThemedText> : null}
                    <View style={styles.pillRow}>
                      <View style={styles.rolePill}><ThemedText style={styles.rolePillText}>{roleText}</ThemedText></View>
                      {profileModel.profile?.status ? <ThemedText style={[styles.statusText, { color: muted }]}>{profileModel.profile.status}</ThemedText> : null}
                    </View>
                  </View>
                </View>

                {!account && auth.accountChecking && <Loading label="กำลังอัปเดตบัญชี" />}
                {auth.accountError && (
                  <View style={{ gap: 8 }}>
                    <ThemedText accessibilityRole="alert" style={{ color: theme.danger, fontSize: 12 }}>ตรวจสอบบัญชีไม่สำเร็จ กรุณาลองใหม่</ThemedText>
                    <Button label="ตรวจสอบบัญชีอีกครั้ง" onPress={() => { void auth.retryAccount(); }} />
                  </View>
                )}
                {account && !account.role && (
                  <View style={{ gap: 8 }}>
                    <ThemedText style={{ fontSize: 12, color: theme.textSecondary }}>บัญชียังไม่พร้อมใช้งาน กรุณาอัปเดตข้อมูลจากระบบ</ThemedText>
                    <Button label="อัปเดตบัญชี" onPress={() => { void auth.retryAccount(); }} />
                  </View>
                )}
              </View>

              {/* เปิดร้าน: สถานะจริงจากคำขอยืนยันตัวตน */}
              {customer && !verificationReady && <View style={card()}>
                <ThemedText style={{ fontSize: 12, color: theme.textSecondary }}>{state.loadError ? 'โหลดสถานะคำขอผู้ขายไม่สำเร็จ' : 'กำลังตรวจสอบสถานะคำขอผู้ขาย'}</ThemedText>
                <Button label="โหลดสถานะผู้ขายอีกครั้ง" onPress={() => void store.refresh()} />
              </View>}
              {customer && verificationReady && !approved && (
                <View style={card()}>
                  {record?.status === 'PENDING' ? (
                    <SellerCta icon={<ClockIcon color="#f59e0b" />} tint="rgba(245, 158, 11, 0.15)" title="กำลังตรวจสอบคำขอเปิดร้าน"
                      detail="รอผู้ดูแลตรวจสอบเอกสาร เราจะแสดงผลที่นี่เมื่อพิจารณาแล้ว"
                      action={{ label: 'ดูสถานะคำขอ', accessibilityLabel: openShopBtnLabel, primary: false, onPress: () => router.push('/seller-verification') }} />
                  ) : record?.status === 'REJECTED' ? (
                    <>
                      <SellerCta icon={<AlertIcon color="#f43f5e" />} tint="rgba(244, 63, 94, 0.12)" title="คำขอเปิดร้านถูกปฏิเสธ" titleColor="#f43f5e"
                        detail="ดูเหตุผลแล้วแก้ไขส่งใหม่ได้" />
                      {!!record?.rejectReason && (
                        <View style={styles.rejectBox}>
                          <ThemedText style={styles.rejectText}>{record.rejectReason}</ThemedText>
                        </View>
                      )}
                      <ActionButton label="แก้ไขและส่งใหม่" accessibilityLabel={openShopBtnLabel} primary onPress={() => router.push('/seller-verification')} />
                    </>
                  ) : waitingSellerAccess ? (
                    <SellerCta icon={<StoreIcon color="#10b981" />} tint="rgba(16, 185, 129, 0.15)" title="คำขอร้านได้รับอนุมัติแล้ว"
                      detail="บัญชียังรอเปิดสิทธิ์ผู้ขาย กรุณาตรวจสอบสิทธิ์อีกครั้งหรือติดต่อผู้ดูแล"
                      action={{ label: openShopBtnLabel, accessibilityLabel: openShopBtnLabel, primary: false, onPress: () => { void auth.retryAccount(); } }} />
                  ) : (
                    <SellerCta icon={<StoreIcon color="#10b981" />} tint="rgba(16, 185, 129, 0.15)" title="เปิดร้าน ขายของได้ใน 3 ขั้น"
                      detail="ส่งเอกสารยืนยันตัวตนและบัญชีธนาคาร แล้วรอผู้ดูแลอนุมัติก่อนลงขาย"
                      action={{ label: openShopBtnLabel === 'ขอเปิดร้านค้า' ? 'เริ่มยืนยันตัวตน' : openShopBtnLabel, accessibilityLabel: openShopBtnLabel, primary: true, onPress: () => router.push('/seller-verification') }} />
                  )}
                </View>
              )}

              {approved && (
                <View style={card()}>
                  <SellerCta icon={<StoreIcon color="#10b981" />} tint="rgba(16, 185, 129, 0.15)"
                    title={record?.shopName ?? 'ร้านค้าที่ได้รับอนุมัติ'} detail="อนุมัติผู้ขายแล้ว · ลงขายสินค้าและจัดการคำสั่งขายได้ทันที" />
                  <Button label="ลงขายสินค้า" variant="primary" onPress={() => router.push('/product/new')} />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1 }}><Button label="สินค้าของฉัน" onPress={() => router.push('/product/mine')} /></View>
                    <View style={{ flex: 1 }}><Button label="คำสั่งขาย" onPress={() => router.push({ pathname: '/orders', params: { view: 'seller' } })} /></View>
                  </View>
                </View>
              )}

              {/* บัญชี */}
              <ProfileDetails key={owner} model={profileModel} />

              {(customer || account?.role === 'ADMIN' || account?.role === 'COURIER' || account?.role === 'INSPECTOR') ? (
                <MenuGroup title={account?.role === 'ADMIN' ? 'ผู้ดูแลระบบ' : account?.role === 'INSPECTOR' ? 'เจ้าหน้าที่ตรวจสอบ' : account?.role === 'COURIER' ? 'ผู้ขนส่ง' : 'บัญชี'}>
                  {customer ? <MenuRow label="คำสั่งซื้อของฉัน" icon={<ReceiptIcon color={theme.textSecondary} />}
                    onPress={() => router.push({ pathname: '/orders', params: { view: 'buyer' } })} /> : null}
                  {account?.role === 'ADMIN' ? staffWorkspaceFor('ADMIN').map(item => (
                    <MenuRow key={item.label} label={item.label} disabled={auth.accountChecking} onPress={() => router.push(item.href)} />
                  )) : null}
                  {account?.role === 'INSPECTOR' ? staffWorkspaceFor('INSPECTOR').map(item => (
                    <MenuRow key={item.label} label={item.label} onPress={() => router.push(item.href)} />
                  )) : null}
                  {account?.role === 'COURIER' ? <MenuRow label="งานส่งเข้าศูนย์" onPress={() => router.push('/courier')} /> : null}
                </MenuGroup>
              ) : null}
            </>
          )}

          {/* ตั้งค่า: ธีม (ทุกคนรวม guest) */}
          {!auth.initializing ? (
            <MenuGroup title="ตั้งค่า">
              <View style={styles.themeBlock}>
                <View style={styles.themeHeaderRow}>
                  <ThemeIcon color={theme.text} />
                  <ThemedText style={[styles.menuLabel, { color: theme.text }]}>ธีม</ThemedText>
                </View>
                <View style={[styles.segment, { backgroundColor: theme.backgroundElement }]}>
                  {([
                    { key: 'light', label: 'สว่าง' },
                    { key: 'dark', label: 'มืด' },
                    { key: 'system', label: 'ตามระบบ' },
                  ] as const).map(item => {
                    const active = preference === item.key;
                    return (
                      <Pressable
                        key={item.key}
                        accessibilityRole="button"
                        accessibilityLabel={`ธีม${item.label}`}
                        accessibilityState={{ selected: active }}
                        onPress={() => setPreference(item.key)}
                        style={[styles.segmentItem, active && styles.segmentItemActive]}>
                        <ThemedText style={[styles.segmentText, { color: active ? '#ffffff' : theme.textSecondary, fontWeight: active ? '700' : '500' }]}>
                          {item.label}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </MenuGroup>
          ) : null}

          {auth.session ? (
            <Pressable accessibilityRole="button" accessibilityLabel="ออกจากระบบ" onPress={() => setConfirmLogout(true)} style={styles.logoutLink}>
              <ThemedText style={styles.logoutText}>ออกจากระบบ</ThemedText>
            </Pressable>
          ) : null}
          {logoutError && (
            <ThemedText accessibilityRole="alert" style={{ color: theme.danger, textAlign: 'center', fontSize: 12 }}>
              ออกจากระบบไม่สำเร็จ กรุณาลองใหม่
            </ThemedText>
          )}
          {version ? <ThemedText style={[styles.versionText, { color: muted }]}>2NDHAND · เวอร์ชัน {version}</ThemedText> : null}
        </ScrollView>

        <MarketplaceNav selected="profile" />

        <Modal visible={confirmLogout} transparent animationType="fade" onRequestClose={() => setConfirmLogout(false)}>
          <View style={styles.sheetBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="ปิด" onPress={() => setConfirmLogout(false)} />
            <View style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.sheetHandle} />
              <ThemedText style={[styles.sheetTitle, { color: theme.text }]}>ออกจากระบบ?</ThemedText>
              <ThemedText style={[styles.sheetText, { color: theme.textSecondary }]}>คุณสามารถเข้าสู่ระบบด้วย Google ได้อีกครั้งทุกเมื่อ</ThemedText>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <View style={{ flex: 1 }}><Button label="ยกเลิก" onPress={() => setConfirmLogout(false)} /></View>
                <View style={{ flex: 1 }}><Button label="ยืนยันออกจากระบบ" variant="danger" onPress={doLogout} /></View>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </Screen>
  );
}

function SellerCta({ icon, tint, title, titleColor, detail, action }: {
  icon: React.ReactNode; tint: string; title: string; titleColor?: string; detail: string;
  action?: { label: string; accessibilityLabel: string; primary: boolean; onPress(): void };
}) {
  const theme = useTheme();
  return <View style={{ gap: 12 }}>
    <View style={styles.ctaRow}>
      <View style={[styles.ctaIcon, { backgroundColor: tint }]}>{icon}</View>
      <View style={{ flex: 1 }}>
        <ThemedText style={[styles.ctaTitle, { color: titleColor ?? theme.text }]}>{title}</ThemedText>
        <ThemedText style={[styles.ctaDetail, { color: theme.textSecondary }]}>{detail}</ThemedText>
      </View>
    </View>
    {action ? <ActionButton {...action} /> : null}
  </View>;
}

function ActionButton({ label, accessibilityLabel, primary, onPress }: { label: string; accessibilityLabel: string; primary: boolean; onPress(): void }) {
  const theme = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress}
    style={({ pressed }) => [styles.primaryBtn, primary
      ? { backgroundColor: pressed ? '#10b981' : '#059669' }
      : { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.85 : 1 }]}>
    <ThemedText style={[styles.primaryBtnText, !primary && { color: theme.text }]}>{label}</ThemedText>
  </Pressable>;
}

function MenuGroup({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return <View style={{ gap: 8 }}>
    <ThemedText style={[styles.groupTitle, { color: theme.background === '#0c0e14' ? '#64748b' : '#94a3b8' }]}>{title}</ThemedText>
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, padding: 0, gap: 0 }]}>{children}</View>
  </View>;
}

function MenuRow({ label, icon, onPress, disabled }: { label: string; icon?: React.ReactNode; onPress(): void; disabled?: boolean }) {
  const theme = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.menuRow, { opacity: disabled ? 0.5 : pressed ? 0.7 : 1 }]}>
    {icon ?? <DotIcon color={theme.textSecondary} />}
    <ThemedText style={[styles.menuLabel, { color: theme.text, flex: 1 }]}>{label}</ThemedText>
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none"><Path d="M9 5l7 7-7 7" stroke={theme.textSecondary} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
  </Pressable>;
}

function PersonIcon({ color, size = 20 }: { color: string; size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Circle cx={12} cy={8} r={4} stroke={color} strokeWidth={2} /><Path d="M4 21a8 8 0 0 1 16 0" stroke={color} strokeWidth={2} strokeLinecap="round" /></Svg>;
}
function StoreIcon({ color }: { color: string }) {
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none"><Path d="M4 9.5 5.5 4h13L20 9.5M4 9.5V20h16V9.5M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0M10 20v-5h4v5" stroke={color} strokeWidth={2} strokeLinejoin="round" /></Svg>;
}
function ClockIcon({ color }: { color: string }) {
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none"><Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} /><Path d="M12 7v5l3 2" stroke={color} strokeWidth={2} strokeLinecap="round" /></Svg>;
}
function AlertIcon({ color }: { color: string }) {
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none"><Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} /><Path d="M12 8v4M12 16h.01" stroke={color} strokeWidth={2} strokeLinecap="round" /></Svg>;
}
function ReceiptIcon({ color }: { color: string }) {
  return <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"><Path d="M7 3h10a1 1 0 0 1 1 1v17l-3-2-3 2-3-2-3 2V4a1 1 0 0 1 1-1zM9 8h6M9 12h6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}
function ThemeIcon({ color }: { color: string }) {
  return <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"><Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} /><Path d="M12 3a9 9 0 0 0 0 18z" fill={color} /></Svg>;
}
function DotIcon({ color }: { color: string }) {
  return <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"><Rect x={4} y={4} width={16} height={16} rx={4} stroke={color} strokeWidth={2} /></Svg>;
}

const styles = StyleSheet.create({
  screenContent: { width: '100%', maxWidth: 800, gap: 0 },
  scrollContent: { padding: 16, gap: 14, paddingBottom: 24 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(16, 185, 129, 0.15)', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 22, lineHeight: 28, fontWeight: '800', color: '#10b981' },
  nameText: { fontSize: 16, lineHeight: 23, fontWeight: '700' },
  emailText: { fontSize: 12, lineHeight: 17 },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  rolePill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: 'rgba(16, 185, 129, 0.15)' },
  rolePillText: { fontSize: 10, lineHeight: 15, fontWeight: '700', color: '#10b981' },
  statusText: { fontSize: 10, lineHeight: 15 },
  guestCard: { alignItems: 'center', paddingVertical: 24, gap: 12 },
  guestAvatar: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  guestTitle: { fontSize: 15, lineHeight: 22, fontWeight: '700', textAlign: 'center' },
  guestBullet: { fontSize: 12, lineHeight: 19 },
  primaryBtn: { minHeight: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryBtnText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  ctaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  ctaIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  ctaTitle: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  ctaDetail: { fontSize: 11, lineHeight: 17, marginTop: 2 },
  rejectBox: { padding: 10, borderRadius: 12, backgroundColor: 'rgba(244, 63, 94, 0.1)' },
  rejectText: { color: '#f43f5e', fontSize: 12, lineHeight: 17 },
  groupTitle: { fontSize: 11, lineHeight: 16, fontWeight: '600', paddingHorizontal: 4 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 50 },
  menuLabel: { fontSize: 13, lineHeight: 19, fontWeight: '600' },
  themeBlock: { padding: 16, gap: 12 },
  themeHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  segment: { flexDirection: 'row', borderRadius: 12, padding: 4 },
  segmentItem: { flex: 1, borderRadius: 10, paddingVertical: 8, alignItems: 'center' },
  segmentItemActive: { backgroundColor: '#059669' },
  segmentText: { fontSize: 12, lineHeight: 17 },
  logoutLink: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 16, marginTop: 4 },
  logoutText: { fontSize: 14, fontWeight: '700', color: '#f43f5e' },
  versionText: { fontSize: 11, lineHeight: 16, textAlign: 'center' },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 20, paddingBottom: 24, alignItems: 'stretch' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(100, 116, 139, 0.4)', alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 16, lineHeight: 24, fontWeight: '700', textAlign: 'center' },
  sheetText: { fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 4 },
});
