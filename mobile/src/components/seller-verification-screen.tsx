import { Image } from 'expo-image';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/auth/auth-provider';
import { useTheme } from '@/hooks/use-theme';
import type { VerificationErrorKind, VerificationStatus } from '@/services/verification-service';
import { pickIdCardImage } from '@/verification/pick-id-card';
import { emptyVerificationForm, type VerificationFormValues } from '@/verification/verification-form';
import { useVerification } from '@/verification/verification-provider';

const statusLabels: Record<VerificationStatus, string> = {
  NOT_SUBMITTED: 'ยังไม่ส่งคำขอ',
  PENDING: 'รอตรวจสอบ',
  APPROVED: 'อนุมัติแล้ว',
  REJECTED: 'ถูกปฏิเสธ',
};

const statusDescriptions: Record<VerificationStatus, string> = {
  NOT_SUBMITTED: 'กรอกข้อมูลด้านล่างเพื่อส่งคำขอยืนยันตัวตนผู้ขาย',
  PENDING: 'ส่งคำขอแล้ว กำลังรอผู้ตรวจสอบพิจารณา ระหว่างนี้ยังส่งคำขอใหม่ไม่ได้',
  APPROVED: 'บัญชีผู้ขายของคุณได้รับการยืนยันแล้ว',
  REJECTED: 'คำขอถูกปฏิเสธ แก้ไขข้อมูลตามเหตุผลด้านล่างแล้วส่งคำขอใหม่ได้',
};

const statusColors: Record<VerificationStatus, string> = {
  NOT_SUBMITTED: '#60646C',
  PENDING: '#B7791F',
  APPROVED: '#2F855A',
  REJECTED: '#C53030',
};

const errorMessages: Record<VerificationErrorKind, string> = {
  unauthorized: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่',
  forbidden: 'บัญชีนี้ไม่มีสิทธิ์ส่งคำขอยืนยันผู้ขาย',
  conflict: 'มีคำขอที่รอผลอยู่แล้ว ระบบได้ดึงสถานะล่าสุดมาแสดงให้',
  'validation-error': 'ข้อมูลยังไม่ครบถ้วน กรุณาตรวจสอบช่องที่มีข้อความสีแดง',
  'network-error': 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่',
  'server-error': 'ระบบขัดข้อง กรุณาลองใหม่ภายหลัง',
  unavailable: 'บริการยืนยันผู้ขายยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง',
};

const pickerMessages = {
  'permission-denied': 'ไม่ได้รับอนุญาตให้เข้าถึงคลังรูปภาพ กรุณาอนุญาตในการตั้งค่า',
  cancelled: '',
};

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString('th-TH');
}

export function SellerVerificationScreen() {
  const auth = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const { state, store } = useVerification();
  const [values, setValues] = useState<VerificationFormValues>(emptyVerificationForm);
  const [pickerError, setPickerError] = useState('');

  const record = state.record;
  const status = record?.status ?? 'NOT_SUBMITTED';
  const canSubmit = record ? record.canSubmit : true;
  const busy = state.submitting;

  useEffect(() => {
    // owner ถูกตั้งหลัง effect ของหน้าจอนี้รอบแรก จึงต้องโหลดอีกครั้งเมื่อผูกบัญชีแล้ว
    if (!state.owner || state.loading || state.refreshing) return;
    if (!state.record && !state.loadError) void store.load();
  }, [state.loadError, state.loading, state.owner, state.record, state.refreshing, store]);

  if (!auth.session) return <Redirect href="/" />;

  if (auth.account && auth.account.role !== 'SELLER') {
    return (
      <ThemedView style={styles.screen}>
        <SafeAreaView style={styles.content}>
          <ThemedText type="subtitle">ยืนยันตัวตนผู้ขาย</ThemedText>
          <ThemedText>หน้านี้สำหรับบัญชีผู้ขายเท่านั้น</ThemedText>
          <Pressable style={styles.secondaryButton} onPress={() => router.back()}>
            <ThemedText type="smallBold">กลับ</ThemedText>
          </Pressable>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const update = (field: keyof VerificationFormValues, value: string) => {
    setValues(current => ({ ...current, [field]: value }));
    store.clearFieldError(field);
  };

  const onPickImage = async () => {
    setPickerError('');
    const result = await pickIdCardImage();
    if (result.status === 'picked') {
      setValues(current => ({ ...current, idCard: result.file }));
      store.clearFieldError('idCard');
      return;
    }
    setPickerError(pickerMessages[result.status]);
  };

  const onSubmit = async () => {
    await store.submit(values);
    // ส่งสำเร็จแล้วล้างฟอร์ม เพื่อไม่ให้เลขบัญชีและรูปบัตรค้างอยู่บนหน้าจอ
    if (store.getSnapshot().record?.status === 'PENDING') setValues(emptyVerificationForm);
  };

  const fieldError = (field: keyof VerificationFormValues) => state.fieldErrors[field];

  const renderField = (
    field: 'bankName' | 'bankAccountName' | 'bankAccountNumber',
    label: string,
    placeholder: string,
    keyboardType: 'default' | 'number-pad' = 'default',
  ) => {
    const error = fieldError(field);
    return (
      <View style={styles.field}>
        <ThemedText type="smallBold">{label}</ThemedText>
        <TextInput
          style={[styles.input, { color: theme.text, borderColor: error ? statusColors.REJECTED : theme.backgroundSelected }]}
          value={values[field]}
          onChangeText={text => update(field, text)}
          placeholder={placeholder}
          placeholderTextColor={theme.textSecondary}
          editable={!busy}
          keyboardType={keyboardType}
          accessibilityLabel={label}
          accessibilityHint={error}
        />
        {error ? (
          <ThemedText type="small" style={styles.errorText} accessibilityLiveRegion="polite">
            {error}
          </ThemedText>
        ) : null}
      </View>
    );
  };

  const reviewedAt = formatDate(record?.reviewedAt ?? null);
  const verifiedAt = formatDate(record?.verifiedAt ?? null);

  return (
    <ThemedView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <SafeAreaView style={styles.content}>
          <ThemedText type="subtitle">ยืนยันตัวตนผู้ขาย</ThemedText>

          {state.loading && !record ? (
            <View style={styles.center}>
              <ActivityIndicator accessibilityLabel="กำลังโหลดสถานะคำขอ" />
              <ThemedText type="small">กำลังโหลดสถานะคำขอ</ThemedText>
            </View>
          ) : null}

          {state.loadError ? (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText accessibilityLiveRegion="polite">{errorMessages[state.loadError]}</ThemedText>
              <Pressable
                style={[styles.secondaryButton, state.refreshing && styles.buttonDisabled]}
                disabled={state.loading || state.refreshing}
                accessibilityRole="button"
                onPress={() => { void store.retry(); }}>
                <ThemedText type="smallBold">ลองใหม่อีกครั้ง</ThemedText>
              </Pressable>
            </ThemedView>
          ) : null}

          {record ? (
            <ThemedView type="backgroundElement" style={styles.card}>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: statusColors[status] }]} />
                <ThemedText type="smallBold" accessibilityLiveRegion="polite">
                  สถานะ: {statusLabels[status]}
                </ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary">{statusDescriptions[status]}</ThemedText>

              {record.bankName ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {record.bankName} • {record.bankAccountName} • เลขบัญชีลงท้าย {record.bankAccountLast4}
                </ThemedText>
              ) : null}
              {reviewedAt ? (
                <ThemedText type="small" themeColor="textSecondary">ตรวจสอบเมื่อ {reviewedAt}</ThemedText>
              ) : null}
              {verifiedAt ? (
                <ThemedText type="small" themeColor="textSecondary">ยืนยันเมื่อ {verifiedAt}</ThemedText>
              ) : null}

              {status === 'REJECTED' && record.rejectReason ? (
                <ThemedView style={[styles.reasonBox, { borderColor: statusColors.REJECTED }]}>
                  <ThemedText type="smallBold">เหตุผลที่ถูกปฏิเสธ</ThemedText>
                  <ThemedText type="small">{record.rejectReason}</ThemedText>
                </ThemedView>
              ) : null}

              <Pressable
                style={[styles.secondaryButton, (state.refreshing || state.loading) && styles.buttonDisabled]}
                disabled={state.refreshing || state.loading}
                accessibilityRole="button"
                onPress={() => { void store.refresh(); }}>
                <ThemedText type="smallBold">
                  {state.refreshing ? 'กำลังรีเฟรช' : 'รีเฟรชสถานะ'}
                </ThemedText>
              </Pressable>
            </ThemedView>
          ) : null}

          {canSubmit ? (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">
                {status === 'REJECTED' ? 'ส่งคำขอใหม่' : 'ข้อมูลสำหรับยืนยันตัวตน'}
              </ThemedText>

              {renderField('bankName', 'ชื่อธนาคาร', 'เช่น ธนาคารกรุงไทย')}
              {renderField('bankAccountName', 'ชื่อบัญชี', 'ชื่อ-นามสกุลตามหน้าสมุดบัญชี')}
              {renderField('bankAccountNumber', 'เลขที่บัญชี', 'ตัวเลข 10-15 หลัก', 'number-pad')}

              <View style={styles.field}>
                <ThemedText type="smallBold">รูปบัตรประชาชน</ThemedText>
                <Pressable
                  style={[styles.secondaryButton, busy && styles.buttonDisabled]}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel="เลือกรูปบัตรประชาชน"
                  onPress={() => { void onPickImage(); }}>
                  <ThemedText type="smallBold">
                    {values.idCard ? 'เปลี่ยนรูปบัตรประชาชน' : 'เลือกรูปบัตรประชาชน'}
                  </ThemedText>
                </Pressable>
                {values.idCard ? (
                  <View style={styles.previewRow}>
                    <Image source={{ uri: values.idCard.uri }} style={styles.preview} contentFit="cover" />
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={2} style={styles.previewName}>
                      {values.idCard.name}
                    </ThemedText>
                  </View>
                ) : null}
                {fieldError('idCard') ? (
                  <ThemedText type="small" style={styles.errorText} accessibilityLiveRegion="polite">
                    {fieldError('idCard')}
                  </ThemedText>
                ) : null}
                {pickerError ? (
                  <ThemedText type="small" style={styles.errorText} accessibilityLiveRegion="polite">
                    {pickerError}
                  </ThemedText>
                ) : null}
              </View>

              {state.submitError ? (
                <ThemedText type="small" style={styles.errorText} accessibilityLiveRegion="polite">
                  {errorMessages[state.submitError]}
                </ThemedText>
              ) : null}

              <Pressable
                style={[styles.primaryButton, busy && styles.buttonDisabled]}
                disabled={busy}
                accessibilityRole="button"
                accessibilityState={{ disabled: busy, busy }}
                onPress={() => { void onSubmit(); }}>
                {busy ? <ActivityIndicator color="#ffffff" accessibilityLabel="กำลังส่งคำขอ" /> : null}
                <ThemedText type="smallBold" style={styles.primaryButtonText}>
                  {busy ? 'กำลังส่งคำขอ' : 'ส่งคำขอยืนยันตัวตน'}
                </ThemedText>
              </Pressable>
              <ThemedText type="small" themeColor="textSecondary">
                รูปบัตรประชาชนถูกส่งผ่านเซิร์ฟเวอร์ของระบบและใช้เพื่อการตรวจสอบเท่านั้น
              </ThemedText>
            </ThemedView>
          ) : null}

          {!canSubmit && state.submitError === 'conflict' ? (
            <ThemedText type="small" accessibilityLiveRegion="polite">{errorMessages.conflict}</ThemedText>
          ) : null}

          <Pressable style={styles.secondaryButton} accessibilityRole="button" onPress={() => router.back()}>
            <ThemedText type="smallBold">กลับหน้าหลัก</ThemedText>
          </Pressable>
        </SafeAreaView>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollContent: { flexGrow: 1, alignItems: 'center', padding: Spacing.three },
  content: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.three },
  center: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.four },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  reasonBox: { borderWidth: 1, borderRadius: Spacing.two, padding: Spacing.two, gap: Spacing.half },
  field: { gap: Spacing.one },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  errorText: { color: '#C53030' },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  preview: { width: 72, height: 48, borderRadius: Spacing.one },
  previewName: { flexShrink: 1 },
  primaryButton: {
    flexDirection: 'row',
    gap: Spacing.two,
    backgroundColor: '#243a73',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { color: '#ffffff' },
  secondaryButton: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#243a73',
  },
  buttonDisabled: { opacity: 0.5 },
});
