import { Image } from 'expo-image';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/auth-provider';
import { useTheme } from '@/hooks/use-theme';
import { useVerification } from '@/verification/verification-provider';
import { emptyVerificationForm, type VerificationFormValues } from '@/verification/verification-form';
import { pickIdCardImage } from '@/verification/pick-id-card';
import { type VerificationErrorKind } from '@/services/verification-service';
import { Button, Card, Loading, Screen, styles } from './order-ui';
import { MarketplaceHeader } from './marketplace-header';
import { ThemedText } from './themed-text';
import { TextField } from './wondee/primitives';
import { WondeeMascot } from './wondee/brand';

const errors: Record<VerificationErrorKind, string> = {
  unauthorized: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่', forbidden: 'บัญชีนี้ไม่มีสิทธิ์ส่งคำขอ',
  conflict: 'ส่งคำขอไว้แล้ว ระบบกำลังแสดงสถานะล่าสุด', 'validation-error': 'กรุณาตรวจสอบข้อมูลที่ระบุ',
  'network-error': 'เชื่อมต่อไม่ได้ กรุณาตรวจสอบสถานะคำขอก่อนส่งอีกครั้ง',
  'server-error': 'ส่งข้อมูลไม่สำเร็จ กรุณาตรวจสอบสถานะก่อนลองใหม่', unavailable: 'บริการขอเปิดร้านยังไม่พร้อมใช้งาน',
};
const labels = { NOT_SUBMITTED: 'เตรียมร้านของคุณให้พร้อม', PENDING: 'กำลังตรวจสอบคำขอ', APPROVED: 'ร้านค้าได้รับอนุมัติแล้ว', REJECTED: 'กรุณาแก้ไขข้อมูลแล้วส่งใหม่' };
export function SellerVerificationScreen() {
  const auth = useAuth();
  return <SellerVerificationContent key={auth.session?.user.id ?? 'guest'} />;
}
function SellerVerificationContent() {
  const auth = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const { state, store } = useVerification();
  const [values, setValues] = useState<VerificationFormValues>(emptyVerificationForm);
  const [pickerError, setPickerError] = useState('');
  const owner = auth.session?.user.id ?? null;
  const currentOwner = useRef(owner);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const customer = auth.account?.source === 'backend' && (auth.account.role === 'BUYER' || auth.account.role === 'SELLER') && !auth.accountError;
  const record = state.owner === owner && customer ? state.record : null;
  const busy = state.submitting;
  useFocusEffect(useCallback(() => {
    if (owner && customer && state.owner === owner) void store.load();
  }, [customer, owner, state.owner, store]));
  const refreshedApproval = useRef<number | null>(null);
  useEffect(() => { refreshedApproval.current = null; }, [owner]);
  useEffect(() => {
    if (record?.status === 'APPROVED' && refreshedApproval.current !== record.id) {
      refreshedApproval.current = record.id;
      void auth.retryAccount();
    }
  }, [auth, record]);
  if (!auth.session) return <Redirect href="/login" />;
  const update = (field: keyof VerificationFormValues, value: string) => {
    setValues(current => ({ ...current, [field]: value })); store.clearFieldError(field);
  };
  async function pick() {
    const pickedOwner = owner;
    setPickerError('');
    const result = await pickIdCardImage();
    if (!mounted.current || pickedOwner !== currentOwner.current) return;
    if (result.status === 'picked') { setValues(current => ({ ...current, idCard: result.file })); store.clearFieldError('idCard'); }
    else setPickerError(result.status === 'permission-denied' ? 'ไม่ได้รับอนุญาตให้เข้าถึงคลังรูปภาพ กรุณาอนุญาตในการตั้งค่า' : 'ยกเลิกการเลือกรูปแล้ว');
  }
  async function submit() {
    const submittedOwner = owner;
    await store.submit(values);
    if (mounted.current && submittedOwner === currentOwner.current && store.getSnapshot().record?.status === 'PENDING') setValues(emptyVerificationForm);
  }
  const status = record?.status ?? 'NOT_SUBMITTED';
  return <Screen><SafeAreaView style={[styles.content, { flex: 1, alignSelf: 'center', gap: 0 }]}>
    <MarketplaceHeader title="ยืนยันตัวตนเพื่อเปิดร้าน" back />
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}>
        {auth.accountError ? <Card><ThemedText accessibilityRole="alert">ตรวจสอบสิทธิ์บัญชีไม่สำเร็จ</ThemedText><Button label="ลองใหม่อีกครั้ง" onPress={() => { void auth.retryAccount(); }} /></Card> : !auth.account || auth.accountChecking ? <Loading label="กำลังตรวจสอบสิทธิ์บัญชี" /> : !customer ? <Card>
          <ThemedText>บัญชีนี้ยังไม่พร้อมขอเปิดร้าน</ThemedText><Button label="ลองตรวจบัญชีอีกครั้ง" onPress={() => { void auth.retryAccount(); }} />
        </Card> : <>
          {(state.loading || state.refreshing) && <Loading label="กำลังโหลดสถานะคำขอ" />}
          {state.loadError && <Card><ThemedText accessibilityRole="alert">{errors[state.loadError]}</ThemedText><Button label="ลองใหม่อีกครั้ง" onPress={() => { void store.retry(); }} /></Card>}
          {record && <Card>
            <View style={{ alignItems: 'center', gap: 12 }}><WondeeMascot size={80} variant={status === 'APPROVED' ? 'pass' : status === 'REJECTED' ? 'discrepancy' : 'neutral'} />
              <ThemedText type="title" style={{ textAlign: 'center' }}>{labels[status]}</ThemedText>
              <ThemedText themeColor="accent" accessibilityLiveRegion="polite">{status}</ThemedText></View>
            {status === 'PENDING' && <ThemedText>เราได้รับข้อมูลแล้ว ระหว่างรอตรวจสอบคุณยังซื้อสินค้าได้ ไม่ต้องส่งคำขอซ้ำ</ThemedText>}
            {record.shopName && <ThemedText type="subtitle">{record.shopName}</ThemedText>}
            {record.bankName && <ThemedText themeColor="textSecondary">{record.bankName} · {record.bankAccountName} · เลขบัญชีลงท้าย {record.bankAccountLast4}</ThemedText>}
            {record.reviewedAt && <ThemedText type="small">ตรวจสอบเมื่อ {new Date(record.reviewedAt).toLocaleString('th-TH')}</ThemedText>}
            {record.rejectReason && <View style={[styles.noticeBox, { borderColor: theme.danger, backgroundColor: theme.dangerSoft }]}><ThemedText type="smallBold">เหตุผลที่ถูกปฏิเสธ</ThemedText><ThemedText>{record.rejectReason}</ThemedText></View>}
            <Button label="รีเฟรชสถานะ" busy={state.refreshing} onPress={() => { void store.refresh(); void auth.retryAccount(); }} />
            {status === 'APPROVED' && auth.account?.role === 'SELLER' && !auth.accountChecking && <><Button label="ลงขายสินค้า" variant="primary" onPress={() => router.push('/product/new')} /><Button label="สินค้าของฉัน" onPress={() => router.push('/product/mine')} /></>}
          </Card>}
            {state.submitError && <ThemedText style={{ color: theme.danger }} accessibilityRole="alert">{errors[state.submitError]}</ThemedText>}
          {record?.canSubmit && !state.loadError && <Card>
            <ThemedText type="subtitle">{status === 'REJECTED' ? 'ส่งคำขอใหม่' : 'ข้อมูลสำหรับเปิดร้าน'}</ThemedText>
            <ThemedText themeColor="textSecondary">ชื่อร้านแสดงแก่ผู้ซื้อ ส่วนข้อมูลบัญชีและรูปบัตรใช้เพื่อให้ผู้ดูแลตรวจสอบคำขอ</ThemedText>
            {([['shopName', 'ชื่อร้านค้า', 'ชื่อร้าน 2–100 ตัวอักษร'], ['bankName', 'ชื่อธนาคาร', 'เช่น ธนาคารกรุงไทย'], ['bankAccountName', 'ชื่อบัญชี', 'ชื่อ-นามสกุลตามหน้าสมุดบัญชี'], ['bankAccountNumber', 'เลขที่บัญชี', 'ตัวเลข 10–15 หลัก']] as const).map(([field, label, placeholder]) =>
              <TextField key={field} label={label} placeholder={placeholder} value={values[field]} editable={!busy}
                keyboardType={field === 'bankAccountNumber' ? 'number-pad' : 'default'} error={state.fieldErrors[field]} onChangeText={value => update(field, value)} />)}
            <View style={[styles.noticeBox, { borderColor: theme.inputBorder, borderStyle: 'dashed', padding: 16 }]}>
              <ThemedText type="smallBold">รูปบัตรประชาชน</ThemedText><ThemedText type="small" themeColor="textSecondary">JPG, PNG หรือ WEBP ขนาดไม่เกิน 5 MB ให้เห็นชื่อและรูปถ่ายชัดเจน</ThemedText>
              <Button label={values.idCard ? 'เปลี่ยนรูปบัตรประชาชน' : 'เลือกรูปบัตรประชาชน'} accessibilityLabel="เลือกรูปบัตรประชาชน" disabled={busy} onPress={() => { void pick(); }} />
              {!!values.idCard && <Image source={{ uri: values.idCard.uri }} contentFit="contain" style={{ height: 120, width: '100%' }} accessibilityLabel="รูปบัตรที่เลือก" />}
              {!!(state.fieldErrors.idCard || pickerError) && <ThemedText style={{ color: theme.danger }} accessibilityRole="alert">{state.fieldErrors.idCard || pickerError}</ThemedText>}
            </View>

            <Button label="ส่งคำขอยืนยันตัวตน" variant="primary" busy={busy} onPress={() => { void submit(); }} />
          </Card>}
        </>}
        <Button label="กลับหน้าหลัก" onPress={() => router.canGoBack() ? router.back() : router.replace('/profile')} />
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView></Screen>;
}
