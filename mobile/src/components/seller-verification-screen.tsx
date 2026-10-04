import { Image } from 'expo-image';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/auth-provider';
import { useTheme } from '@/hooks/use-theme';
import { useVerification } from '@/verification/verification-provider';
import { emptyVerificationForm, type VerificationFormValues } from '@/verification/verification-form';
import { pickIdCardImage } from '@/verification/pick-id-card';
import { type VerificationErrorKind } from '@/services/verification-service';
import { Button, Loading, Screen } from './order-ui';
import { MarketplaceHeader } from './marketplace-header';
import { ThemedText } from './themed-text';

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


function StepDot({ state, number }: { state: 'done' | 'now' | 'todo'; number: number }) {
  const theme = useTheme();
  return <View style={[local.stepDot,
    state === 'done' ? { backgroundColor: '#10b981' }
      : state === 'now' ? { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderWidth: 2, borderColor: '#10b981' }
        : { backgroundColor: theme.backgroundElement, borderWidth: 1, borderColor: theme.border }]}>
    {state === 'done'
      ? <Svg width={11} height={11} viewBox="0 0 24 24" fill="none"><Path d="M5 13l4 4L19 7" stroke="#ffffff" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" /></Svg>
      : <ThemedText style={[local.stepNumber, { color: state === 'now' ? '#10b981' : theme.textSecondary }]}>{number}</ThemedText>}
  </View>;
}

/** 3 ขั้นตาม design: ส่งข้อมูล → ผู้ดูแลตรวจสอบ → เริ่มขายได้ (สถานะจาก API) */
function VerificationStepper({ status }: { status: 'NOT_SUBMITTED' | 'PENDING' | 'APPROVED' | 'REJECTED' }) {
  const theme = useTheme();
  const steps: { label: string; state: 'done' | 'now' | 'todo' }[] = [
    { label: 'ส่งข้อมูล', state: status === 'PENDING' || status === 'APPROVED' ? 'done' : 'now' },
    { label: 'ผู้ดูแลตรวจสอบ', state: status === 'APPROVED' ? 'done' : status === 'PENDING' ? 'now' : 'todo' },
    { label: 'เริ่มขายได้', state: status === 'APPROVED' ? 'done' : 'todo' },
  ];
  return <View style={local.stepper}>
    {steps.flatMap((step, index) => [
      <View key={step.label} style={local.stepItem}>
        <StepDot state={step.state} number={index + 1} />
        <ThemedText style={[local.stepLabel, { color: step.state === 'todo' ? theme.textSecondary : theme.text, fontWeight: step.state === 'now' ? '700' : '500' }]}>{step.label}</ThemedText>
      </View>,
      index < steps.length - 1
        ? <View key={`line-${step.label}`} style={[local.stepLine, { backgroundColor: step.state === 'done' ? '#10b981' : 'rgba(100, 116, 139, 0.3)' }]} />
        : null,
    ])}
  </View>;
}

const statusTitles = {
  NOT_SUBMITTED: 'เตรียมร้านของคุณให้พร้อม',
  PENDING: 'กำลังตรวจสอบคำขอของคุณ',
  APPROVED: 'ร้านค้าได้รับอนุมัติแล้ว',
  REJECTED: 'คำขอถูกปฏิเสธ',
} as const;
const statusPills = {
  NOT_SUBMITTED: { label: 'ยังไม่ส่งคำขอ', fg: '#64748b', bg: 'rgba(100, 116, 139, 0.18)' },
  PENDING: { label: 'รอตรวจสอบ', fg: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
  APPROVED: { label: 'อนุมัติแล้ว', fg: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' },
  REJECTED: { label: 'ถูกปฏิเสธ', fg: '#f43f5e', bg: 'rgba(244, 63, 94, 0.15)' },
} as const;
const statusSubtitles = {
  NOT_SUBMITTED: '',
  PENDING: 'ส่งคำขอแล้ว กำลังรอผู้ตรวจสอบพิจารณา ระหว่างนี้ยังส่งคำขอใหม่ไม่ได้',
  APPROVED: 'คุณลงขายสินค้าได้แล้ว และยังซื้อสินค้าได้เหมือนเดิม',
  REJECTED: 'แก้ไขข้อมูลตามเหตุผลด้านล่างแล้วส่งคำขอใหม่ได้',
} as const;

function StatusIcon({ status }: { status: keyof typeof statusPills }) {
  const color = statusPills[status].fg;
  const stroke = { stroke: color, strokeWidth: 2, fill: 'none' as const, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return <View style={[local.statusIcon, { backgroundColor: statusPills[status].bg }]}>
    <Svg width={34} height={34} viewBox="0 0 24 24">
      {status === 'APPROVED' ? <><Circle {...stroke} cx={12} cy={12} r={9} /><Path {...stroke} d="m8.5 12.5 2.5 2.5 4.5-5" /></>
        : status === 'REJECTED' ? <><Circle {...stroke} cx={12} cy={12} r={9} /><Path {...stroke} d="M12 8v4M12 16h.01" /></>
          : <><Circle {...stroke} cx={12} cy={12} r={9} /><Path {...stroke} d="M12 7v5l3 2" /></>}
    </Svg>
  </View>;
}

function FormField({ label, value, placeholder, editable, error, hint, numeric, onChangeText }: {
  label: string; value: string; placeholder: string; editable: boolean; error?: string; hint?: string; numeric?: boolean; onChangeText(value: string): void;
}) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return <View style={{ gap: 6 }}>
    <ThemedText style={[local.fieldLabel, { color: theme.text }]}>{label}</ThemedText>
    <TextInput accessibilityLabel={label} accessibilityHint={error} value={value} placeholder={placeholder} editable={editable}
      keyboardType={numeric ? 'number-pad' : 'default'} placeholderTextColor={theme.textSecondary}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onChangeText={onChangeText}
      style={[local.input, { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: error ? '#f43f5e' : focused ? '#10b981' : theme.border }]} />
    {error ? <ThemedText accessibilityRole="alert" style={local.fieldError}>{error}</ThemedText> : hint ? <ThemedText style={[local.hint, { color: theme.textSecondary }]}>{hint}</ThemedText> : null}
  </View>;
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

  // รอกู้ session ก่อน ไม่งั้นเปิดลิงก์หน้านี้ตรง ๆ จะถูกส่งไปหน้า login ทั้งที่ล็อกอินอยู่
  if (auth.initializing) return <Screen><Loading label="กำลังตรวจสอบบัญชี" /></Screen>;
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
  const showForm = customer && !!record?.canSubmit && !state.loadError;
  const muted = theme.background === '#0c0e14' ? '#64748b' : '#94a3b8';
  const card = [local.card, { backgroundColor: theme.surface, borderColor: theme.border }];

  return (
    <Screen>
      <SafeAreaView style={[local.page, { backgroundColor: theme.background }]}>
        <MarketplaceHeader title="ยืนยันตัวตนผู้ขาย" back />
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={local.content}>
            {auth.accountError ? (
              <View style={card}>
                <ThemedText accessibilityRole="alert" style={{ color: '#f43f5e', fontSize: 12 }}>ตรวจสอบสิทธิ์บัญชีไม่สำเร็จ</ThemedText>
                <Button label="ลองใหม่อีกครั้ง" onPress={() => { void auth.retryAccount(); }} />
              </View>
            ) : !auth.account || auth.accountChecking ? (
              <Loading label="กำลังตรวจสอบสิทธิ์บัญชี" />
            ) : !customer ? (
              <View style={card}>
                <ThemedText style={{ fontSize: 13, color: theme.text }}>บัญชีนี้ยังไม่พร้อมขอเปิดร้าน</ThemedText>
                <Button label="ลองตรวจบัญชีอีกครั้ง" onPress={() => { void auth.retryAccount(); }} />
              </View>
            ) : (
              <>
                <VerificationStepper status={status} />

                {(state.loading || state.refreshing) && <Loading label="กำลังโหลดสถานะคำขอ" />}
                {state.loadError && (
                  <View style={card}>
                    <ThemedText accessibilityRole="alert" style={{ color: '#f43f5e', fontSize: 12 }}>{errors[state.loadError]}</ThemedText>
                    <Button label="ลองใหม่อีกครั้ง" onPress={() => { void store.retry(); }} />
                  </View>
                )}

                {/* สถานะคำขอแบบ design (ไม่ใช้ mascot) — ไม่แสดงตอนยังไม่เคยส่ง */}
                {record && status !== 'NOT_SUBMITTED' && (
                  <>
                    <View style={local.statusHead}>
                      <StatusIcon status={status} />
                      <View style={[local.statusPill, { backgroundColor: statusPills[status].bg }]}>
                        <ThemedText accessibilityLiveRegion="polite" style={[local.statusPillText, { color: statusPills[status].fg }]}>{statusPills[status].label}</ThemedText>
                      </View>
                      <ThemedText style={[local.statusTitle, { color: theme.text }]}>{statusTitles[status]}</ThemedText>
                      <ThemedText style={[local.statusSub, { color: theme.textSecondary }]}>{statusSubtitles[status]}</ThemedText>
                    </View>

                    {status === 'PENDING' && (
                      <View style={[local.infoBox, { backgroundColor: theme.backgroundElement }]}>
                        <InfoLine icon="clock" text="ปกติใช้เวลาตรวจสอบ 1–2 วันทำการ" />
                        <InfoLine icon="bag" text="ระหว่างนี้คุณยังซื้อสินค้าได้ตามปกติ ไม่ต้องส่งคำขอซ้ำ" />
                      </View>
                    )}

                    {record.rejectReason && (
                      <View style={local.rejectBox}>
                        <ThemedText style={local.rejectTitle}>เหตุผลที่ถูกปฏิเสธ</ThemedText>
                        <ThemedText style={[local.rejectText, { color: theme.text }]}>{record.rejectReason}</ThemedText>
                        {record.reviewedAt ? <ThemedText style={[local.hint, { color: muted }]}>ตรวจสอบเมื่อ {new Date(record.reviewedAt).toLocaleString('th-TH')}</ThemedText> : null}
                      </View>
                    )}

                    <View style={card}>
                      <ThemedText style={[local.cardTitle, { color: theme.text }]}>{status === 'REJECTED' ? 'ข้อมูลที่ส่งครั้งก่อน' : 'ข้อมูลที่ส่ง'}</ThemedText>
                      {([
                        ['ชื่อร้านค้า', record.shopName],
                        ['ธนาคาร', record.bankName],
                        ['ชื่อบัญชี', record.bankAccountName],
                        ['เลขที่บัญชี', record.bankAccountLast4 ? `เลขบัญชีลงท้าย ${record.bankAccountLast4}` : null],
                      ] as const).filter(([, value]) => !!value).map(([label, value]) => (
                        <View key={label} style={local.row}>
                          <ThemedText style={[local.rowLabel, { color: theme.textSecondary }]}>{label}</ThemedText>
                          <ThemedText style={[local.rowValue, { color: theme.text }]}>{value}</ThemedText>
                        </View>
                      ))}
                      {record.reviewedAt && !record.rejectReason ? <ThemedText style={[local.hint, { color: muted }]}>ตรวจสอบเมื่อ {new Date(record.reviewedAt).toLocaleString('th-TH')}</ThemedText> : null}
                    </View>

                    {status === 'APPROVED' && (
                      <View style={[local.infoBox, { backgroundColor: theme.backgroundElement }]}>
                        <ThemedText style={[local.cardTitle, { color: theme.text, fontSize: 13 }]}>สิ่งที่ทำได้ตอนนี้</ThemedText>
                        <InfoLine icon="plus" text='ลงขายสินค้าจากปุ่ม "ร้านของฉัน" หรือปุ่มด้านล่าง' />
                        <InfoLine icon="receipt" text='ดูคำสั่งซื้อที่ลูกค้าสั่งในแท็บ "ออเดอร์ร้าน"' />
                        <InfoLine icon="bag" text="ยังซื้อสินค้าได้เหมือนเดิม" />
                      </View>
                    )}

                    <Button label="รีเฟรชสถานะ" busy={state.refreshing} onPress={() => { void store.refresh(); void auth.retryAccount(); }} />
                    {status === 'APPROVED' && auth.account?.role === 'SELLER' && !auth.accountChecking && (
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <View style={{ flex: 1 }}><Button label="ลงขายสินค้า" variant="primary" onPress={() => router.push('/product/new')} /></View>
                        <View style={{ flex: 1 }}><Button label="สินค้าของฉัน" onPress={() => router.push('/product/mine')} /></View>
                      </View>
                    )}
                  </>
                )}

                {showForm && (
                  <>
                    {status === 'REJECTED' ? <ThemedText style={[local.sectionTitle, { color: theme.text }]}>ส่งคำขอใหม่</ThemedText> : null}
                    <View style={card}>
                      <FormField label="ชื่อร้านค้า" placeholder="เช่น มายด์ มือสอง" value={values.shopName} editable={!busy}
                        error={state.fieldErrors.shopName} hint="จะแสดงเป็นชื่อผู้ขายในหน้ารายละเอียดสินค้า" onChangeText={value => update('shopName', value)} />
                    </View>

                    <View style={card}>
                      <ThemedText style={[local.fieldLabel, { color: theme.text }]}>รูปบัตรประชาชน</ThemedText>
                      <Pressable accessibilityRole="button" accessibilityLabel="เลือกรูปบัตรประชาชน" disabled={busy}
                        onPress={() => { void pick(); }}
                        style={({ pressed }) => [local.idTile, { opacity: busy ? 0.5 : pressed ? 0.8 : 1 }]}>
                        {values.idCard ? (
                          <Image source={{ uri: values.idCard.uri }} contentFit="cover" style={StyleSheet.absoluteFill} accessibilityLabel="รูปบัตรที่เลือก" />
                        ) : (
                          <>
                            <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
                              <Path d="M4 8h3l2-3h6l2 3h3v11H4z" stroke="#10b981" strokeWidth={2} strokeLinejoin="round" />
                              <Circle cx={12} cy={13} r={3.5} stroke="#10b981" strokeWidth={2} />
                            </Svg>
                            <ThemedText style={local.idTileText}>ถ่ายหรือเลือกรูปบัตรประชาชน</ThemedText>
                          </>
                        )}
                      </Pressable>
                      {values.idCard ? <ThemedText style={[local.hint, { color: '#10b981', fontWeight: '600' }]}>แตะรูปเพื่อเปลี่ยนรูปบัตรประชาชน</ThemedText> : null}
                      <ThemedText style={[local.hint, { color: theme.textSecondary }]}>JPG, PNG หรือ WEBP ไม่เกิน 5 MB · ถ่ายให้เห็นชื่อและรูปถ่ายชัด ไม่มีแสงสะท้อน</ThemedText>
                      {!!(state.fieldErrors.idCard || pickerError) && (
                        <ThemedText style={local.fieldError} accessibilityRole="alert">{state.fieldErrors.idCard || pickerError}</ThemedText>
                      )}
                    </View>

                    <View style={card}>
                      <ThemedText style={[local.cardTitle, { color: theme.text }]}>บัญชีธนาคารสำหรับรับเงิน</ThemedText>
                      <View style={local.bankChips}>
                        {POPULAR_BANKS.map(bank => {
                          const isSelected = values.bankName === bank;
                          return (
                            <Pressable key={bank} accessibilityRole="button" accessibilityLabel={`เลือก${bank}`} accessibilityState={{ selected: isSelected }}
                              disabled={busy} onPress={() => update('bankName', bank)}
                              style={[local.bankChip, { backgroundColor: isSelected ? '#059669' : theme.backgroundElement }]}>
                              <ThemedText style={[local.bankChipText, { color: isSelected ? '#ffffff' : theme.textSecondary, fontWeight: isSelected ? '700' : '500' }]}>{bank}</ThemedText>
                            </Pressable>
                          );
                        })}
                      </View>
                      <FormField label="ชื่อธนาคาร" placeholder="เลือกจากรายการด้านบน หรือพิมพ์ชื่อธนาคาร" value={values.bankName} editable={!busy}
                        error={state.fieldErrors.bankName} onChangeText={value => update('bankName', value)} />
                      <FormField label="ชื่อบัญชี" placeholder="ชื่อ-นามสกุลตามหน้าสมุดบัญชี" value={values.bankAccountName} editable={!busy}
                        error={state.fieldErrors.bankAccountName} onChangeText={value => update('bankAccountName', value)} />
                      <ThemedText style={[local.hint, { color: '#f59e0b', marginTop: -4 }]}>ชื่อบัญชีต้องตรงกับชื่อบนบัตรประชาชน</ThemedText>
                      <FormField label="เลขที่บัญชี" placeholder="ตัวเลข 10–15 หลัก" value={values.bankAccountNumber} editable={!busy} numeric
                        error={state.fieldErrors.bankAccountNumber} onChangeText={value => update('bankAccountNumber', value)} />
                    </View>

                    <View style={[local.infoBox, { backgroundColor: theme.backgroundElement, flexDirection: 'row', gap: 8 }]}>
                      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" style={{ marginTop: 1 }}>
                        <Rect x={5} y={11} width={14} height={10} rx={2} stroke={theme.textSecondary} strokeWidth={2} />
                        <Path d="M8 11V7a4 4 0 0 1 8 0v4" stroke={theme.textSecondary} strokeWidth={2} />
                      </Svg>
                      <ThemedText style={[local.hint, { flex: 1, color: theme.textSecondary, fontSize: 11, lineHeight: 17 }]}>
                        รูปบัตรประชาชนถูกส่งผ่านเซิร์ฟเวอร์ของระบบและใช้เพื่อการตรวจสอบเท่านั้น · ผู้ซื้อไม่เห็นข้อมูลนี้ · นโยบายความเป็นส่วนตัว (PDPA)
                      </ThemedText>
                    </View>
                  </>
                )}

                {state.submitError && (
                  <ThemedText style={local.fieldError} accessibilityRole="alert">{errors[state.submitError]}</ThemedText>
                )}
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>

        {/* ปุ่มส่งติดล่างแบบ design */}
        {showForm ? (
          <View style={[local.bottomBar, { backgroundColor: theme.background === '#0c0e14' ? '#121622' : '#ffffff', borderTopColor: theme.border }]}>
            <Button label="ส่งคำขอยืนยันตัวตน" variant="primary" busy={busy} onPress={() => { void submit(); }} />
          </View>
        ) : null}
      </SafeAreaView>
    </Screen>
  );
}

function InfoLine({ icon, text }: { icon: 'clock' | 'bag' | 'plus' | 'receipt'; text: string }) {
  const theme = useTheme();
  const c = theme.textSecondary;
  return <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" style={{ marginTop: 2 }}>
      {icon === 'clock' ? <><Circle cx={12} cy={12} r={9} stroke={c} strokeWidth={2} /><Path d="M12 7v5l3 2" stroke={c} strokeWidth={2} strokeLinecap="round" /></>
        : icon === 'bag' ? <Path d="M16 11V7a4 4 0 0 0-8 0v4M5 9h14l1 12H4L5 9z" stroke={c} strokeWidth={2} strokeLinejoin="round" />
          : icon === 'plus' ? <Path d="M12 5v14M5 12h14" stroke={c} strokeWidth={2} strokeLinecap="round" />
            : <Path d="M7 3h10a1 1 0 0 1 1 1v17l-3-2-3 2-3-2-3 2V4a1 1 0 0 1 1-1zM9 8h6M9 12h6" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
    </Svg>
    <ThemedText style={{ flex: 1, fontSize: 11, lineHeight: 17, color: c }}>{text}</ThemedText>
  </View>;
}

const local = StyleSheet.create({
  page: { flex: 1, width: '100%', alignSelf: 'center' },
  content: { padding: 16, gap: 12, paddingBottom: 24, width: '100%', maxWidth: 800, alignSelf: 'center' },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 10 },
  cardTitle: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  sectionTitle: { fontSize: 14, lineHeight: 20, fontWeight: '700', paddingHorizontal: 4, marginTop: 4 },
  stepper: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 8, paddingVertical: 4 },
  stepItem: { alignItems: 'center', gap: 4, width: 84 },
  stepDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stepNumber: { fontSize: 11, lineHeight: 14, fontWeight: '700' },
  stepLabel: { fontSize: 10, lineHeight: 14, textAlign: 'center' },
  stepLine: { flex: 1, height: 2, marginTop: 11, marginHorizontal: -20 },
  statusHead: { alignItems: 'center', gap: 6, paddingVertical: 8 },
  statusIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  statusPillText: { fontSize: 10, lineHeight: 15, fontWeight: '700' },
  statusTitle: { fontSize: 16, lineHeight: 24, fontWeight: '700', textAlign: 'center' },
  statusSub: { fontSize: 12, lineHeight: 18, textAlign: 'center', maxWidth: 300 },
  infoBox: { borderRadius: 16, padding: 12, gap: 6 },
  rejectBox: { borderRadius: 16, borderWidth: 1, borderColor: 'rgba(244, 63, 94, 0.4)', backgroundColor: 'rgba(244, 63, 94, 0.1)', padding: 14, gap: 4 },
  rejectTitle: { fontSize: 11, lineHeight: 16, fontWeight: '700', color: '#f43f5e' },
  rejectText: { fontSize: 13, lineHeight: 20 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowLabel: { fontSize: 12, lineHeight: 18 },
  rowValue: { flexShrink: 1, fontSize: 12, lineHeight: 18, fontWeight: '600', textAlign: 'right' },
  fieldLabel: { fontSize: 12, lineHeight: 18, fontWeight: '700' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, minHeight: 42 },
  hint: { fontSize: 10, lineHeight: 15 },
  fieldError: { fontSize: 11, lineHeight: 16, color: '#f43f5e' },
  idTile: {
    aspectRatio: 1.586,
    width: '100%',
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(16, 185, 129, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    overflow: 'hidden',
  },
  idTileText: { fontSize: 12, lineHeight: 18, fontWeight: '700', color: '#10b981' },
  bankChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  bankChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  bankChipText: { fontSize: 11, lineHeight: 15 },
  bottomBar: { borderTopWidth: 1, paddingHorizontal: 16, paddingVertical: 12 },
});
