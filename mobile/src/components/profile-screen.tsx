import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/auth/auth-provider';
import { marketplaceReturn } from '@/auth/marketplace-return-instance';
import { useVerification } from '@/verification/verification-provider';
import { useTheme } from '@/hooks/use-theme';
import { useThemePreference, type ThemePreference } from '@/theme/theme-provider';
import { MarketplaceHeader } from './marketplace-header';
import { MarketplaceNav } from './marketplace-nav';
import { Button, Card, Loading, Screen, styles } from './order-ui';
import { ThemedText } from './themed-text';
import { WondeeMascot } from './wondee/brand';

const statusLabels = { NOT_SUBMITTED: 'ขอเปิดร้านค้า', PENDING: 'คำขอเปิดร้านอยู่ระหว่างตรวจสอบ', APPROVED: 'ร้านค้าได้รับอนุมัติ', REJECTED: 'แก้ไขคำขอเปิดร้าน' };
export function ProfileScreen() {
  const auth = useAuth();
  const theme = useTheme();
  const { preference, setPreference } = useThemePreference();
  const { state, store } = useVerification();
  const [logoutError, setLogoutError] = useState(false);
  const [focused, setFocused] = useState(false);
  const owner = auth.session?.user.id;
  // Refresh me on entry; controls never promote optimistically from verification.
  useFocusEffect(useCallback(() => {
    setFocused(true);
    if (owner) void auth.retryAccount();
    if (owner && state.owner === owner && (auth.account?.role === 'BUYER' || auth.account?.role === 'SELLER')) void store.refresh();
    return () => setFocused(false);
    // retryAccount changes while checking; rerunning it would cause a refresh loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, state.owner, store, auth.account?.role]));
  const account = auth.session && !auth.accountError && auth.account?.source === 'backend' ? auth.account : null;
  const customer = account?.source === 'backend' && (account.role === 'BUYER' || account.role === 'SELLER');
  const record = customer && state.owner === owner ? state.record : null;
  const approved = account?.role === 'SELLER' && record?.status === 'APPROVED' && !state.loadError && !auth.accountChecking;
  const waitingSellerAccess = account?.role === 'BUYER' && record?.status === 'APPROVED';
  return <Screen><SafeAreaView style={[styles.content, { flex: 1, alignSelf: 'center', gap: 0 }]}>
    <MarketplaceHeader title="ฉัน" />
    <ScrollView contentContainerStyle={local.content}>
      {auth.initializing ? <Loading label="กำลังตรวจสอบบัญชี" /> : <>
        <Card><View style={local.identity}><WondeeMascot size={64} animate={focused} /><View style={{ flex: 1, gap: 4 }}>
          <ThemedText type="subtitle">{account?.fullName ?? (auth.session ? 'บัญชีของคุณ' : 'ยินดีต้อนรับสู่ Wondee')}</ThemedText>
          <ThemedText type="small" themeColor="accent">{account?.role ?? (auth.session ? 'กำลังตรวจสอบบัญชี' : 'GUEST · ผู้เยี่ยมชม')}</ThemedText>
        </View></View>
        {!auth.session && <><ThemedText themeColor="textSecondary">เข้าสู่ระบบเพื่อดูคำสั่งซื้อและยื่นขอเปิดร้าน ส่งต่อของรักให้คนที่ใช่</ThemedText>
          <Button label="เข้าสู่ระบบด้วย Google" variant="primary" onPress={() => router.push('/login')} /></>}
        {auth.accountChecking && <Loading label="กำลังอัปเดตบัญชี" />}
        {auth.accountError && <><ThemedText accessibilityRole="alert">ตรวจสอบบัญชีไม่สำเร็จ กรุณาลองใหม่</ThemedText><Button label="ตรวจสอบบัญชีอีกครั้ง" onPress={() => { void auth.retryAccount(); }} /></>}
        {auth.session && account && !account.role && <><ThemedText>บัญชียังไม่พร้อมใช้งาน กรุณาอัปเดตข้อมูลจากระบบ</ThemedText><Button label="อัปเดตบัญชี" onPress={() => { void auth.retryAccount(); }} /></>}
        </Card>
        {customer && !approved && <LinearGradient colors={[theme.upgrade, theme.surface]} style={[local.upgrade, { borderColor: theme.upgradeBorder }]}>
          <ThemedText type="smallBold" style={{ color: theme.upgradeText }}>ส่งต่อของรักกับวนดี</ThemedText>
          <ThemedText type="title" style={{ color: theme.upgradeText }}>{waitingSellerAccess ? 'คำขอร้านได้รับอนุมัติแล้ว' : 'ต้องการเปิดร้านขายสินค้า?'}</ThemedText>
          <ThemedText style={{ color: theme.upgradeText }}>{waitingSellerAccess ? 'บัญชียังรอเปิดสิทธิ์ผู้ขาย กรุณาตรวจสอบสิทธิ์อีกครั้งหรือติดต่อผู้ดูแล' : 'ยืนยันตัวตนและข้อมูลบัญชีเพื่อขอเปิดร้าน ระหว่างรอผลคุณยังเลือกซื้อสินค้าได้'}</ThemedText>
          {!!record?.rejectReason && <ThemedText style={{ color: theme.upgradeText }}>{record.rejectReason}</ThemedText>}
          <Button label={waitingSellerAccess ? 'ตรวจสอบสิทธิ์ผู้ขายอีกครั้ง' : record ? statusLabels[record.status] : 'ขอเปิดร้านค้า'} variant="primary" onPress={() => { if (waitingSellerAccess) void auth.retryAccount(); else router.push('/seller-verification'); }} />
        </LinearGradient>}
        {approved && <Card><ThemedText type="subtitle">{record?.shopName ?? 'ร้านค้าที่ได้รับอนุมัติ'}</ThemedText>
          <ThemedText type="small" themeColor="success">อนุมัติผู้ขายแล้ว</ThemedText>
          <Button label="ลงขายสินค้า" variant="primary" onPress={() => router.push('/product/new')} />
          <Button label="สินค้าของฉัน" onPress={() => router.push('/product/mine')} />
          <Button label="คำสั่งขาย" onPress={() => router.push({ pathname: '/orders', params: { view: 'seller' } })} />
        </Card>}
        {customer && <Card><ThemedText type="subtitle">การซื้อของคุณ</ThemedText><Button label="คำสั่งซื้อของฉัน" onPress={() => router.push({ pathname: '/orders', params: { view: 'buyer' } })} /></Card>}
        {account?.role === 'ADMIN' && <Card><Button label="ตรวจคำขอยืนยันตัวตน" onPress={() => router.push('/admin-verifications')} /><Button label="มอบหมายผู้ขนส่ง" onPress={() => router.push('/admin-deliveries')} /></Card>}
        {account?.role === 'COURIER' && <Card><Button label="งานส่งเข้าศูนย์" onPress={() => router.push('/courier')} /></Card>}
        {account?.role === 'INSPECTOR' && <Card><Button label="งานตรวจสินค้า" onPress={() => router.push('/inspections')} /></Card>}
      </>}
      <Card><ThemedText type="subtitle">การแสดงผล</ThemedText>
        <View style={local.themeChoices}>{([['dark', 'มืด'], ['light', 'สว่าง'], ['system', 'ตามอุปกรณ์']] as [ThemePreference, string][]).map(([value, label]) =>
          <View key={value} style={{ flexGrow: 1 }}><Button label={`${label}${preference === value ? ' · เลือกอยู่' : ''}`} variant={preference === value ? 'primary' : 'secondary'} onPress={() => setPreference(value)} /></View>)}</View>
      </Card>
      {auth.session && <Button label="ออกจากระบบ" onPress={() => { void marketplaceReturn.clear().catch(() => undefined).then(() => auth.logout()).catch(() => setLogoutError(true)); }} />}
      {logoutError && <ThemedText accessibilityRole="alert">ออกจากระบบไม่สำเร็จ กรุณาลองใหม่</ThemedText>}
    </ScrollView><MarketplaceNav selected="profile" />
  </SafeAreaView></Screen>;
}
const local = StyleSheet.create({ content: { padding: 16, gap: 16 }, identity: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  upgrade: { borderRadius: 24, borderWidth: 1, padding: 20, gap: 14 }, themeChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } });
