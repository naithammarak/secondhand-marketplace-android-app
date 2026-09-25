import { marketplaceReturn } from '@/auth/marketplace-return-instance';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createLoginController, type LoginAdapter, type LoginState } from '@/auth/login-controller';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, MaxContentWidth, Spacing, type MarketplaceTheme } from '@/constants/theme';
import { useAuth } from '@/auth/auth-provider';
import { router } from 'expo-router';
import type { VerificationStatus } from '@/services/verification-service';
import { useVerification } from '@/verification/verification-provider';
import type { MeErrorKind, SelectableRole } from '@/services/me-service';
import { useTheme } from '@/hooks/use-theme';
import { MarketplaceIcon } from './marketplace-icon';
import { MarketplaceNav } from './marketplace-nav';
import { Button } from './order-ui';

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

const verificationEntryLabels: Record<VerificationStatus, string> = {
  NOT_SUBMITTED: 'ยังไม่ส่งคำขอ',
  PENDING: 'รอตรวจสอบ',
  APPROVED: 'อนุมัติแล้ว',
  REJECTED: 'ถูกปฏิเสธ',
};

const roleErrorMessages: Partial<Record<MeErrorKind, string>> = {
  unauthorized: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่',
  forbidden: 'บัญชีนี้ไม่มีสิทธิ์เลือกบทบาท',
  'validation-error': 'บทบาทที่เลือกไม่ถูกต้อง กรุณาเลือกใหม่',
  'not-configured': 'ยังไม่ได้เชื่อมต่อ Backend จึงยังบันทึกบทบาทไม่ได้',
  'network-error': 'เชื่อมต่อเพื่อบันทึกบทบาทไม่ได้ กรุณาลองใหม่',
  'server-error': 'บันทึกบทบาทไม่สำเร็จ กรุณาลองใหม่ภายหลัง',
};

export function RoleSelection({ selectedRole, saving, error, backendReady = true, onSelect, onConfirm }: {
  selectedRole: SelectableRole | null;
  saving: boolean;
  error: MeErrorKind | null;
  backendReady?: boolean;
  onSelect(role: SelectableRole): void;
  onConfirm(): void;
}) {
  const styles = makeStyles(useTheme());
  const disabled = saving || !backendReady;
  return (
    <View style={styles.roleSection}>
      <ThemedText type="subtitle" style={styles.statusTitle}>เลือกบทบาทของคุณ</ThemedText>
      <ThemedText style={styles.roleWarning}>เมื่อยืนยันแล้ว คุณจะไม่สามารถเปลี่ยนบทบาทเองได้</ThemedText>
      <View style={styles.roleOptions}>
        {([['BUYER', 'ผู้ซื้อ'], ['SELLER', 'ผู้ขาย']] as const).map(([role, label]) => (
          <TouchableOpacity
            key={role}
            style={[styles.roleOption, selectedRole === role && styles.roleOptionSelected]}
            accessibilityRole="radio"
            accessibilityState={{ selected: selectedRole === role, disabled }}
            disabled={disabled}
            onPress={() => onSelect(role)}
          >
            <Text style={styles.roleOptionText}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {saving && <ActivityIndicator accessibilityLabel="กำลังบันทึกบทบาท" />}
      {error && <ThemedText accessibilityLiveRegion="polite">
        {roleErrorMessages[error] ?? 'บันทึกบทบาทไม่สำเร็จ กรุณาลองใหม่'}
      </ThemedText>}
      <TouchableOpacity
        style={[styles.button, (!selectedRole || disabled) && styles.buttonDisabled]}
        accessibilityRole="button"
        disabled={!selectedRole || disabled}
        onPress={onConfirm}
      >
        <Text style={styles.buttonText}>{error ? 'ลองบันทึกอีกครั้ง' : 'ยืนยันบทบาท'}</Text>
      </TouchableOpacity>
    </View>
  );
}

/** ทางเข้าหน้าตรวจคำขอของผู้ดูแล แสดงเฉพาะบัญชีที่ backend บอกว่าเป็น ADMIN */
function AdminReviewEntry() {
  const styles = makeStyles(useTheme());
  return (
    <TouchableOpacity
      style={styles.button}
      accessibilityRole="button"
      accessibilityLabel="ไปหน้าตรวจคำขอยืนยันตัวตน"
      onPress={() => router.push('/admin-verifications')}
    >
      <Text style={styles.buttonText}>ตรวจคำขอยืนยันตัวตน</Text>
    </TouchableOpacity>
  );
}

/** ทางเข้าหน้ายืนยันตัวตนผู้ขาย พร้อมสถานะล่าสุดจาก backend */
function SellerVerificationEntry() {
  const styles = makeStyles(useTheme());
  const { state } = useVerification();
  const status = state.record?.status;
  return (
    <>
      <TouchableOpacity
        style={styles.button}
        accessibilityRole="button"
        accessibilityLabel="ไปหน้ายืนยันตัวตนผู้ขาย"
        onPress={() => router.push('/seller-verification')}
      >
        <Text style={styles.buttonText}>
          ยืนยันตัวตนผู้ขาย{status ? ` (${verificationEntryLabels[status]})` : ''}
        </Text>
      </TouchableOpacity>
      {status === 'APPROVED' && (
        <>
          <TouchableOpacity
            style={styles.button}
            accessibilityRole="button"
            accessibilityLabel="ไปหน้าลงขายสินค้า"
            onPress={() => router.push('/product/new')}
          >
            <Text style={styles.buttonText}>ลงขายสินค้า</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.button}
            accessibilityRole="button"
            accessibilityLabel="สินค้าของฉัน"
            onPress={() => router.push('/product/mine')}
          >
            <Text style={styles.buttonText}>สินค้าของฉัน</Text>
          </TouchableOpacity>
        </>
      )}
    </>
  );
}

/**
 * TEMPORARY PRODUCT-07 entry point — navigation เข้าหน้าค้นหา/รายการสินค้าเท่านั้น
 * ลบ block นี้ได้ทันทีเมื่อมี navigation ถาวร (เช่น tab bar) มาแทนที่
 * หมายเหตุ: /products และ /products/[id] เป็น public ตาม contract (ไม่ต้อง login)
 */
function ProductCatalogEntry() {
  const styles = makeStyles(useTheme());
  return (
    <TouchableOpacity
      style={styles.button}
      accessibilityRole="button"
      accessibilityLabel="ไปหน้าค้นหาสินค้า"
      onPress={() => router.push('/products')}
    >
      <Text style={styles.buttonText}>ค้นหาสินค้า</Text>
    </TouchableOpacity>
  );
}

/** ทางเข้างานสั่งซื้อ: ผู้ซื้อเห็นคำสั่งซื้อและทางเข้าซื้อชั่วคราว ผู้ขายเห็นคำสั่งซื้อสินค้าของตน */
function OrderEntries({ role }: { role: 'BUYER' | 'SELLER' }) {
  const styles = makeStyles(useTheme());
  return (
    <>
      <TouchableOpacity
        style={styles.button}
        accessibilityRole="button"
        accessibilityLabel="ไปหน้าคำสั่งซื้อ"
        onPress={() => router.push('/orders')}
      >
        <Text style={styles.buttonText}>{role === 'BUYER' ? 'คำสั่งซื้อของฉัน' : 'คำสั่งซื้อสินค้าของฉัน'}</Text>
      </TouchableOpacity>

    </>
  );
}

function roleMessage(role: string | null | undefined) {
  if (role === 'BUYER') return 'บทบาทผู้ซื้อ';
  if (role === 'SELLER') return 'บทบาทผู้ขาย';
  if (role === 'ADMIN') return 'บทบาทผู้ดูแลระบบ';
  if (role) return 'บทบาทได้รับการจัดการโดยระบบ';
  return 'ยังไม่ได้เลือกบทบาทผู้ซื้อหรือผู้ขาย';
}

export function LoginScreen({ adapter: adapterOverride }: { adapter?: LoginAdapter }) {
  const styles = makeStyles(useTheme());
  const auth = useAuth();
  const adapter = adapterOverride ?? auth.loginAdapter;
  const [controller] = useState(() => createLoginController(adapter));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [roleChoice, setRoleChoice] = useState<{ userId: string; role: SelectableRole } | null>(null);
  const hadSession = useRef(false);
  const redirected = useRef(false);
  const [actionError, setActionError] = useState(false);
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
  const selectedRole = auth.account?.role === null && roleChoice && roleChoice.userId === auth.session?.user.id
    ? roleChoice.role
    : null;
  const busy = state === 'waiting' || state === 'processing';

  if (auth.initializing) return (
    <ThemedView style={styles.container}><ActivityIndicator accessibilityLabel="กำลังกู้คืนเซสชัน" /></ThemedView>
  );

  if (auth.session) return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.content}>
        <ScrollView contentContainerStyle={{ gap: 16, padding: 20 }}>
        <ThemedText type="subtitle" style={styles.statusTitle}>
          {auth.account?.role
            ? (auth.account.fullName ? `ยินดีต้อนรับ ${auth.account.fullName}` : 'ยินดีต้อนรับ')
            : 'กำลังตรวจสอบบัญชี'}
        </ThemedText>
        {actionError && <ThemedText accessibilityLiveRegion="polite">ดำเนินการไม่สำเร็จ กรุณาลองใหม่</ThemedText>}
        {auth.accountChecking && <ActivityIndicator accessibilityLabel="กำลังตรวจสอบบัญชี" />}
        {auth.account && <ThemedText>{roleMessage(auth.account.role)}</ThemedText>}
        {auth.accountError && <ThemedText accessibilityLiveRegion="polite">
          {messages[auth.accountError]}
        </ThemedText>}
        {auth.account?.source === 'mock' && (
          <ThemedText type="small">บริการบัญชียังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง</ThemedText>
        )}

        {auth.account && auth.account.role === null && !auth.accountChecking && !auth.accountError && (
          <RoleSelection
            selectedRole={selectedRole}
            saving={auth.roleSaving}
            error={auth.roleError}
            backendReady={auth.account.source === 'backend'}
            onSelect={role => {
              if (auth.session) setRoleChoice({ userId: auth.session.user.id, role });
            }}
            onConfirm={() => { if (selectedRole) void auth.selectRole(selectedRole); }}
          />
        )}

        {auth.account?.role === 'SELLER' && <SellerVerificationEntry />}
        {auth.account?.role === 'ADMIN' && <AdminReviewEntry />}
        {(auth.account?.role === 'BUYER' || auth.account?.role === 'SELLER') && (
          <OrderEntries role={auth.account.role} />
        )}
        {(auth.account?.role === 'BUYER' || auth.account?.role === 'SELLER' || auth.account?.role === 'ADMIN') && (
          <ProductCatalogEntry />
        )}

        {auth.accountError && (
          <TouchableOpacity
            style={styles.button}
            disabled={auth.accountChecking}
            onPress={() => { void auth.retryAccount(); }}
          >
            <Text style={styles.buttonText}>ลองตรวจบัญชีอีกครั้ง</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.button}
          onPress={() => { void marketplaceReturn.clear().catch(() => undefined).then(() => auth.logout()).catch(() => setActionError(true)); }}
        >
          <Text style={styles.buttonText}>ออกจากระบบ</Text>
        </TouchableOpacity>
        </ScrollView>
        <MarketplaceNav selected="profile" />
      </SafeAreaView>
    </ThemedView>
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.content}>
        <ScrollView contentContainerStyle={styles.loginContent}>
          <View style={styles.card}>
            <View style={styles.brandmark}><MarketplaceIcon name="orders" size={32} color="#ffffff" /></View>
            <ThemedText type="title" style={styles.title}>ซื้อขายสินค้ามือสอง</ThemedText>
            <ThemedText accessibilityLiveRegion="polite" style={styles.message}>{messages[state]}</ThemedText>
            {busy && <ActivityIndicator accessibilityLabel="กำลังเข้าสู่ระบบ" />}
            {state !== 'success' && <View style={{ width: '100%', gap: 12, marginTop: 24 }}>
              <Button label="เข้าสู่ระบบด้วย Google" variant="primary" busy={busy} onPress={() => { void controller.start(); }} />
              <Button label="ดูสินค้าก่อน" onPress={() => { controller.cancel(); void marketplaceReturn.clear().catch(() => undefined).then(() => router.replace('/')); }} />
            </View>}
            <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
              ผู้ขายต้องยืนยันตัวตนด้วยบัตรประชาชนและบัญชีธนาคารก่อนลงขาย
            </ThemedText>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}
const makeStyles = (theme: MarketplaceTheme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background, alignItems: 'center' },
  content: { flex: 1, width: '100%', maxWidth: MaxContentWidth, backgroundColor: theme.surface },
  loginContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 380, alignItems: 'center', paddingVertical: 32 },
  brandmark: { width: 72, height: 72, borderRadius: 20, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  title: { textAlign: 'center' },
  message: { textAlign: 'center', color: theme.textSecondary, marginTop: 10 },
  hint: { textAlign: 'center', marginTop: 32, maxWidth: 300 },
  button: { flexDirection: 'row', minHeight: 48, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.backgroundElement, borderRadius: 10, justifyContent: 'center', alignItems: 'center', padding: 12 },
  buttonText: { color: theme.primary, fontSize: 14, fontFamily: Fonts.display, textAlign: 'center' },
  buttonDisabled: { opacity: 0.5 },
  statusTitle: { alignSelf: 'stretch', textAlign: 'center' },
  roleSection: { width: '100%', gap: Spacing.three },
  roleWarning: { textAlign: 'center' },
  roleOptions: { flexDirection: 'row', gap: Spacing.two },
  roleOption: { flex: 1, padding: 16, borderWidth: 1, borderColor: theme.border, borderRadius: 10, alignItems: 'center', backgroundColor: theme.surface },
  roleOptionSelected: { borderColor: theme.primary, backgroundColor: theme.backgroundSelected },
  roleOptionText: { color: theme.text, fontSize: 15, fontFamily: Fonts.display },
});
