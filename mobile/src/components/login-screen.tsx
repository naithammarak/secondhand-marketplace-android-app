import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, Image, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createLoginController, type LoginAdapter, type LoginState } from '@/auth/login-controller';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/auth/auth-provider';
import { router } from 'expo-router';
import type { VerificationStatus } from '@/services/verification-service';
import { useVerification } from '@/verification/verification-provider';
import type { MeErrorKind, SelectableRole } from '@/services/me-service';
import { isDirectProductIdEntryEnabled } from '@/orders/order-runtime';
const googleLogo = require("@/assets/images/tabIcons/google-logo.jpg");

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

/** ทางเข้างานสั่งซื้อ: ผู้ซื้อเห็นคำสั่งซื้อ (ทางเข้าด้วยรหัสสินค้าโผล่เฉพาะ build ทดสอบ) */
function OrderEntries({ role }: { role: 'BUYER' | 'SELLER' }) {
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
      {role === 'BUYER' && isDirectProductIdEntryEnabled() && (
        <TouchableOpacity
          style={styles.button}
          accessibilityRole="button"
          accessibilityLabel="ซื้อสินค้าด้วยรหัสสินค้า"
          onPress={() => router.push('/buy-by-product-id')}
        >
          <Text style={styles.buttonText}>ซื้อด้วยรหัสสินค้า (ทดสอบ)</Text>
        </TouchableOpacity>
      )}
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
  const auth = useAuth();
  const adapter = adapterOverride ?? auth.loginAdapter;
  const [controller] = useState(() => createLoginController(adapter));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [roleChoice, setRoleChoice] = useState<{ userId: string; role: SelectableRole } | null>(null);
  const hadSession = useRef(false);
  useEffect(() => () => controller.cancel(), [controller]);
  useEffect(() => {
    if (auth.session) {
      hadSession.current = true;
    } else if (hadSession.current) {
      // ออกจากระบบแล้วรีเซ็ตสถานะ เพื่อให้ปุ่ม Google กลับมาและล็อกอินซ้ำได้
      hadSession.current = false;
      controller.reset();
    }
  }, [auth.session, controller]);
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
        <ThemedText type="subtitle" style={styles.statusTitle}>
          {auth.account?.role
            ? (auth.account.fullName ? `ยินดีต้อนรับ ${auth.account.fullName}` : 'ยินดีต้อนรับ')
            : 'กำลังตรวจสอบบัญชี'}
        </ThemedText>
        {auth.accountChecking && <ActivityIndicator accessibilityLabel="กำลังตรวจสอบบัญชี" />}
        {auth.account && <ThemedText>{roleMessage(auth.account.role)}</ThemedText>}
        {auth.accountError && <ThemedText accessibilityLiveRegion="polite">
          {messages[auth.accountError]}
        </ThemedText>}
        {auth.account?.source === 'mock' && (
          <ThemedText type="small">กำลังใช้ผลจำลอง /me จนกว่า Backend จะพร้อม</ThemedText>
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
          onPress={() => { void auth.logout(); }}
        >
          <Text style={styles.buttonText}>ออกจากระบบ</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </ThemedView>
  );

   return (
    <SafeAreaView style={styles.container}>
      <ThemedView style={styles.card}>
        <Image source={require("@/assets/images/tabIcons/google-logo.jpg")} style={styles.logo} />
        <ThemedText type="subtitle" style={styles.title}>เข้าสู่ระบบ</ThemedText>
        <ThemedText accessibilityLiveRegion="polite" style={styles.message}>{messages[state]}</ThemedText>

        {busy && <ActivityIndicator accessibilityLabel="กำลังเข้าสู่ระบบ" />}

        {state !== 'success' && (
          <>
            <TouchableOpacity
              style={[styles.button, busy && styles.buttonDisabled]}
              disabled={busy}
              onPress={() => { void controller.start(); }}
            >
              <Image source={googleLogo} style={styles.icon} />
              <Text style={styles.buttonText}>เข้าสู่ระบบด้วย Google</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, { marginTop: 12 }]}
              accessibilityRole="button"
              accessibilityLabel="ไปหน้าค้นหาสินค้าโดยไม่ต้องเข้าสู่ระบบ"
              onPress={() => router.push('/products')}
            >
              <Text style={styles.buttonText}>ค้นหาสินค้า</Text>
            </TouchableOpacity>
          </>
        )}
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1,
    width: "100%", 
    height: "100%",
    alignItems:"center", 
    justifyContent: 'center', 
    backgroundColor: '#96bde9' 
  },
  content: { width: '100%', maxWidth: MaxContentWidth, padding: Spacing.four },
  card: { 
    shadowColor: "#000",
    shadowOffset: { width: 15, height: 20 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
    opacity: 1,
    width: 380, 
    minHeight: 500,
    paddingBottom: 32,
    backgroundColor: "#243a73e4",
    alignItems:"center", 
    alignSelf: "center", 
    borderRadius: 90 
  },
  title: { color: "white",textAlign: "center", marginTop: 40 ,fontFamily: "Kanit-Regular"},
  message: { color: "white",textAlign: 'center', marginTop: 12, marginBottom: 50,fontFamily: "Kanit-Regular" },
  button: {
    flexDirection: "row", // ให้ icon กับข้อความอยู่ในแถวเดียวกัน
    width: 250,
    height: 50,
    backgroundColor: "#fcfcfd",
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginTop: 10,
    fontFamily: "Kanit-Regular",
  },
  buttonText: { color: "black", fontSize: 16, fontWeight: "600", marginLeft: 10 },
  buttonDisabled: { backgroundColor: "#999" },
  icon: { width: 30, height: 30, resizeMode: "contain" },
  statusTitle: { alignSelf: 'stretch', flexShrink: 1, textAlign: 'center' },
  roleSection: { width: '100%', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.four },
  roleWarning: { textAlign: 'center' },
  roleOptions: { flexDirection: 'row', gap: Spacing.two },
  roleOption: { minWidth: 110, padding: Spacing.three, borderWidth: 2, borderColor: '#778',
    borderRadius: 10, alignItems: 'center', backgroundColor: '#fff' },
  roleOptionSelected: { borderColor: '#243a73', backgroundColor: '#dce9ff' },
  roleOptionText: { color: '#111', fontSize: 16, fontWeight: '600' },
  logo: { marginTop:70,width: 100, height: 100, borderRadius:20},
  circle: { width:80, height:80, borderRadius:40, backgroundColor:"#ffff"}
});
