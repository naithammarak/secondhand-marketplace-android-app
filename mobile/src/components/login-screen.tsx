import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, Image ,ImageBackground} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createLoginController, type LoginAdapter, type LoginState } from '@/auth/login-controller';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/auth/auth-provider';
import { router } from 'expo-router';
import type { VerificationStatus } from '@/services/verification-service';
import { useVerification } from '@/verification/verification-provider';
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
  );
}

/** ทางเข้างานสั่งซื้อ: ผู้ซื้อเห็นคำสั่งซื้อและทางเข้าซื้อชั่วคราว ผู้ขายเห็นคำสั่งซื้อสินค้าของตน */
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
      {role === 'BUYER' && (
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
  const busy = state === 'waiting' || state === 'processing';

  if (auth.initializing) return (
    <ThemedView style={styles.container}><ActivityIndicator accessibilityLabel="กำลังกู้คืนเซสชัน" /></ThemedView>
  );

  if (auth.session && (auth.account || auth.accountChecking || auth.accountError)) return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.content}>
        <ThemedText type="subtitle" style={styles.statusTitle}>
          {auth.account ? 'เข้าสู่ระบบแล้ว' : 'กำลังตรวจสอบบัญชี'}
        </ThemedText>
        {auth.accountChecking && <ActivityIndicator accessibilityLabel="กำลังตรวจสอบบัญชี" />}
        {auth.account && <ThemedText>{roleMessage(auth.account.role)}</ThemedText>}
        {auth.accountError && <ThemedText accessibilityLiveRegion="polite">
          {messages[auth.accountError]}
        </ThemedText>}
        {auth.account?.source === 'mock' && (
          <ThemedText type="small">กำลังใช้ผลจำลอง /me จนกว่า Backend จะพร้อม</ThemedText>
        )}

        {auth.account?.role === 'SELLER' && <SellerVerificationEntry />}
        {auth.account?.role === 'ADMIN' && <AdminReviewEntry />}
        {(auth.account?.role === 'BUYER' || auth.account?.role === 'SELLER') && (
          <OrderEntries role={auth.account.role} />
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
          <TouchableOpacity
            style={[styles.button, busy && styles.buttonDisabled]}
            disabled={busy}
            onPress={() => { void controller.start(); }}
          >
            <Image source={googleLogo} style={styles.icon} />
            <Text style={styles.buttonText}>เข้าสู่ระบบด้วย Google</Text>
          </TouchableOpacity>
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
    height: 500, 
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
  logo: { marginTop:70,width: 100, height: 100, borderRadius:20},
  circle: { width:80, height:80, borderRadius:40, backgroundColor:"#ffff"}
});
