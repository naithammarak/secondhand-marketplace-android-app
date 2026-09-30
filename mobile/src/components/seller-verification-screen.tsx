import { Image } from 'expo-image';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/auth-provider';
import { useTheme } from '@/hooks/use-theme';
import { useVerification } from '@/verification/verification-provider';
import { emptyVerificationForm, type VerificationFormValues } from '@/verification/verification-form';
import { pickIdCardImage } from '@/verification/pick-id-card';
import { type VerificationErrorKind } from '@/services/verification-service';
import { Button, Card, Loading, Row, Screen, styles } from './order-ui';
import { MarketplaceHeader } from './marketplace-header';
import { ThemedText } from './themed-text';
import { TextField } from './wondee/primitives';
import { WondeeMascot } from './wondee/brand';

const POPULAR_BANKS = [
  'ธนาคารกสิกรไทย',
  'ธนาคารไทยพาณิชย์',
  'ธนาคารกรุงเทพ',
  'ธนาคารกรุงไทย',
  'ธนาคารกรุงศรีอยุธยา',
  'ธนาคารทหารไทยธนชาต',
  'ธนาคารออมสิน',
  'ธ.ก.ส.',
];

const errors: Record<VerificationErrorKind, string> = {
  unauthorized: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่',
  forbidden: 'บัญชีนี้ไม่มีสิทธิ์ส่งคำขอ',
  conflict: 'ส่งคำขอไว้แล้ว ระบบกำลังแสดงสถานะล่าสุด',
  'validation-error': 'กรุณาตรวจสอบข้อมูลที่ระบุ',
  'network-error': 'เชื่อมต่อไม่ได้ กรุณาตรวจสอบสถานะคำขอก่อนส่งอีกครั้ง',
  'server-error': 'ส่งข้อมูลไม่สำเร็จ กรุณาตรวจสอบสถานะก่อนลองใหม่',
  unavailable: 'บริการขอเปิดร้านยังไม่พร้อมใช้งาน',
};

const labels = {
  NOT_SUBMITTED: 'เตรียมร้านของคุณให้พร้อม',
  PENDING: 'กำลังตรวจสอบคำขอของคุณ',
  APPROVED: 'ร้านค้าได้รับอนุมัติแล้ว',
  REJECTED: 'คำขอถูกปฏิเสธ',
};

function VerificationStepper({ status }: { status: 'NOT_SUBMITTED' | 'PENDING' | 'APPROVED' | 'REJECTED' }) {
  const theme = useTheme();
  const step1Done = status === 'PENDING' || status === 'APPROVED';
  const step2Done = status === 'APPROVED';
  const step2Active = status === 'PENDING';

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 }}>
      <View style={{ alignItems: 'center', gap: 4, width: 76 }}>
        <View style={{
          width: 28, height: 28, borderRadius: 14,
          backgroundColor: theme.primary,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <ThemedText style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
            {step1Done ? '✓' : '1'}
          </ThemedText>
        </View>
        <ThemedText type="small" style={{ fontSize: 11, fontWeight: '600' }}>ส่งข้อมูล</ThemedText>
      </View>

      <View style={{ flex: 1, height: 2, backgroundColor: step1Done ? theme.primary : theme.border, marginHorizontal: 4, marginBottom: 16 }} />

      <View style={{ alignItems: 'center', gap: 4, width: 88 }}>
        <View style={{
          width: 28, height: 28, borderRadius: 14,
          backgroundColor: step2Done ? theme.primary : step2Active ? (theme.warningSoft ?? '#fef3c7') : theme.backgroundElement,
          borderWidth: step2Active ? 2 : 0,
          borderColor: theme.warning,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <ThemedText style={{ color: step2Done ? '#fff' : step2Active ? theme.warning : theme.textSecondary, fontSize: 12, fontWeight: '700' }}>
            {step2Done ? '✓' : '2'}
          </ThemedText>
        </View>
        <ThemedText type="small" style={{ fontSize: 11, color: step2Active ? theme.text : theme.textSecondary, fontWeight: step2Active ? '600' : '400' }}>
          ผู้ดูแลตรวจสอบ
        </ThemedText>
      </View>

      <View style={{ flex: 1, height: 2, backgroundColor: step2Done ? theme.primary : theme.border, marginHorizontal: 4, marginBottom: 16 }} />

      <View style={{ alignItems: 'center', gap: 4, width: 76 }}>
        <View style={{
          width: 28, height: 28, borderRadius: 14,
          backgroundColor: step2Done ? theme.primary : theme.backgroundElement,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <ThemedText style={{ color: step2Done ? '#fff' : theme.textSecondary, fontSize: 12, fontWeight: '700' }}>
            {step2Done ? '✓' : '3'}
          </ThemedText>
        </View>
        <ThemedText type="small" style={{ fontSize: 11, color: step2Done ? theme.text : theme.textSecondary, fontWeight: step2Done ? '600' : '400' }}>
          เริ่มขายได้
        </ThemedText>
      </View>
    </View>
  );
}

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

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

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
    setValues(current => ({ ...current, [field]: value }));
    store.clearFieldError(field);
  };

  async function pick() {
    const pickedOwner = owner;
    setPickerError('');
    const result = await pickIdCardImage();
    if (!mounted.current || pickedOwner !== currentOwner.current) return;
    if (result.status === 'picked') {
      setValues(current => ({ ...current, idCard: result.file }));
      store.clearFieldError('idCard');
    } else {
      setPickerError(result.status === 'permission-denied'
        ? 'ไม่ได้รับอนุญาตให้เข้าถึงคลังรูปภาพ กรุณาอนุญาตในการตั้งค่า'
        : 'ยกเลิกการเลือกรูปแล้ว');
    }
  }

  async function submit() {
    const submittedOwner = owner;
    await store.submit(values);
    if (mounted.current && submittedOwner === currentOwner.current && store.getSnapshot().record?.status === 'PENDING') {
      setValues(emptyVerificationForm);
    }
  }

  const status = record?.status ?? 'NOT_SUBMITTED';

  return (
    <Screen>
      <SafeAreaView style={[styles.content, { flex: 1, alignSelf: 'center', gap: 0 }]}>
        <MarketplaceHeader title="ยืนยันตัวตนผู้ขาย" back />
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}>
            {auth.accountError ? (
              <Card>
                <ThemedText accessibilityRole="alert">ตรวจสอบสิทธิ์บัญชีไม่สำเร็จ</ThemedText>
                <Button label="ลองใหม่อีกครั้ง" onPress={() => { void auth.retryAccount(); }} />
              </Card>
            ) : !auth.account || auth.accountChecking ? (
              <Loading label="กำลังตรวจสอบสิทธิ์บัญชี" />
            ) : !customer ? (
              <Card>
                <ThemedText>บัญชีนี้ยังไม่พร้อมขอเปิดร้าน</ThemedText>
                <Button label="ลองตรวจบัญชีอีกครั้ง" onPress={() => { void auth.retryAccount(); }} />
              </Card>
            ) : (
              <>
                <VerificationStepper status={status} />

                {(state.loading || state.refreshing) && <Loading label="กำลังโหลดสถานะคำขอ" />}
                {state.loadError && (
                  <Card>
                    <ThemedText accessibilityRole="alert">{errors[state.loadError]}</ThemedText>
                    <Button label="ลองใหม่อีกครั้ง" onPress={() => { void store.retry(); }} />
                  </Card>
                )}

                {record && (
                  <Card>
                    <View style={{ alignItems: 'center', gap: 12 }}>
                      <WondeeMascot size={80} variant={status === 'APPROVED' ? 'pass' : status === 'REJECTED' ? 'discrepancy' : 'neutral'} />
                      <ThemedText type="title" style={{ textAlign: 'center' }}>{labels[status]}</ThemedText>
                      <View style={{
                        paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12,
                        backgroundColor: status === 'APPROVED' ? (theme.successSoft ?? '#ecfdf5') : status === 'REJECTED' ? (theme.dangerSoft ?? '#fff1f2') : (theme.warningSoft ?? '#fef3c7'),
                      }}>
                        <ThemedText
                          style={{
                            fontSize: 12, fontWeight: '700',
                            color: status === 'APPROVED' ? theme.success : status === 'REJECTED' ? theme.danger : theme.warning,
                          }}
                          accessibilityLiveRegion="polite"
                        >
                          {status}
                        </ThemedText>
                      </View>
                    </View>

                    {status === 'PENDING' && (
                      <View style={[styles.noticeBox, { backgroundColor: theme.backgroundElement, borderColor: theme.border, gap: 6 }]}>
                        <ThemedText type="small">⏱ ปกติใช้เวลาตรวจสอบ 1–2 วันทำการ</ThemedText>
                        <ThemedText type="small">🛍️ ระหว่างนี้คุณยังซื้อสินค้าได้ตามปกติ</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          เราได้รับข้อมูลแล้ว ระหว่างรอตรวจสอบคุณยังซื้อสินค้าได้ ไม่ต้องส่งคำขอซ้ำ
                        </ThemedText>
                      </View>
                    )}

                    <View style={{ gap: 6, marginVertical: 4 }}>
                      {record.shopName && <Row label="ชื่อร้านค้า" value={record.shopName} />}
                      {record.bankName && <Row label="ธนาคาร" value={record.bankName} />}
                      {record.bankAccountName && <Row label="ชื่อบัญชี" value={record.bankAccountName} />}
                      {record.bankAccountLast4 && <Row label="เลขที่บัญชี" value={`เลขบัญชีลงท้าย ${record.bankAccountLast4}`} />}
                      {record.reviewedAt && (
                        <ThemedText type="small" themeColor="textSecondary">
                          ตรวจสอบเมื่อ {new Date(record.reviewedAt).toLocaleString('th-TH')}
                        </ThemedText>
                      )}
                    </View>

                    {status === 'APPROVED' && (
                      <View style={[styles.noticeBox, { backgroundColor: theme.backgroundElement, borderColor: theme.border, gap: 4 }]}>
                        <ThemedText type="smallBold">สิ่งที่ทำได้ตอนนี้</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">➕ ลงขายสินค้าจากปุ่ม "ร้านของฉัน" หรือปุ่มด้านล่าง</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">🧾 ดูคำสั่งซื้อที่ลูกค้าสั่งในแท็บ "ออเดอร์ร้าน"</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">🛒 ยังซื้อสินค้าได้เหมือนเดิม</ThemedText>
                      </View>
                    )}

                    {record.rejectReason && (
                      <View style={[styles.noticeBox, { borderColor: theme.danger, backgroundColor: theme.dangerSoft }]}>
                        <ThemedText type="smallBold">เหตุผลที่ถูกปฏิเสธ</ThemedText>
                        <ThemedText>{record.rejectReason}</ThemedText>
                      </View>
                    )}

                    <Button label="รีเฟรชสถานะ" busy={state.refreshing} onPress={() => { void store.refresh(); void auth.retryAccount(); }} />

                    {status === 'APPROVED' && auth.account?.role === 'SELLER' && !auth.accountChecking && (
                      <>
                        <Button label="ลงขายสินค้า" variant="primary" onPress={() => router.push('/product/new')} />
                        <Button label="สินค้าของฉัน" onPress={() => router.push('/product/mine')} />
                      </>
                    )}
                  </Card>
                )}

                {state.submitError && (
                  <ThemedText style={{ color: theme.danger }} accessibilityRole="alert">
                    {errors[state.submitError]}
                  </ThemedText>
                )}

                {record?.canSubmit && !state.loadError && (
                  <Card>
                    <ThemedText type="subtitle">{status === 'REJECTED' ? 'ส่งคำขอใหม่' : 'ข้อมูลสำหรับเปิดร้าน'}</ThemedText>
                    <ThemedText themeColor="textSecondary" style={{ fontSize: 12 }}>
                      ชื่อร้านแสดงแก่ผู้ซื้อ ส่วนข้อมูลบัญชีและรูปบัตรใช้เพื่อให้ผู้ดูแลตรวจสอบคำขอ
                    </ThemedText>

                    <TextField
                      label="ชื่อร้านค้า"
                      placeholder="เช่น มายด์ มือสอง"
                      value={values.shopName}
                      editable={!busy}
                      error={state.fieldErrors.shopName}
                      onChangeText={value => update('shopName', value)}
                    />

                    {/* ID Card image box */}
                    <View style={[styles.noticeBox, { borderColor: theme.inputBorder, borderStyle: 'dashed', padding: 16, gap: 10 }]}>
                      <ThemedText type="smallBold">รูปบัตรประชาชน</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        JPG, PNG หรือ WEBP ขนาดไม่เกิน 5 MB ให้เห็นชื่อและรูปถ่ายชัดเจน ไม่มีแสงสะท้อน
                      </ThemedText>
                      <Button
                        label={values.idCard ? 'เปลี่ยนรูปบัตรประชาชน' : 'เลือกรูปบัตรประชาชน'}
                        accessibilityLabel="เลือกรูปบัตรประชาชน"
                        disabled={busy}
                        onPress={() => { void pick(); }}
                      />
                      {!!values.idCard && (
                        <Image
                          source={{ uri: values.idCard.uri }}
                          contentFit="contain"
                          style={{ height: 140, width: '100%', borderRadius: 8 }}
                          accessibilityLabel="รูปบัตรที่เลือก"
                        />
                      )}
                      {!!(state.fieldErrors.idCard || pickerError) && (
                        <ThemedText style={{ color: theme.danger }} accessibilityRole="alert">
                          {state.fieldErrors.idCard || pickerError}
                        </ThemedText>
                      )}
                    </View>

                    {/* Bank account section */}
                    <View style={{ gap: 8 }}>
                      <ThemedText type="smallBold">บัญชีธนาคารสำหรับรับเงิน</ThemedText>

                      {/* Quick bank chips */}
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
                        {POPULAR_BANKS.map(bank => {
                          const isSelected = values.bankName === bank;
                          return (
                            <Pressable
                              key={bank}
                              onPress={() => update('bankName', bank)}
                              style={{
                                paddingHorizontal: 10,
                                paddingVertical: 6,
                                borderRadius: 16,
                                borderWidth: 1,
                                borderColor: isSelected ? theme.primary : theme.border,
                                backgroundColor: isSelected ? (theme.backgroundSelected ?? '#ecfdf5') : theme.backgroundElement,
                              }}
                            >
                              <ThemedText style={{
                                fontSize: 11,
                                fontWeight: isSelected ? '700' : '500',
                                color: isSelected ? theme.primary : theme.textSecondary,
                              }}>
                                {bank}
                              </ThemedText>
                            </Pressable>
                          );
                        })}
                      </View>

                      <TextField
                        label="ชื่อธนาคาร"
                        placeholder="เช่น ธนาคารกสิกรไทย หรือเลือกจากรายการด้านบน"
                        value={values.bankName}
                        editable={!busy}
                        error={state.fieldErrors.bankName}
                        onChangeText={value => update('bankName', value)}
                      />

                      <TextField
                        label="ชื่อบัญชี"
                        placeholder="ชื่อ-นามสกุลตามหน้าสมุดบัญชี"
                        value={values.bankAccountName}
                        editable={!busy}
                        error={state.fieldErrors.bankAccountName}
                        onChangeText={value => update('bankAccountName', value)}
                      />
                      <ThemedText type="small" style={{ color: theme.warning, marginTop: -4 }}>
                        ชื่อบัญชีต้องตรงกับชื่อบนบัตรประชาชน
                      </ThemedText>

                      <TextField
                        label="เลขที่บัญชี"
                        placeholder="ตัวเลข 10–15 หลัก"
                        value={values.bankAccountNumber}
                        editable={!busy}
                        keyboardType="number-pad"
                        error={state.fieldErrors.bankAccountNumber}
                        onChangeText={value => update('bankAccountNumber', value)}
                      />
                    </View>

                    {/* PDPA Notice */}
                    <View style={[styles.noticeBox, { backgroundColor: theme.backgroundElement, borderColor: theme.border, flexDirection: 'row', gap: 8, alignItems: 'flex-start' }]}>
                      <ThemedText style={{ fontSize: 16 }}>🔒</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1, lineHeight: 18 }}>
                        รูปบัตรประชาชนถูกส่งผ่านเซิร์ฟเวอร์ของระบบและใช้เพื่อการตรวจสอบเท่านั้น · ผู้ซื้อไม่เห็นข้อมูลนี้ · นโยบายความเป็นส่วนตัว (PDPA)
                      </ThemedText>
                    </View>

                    <Button label="ส่งคำขอยืนยันตัวตน" variant="primary" busy={busy} onPress={() => { void submit(); }} />
                  </Card>
                )}
              </>
            )}
            <Button label="กลับหน้าหลัก" onPress={() => router.canGoBack() ? router.back() : router.replace('/profile')} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Screen>
  );
}
