import { Image } from 'expo-image';
import { Redirect, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/auth/auth-provider';
import { useTheme } from '@/hooks/use-theme';
import { MAX_REJECT_REASON_LENGTH } from '@/admin/review-form';
import { useReview } from '@/admin/review-provider';
import type {
  AdminVerificationErrorKind,
  ReviewQueueStatus,
  ReviewRequest,
} from '@/services/admin-verification-service';
import type { VerificationStatus } from '@/services/verification-service';

const statusLabels: Record<VerificationStatus, string> = {
  NOT_SUBMITTED: 'ยังไม่ส่งคำขอ',
  PENDING: 'รอตรวจสอบ',
  APPROVED: 'อนุมัติแล้ว',
  REJECTED: 'ถูกปฏิเสธ',
};

const statusColors: Record<VerificationStatus, string> = {
  NOT_SUBMITTED: '#60646C',
  PENDING: '#B7791F',
  APPROVED: '#2F855A',
  REJECTED: '#C53030',
};

const tabs: { status: ReviewQueueStatus; label: string }[] = [
  { status: 'PENDING', label: 'รอตรวจ' },
  { status: 'APPROVED', label: 'อนุมัติแล้ว' },
  { status: 'REJECTED', label: 'ถูกปฏิเสธ' },
];

const emptyMessages: Record<ReviewQueueStatus, string> = {
  PENDING: 'ไม่มีคำขอรอตรวจในขณะนี้',
  APPROVED: 'ยังไม่มีคำขอที่อนุมัติแล้ว',
  REJECTED: 'ยังไม่มีคำขอที่ถูกปฏิเสธ',
};

const errorMessages: Record<AdminVerificationErrorKind, string> = {
  unauthorized: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่',
  forbidden: 'บัญชีนี้ไม่มีสิทธิ์ดูคำขอยืนยันตัวตน',
  'not-found': 'ไม่พบคำขอนี้แล้ว ระบบได้ดึงรายการล่าสุดมาแสดงให้',
  conflict: 'คำขอนี้ถูกตรวจไปแล้ว ระบบได้ดึงรายการล่าสุดมาแสดงให้',
  'validation-error': 'ข้อมูลยังไม่ครบถ้วน กรุณาตรวจสอบช่องที่มีข้อความสีแดง',
  'network-error': 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่',
  'server-error': 'ระบบขัดข้อง กรุณาลองใหม่ภายหลัง',
  unavailable: 'บริการตรวจคำขอยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง',
};

const evidenceMessages: Record<AdminVerificationErrorKind, string> = {
  ...errorMessages,
  forbidden: 'บัญชีนี้ไม่มีสิทธิ์เปิดดูรูปบัตรประชาชน',
  'not-found': 'คำขอนี้ไม่มีรูปบัตรประชาชนให้ตรวจ',
  'server-error': 'เปิดดูรูปบัตรประชาชนไม่ได้ กรุณาลองใหม่ภายหลัง',
};

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString('th-TH');
}

export function AdminVerificationScreen() {
  const auth = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const { state, store } = useReview();

  const isAdmin = auth.account?.role === 'ADMIN';

  useEffect(() => {
    // owner ถูกตั้งหลัง effect ของหน้าจอนี้รอบแรก จึงต้องโหลดอีกครั้งเมื่อผูกบัญชีแล้ว
    if (!state.owner || state.loading || state.refreshing) return;
    if (!state.loaded && !state.loadError) void store.load();
  }, [state.loadError, state.loaded, state.loading, state.owner, state.refreshing, store]);

  if (!auth.session) return <Redirect href="/login" />;

  // ระหว่างที่ยังไม่รู้บทบาทจาก backend ต้องไม่แสดงโครงหน้าตรวจคำขอไปก่อน
  if (!auth.account) {
    return (
      <ThemedView style={styles.screen}>
        <SafeAreaView style={[styles.content, styles.center]}>
          {auth.accountError ? (
            <>
              <ThemedText accessibilityLiveRegion="polite">ตรวจสอบสิทธิ์บัญชีไม่สำเร็จ</ThemedText>
              <Pressable
                style={[styles.secondaryButton, auth.accountChecking && styles.buttonDisabled]}
                disabled={auth.accountChecking}
                accessibilityRole="button"
                onPress={() => { void auth.retryAccount(); }}>
                <ThemedText type="smallBold">ลองใหม่อีกครั้ง</ThemedText>
              </Pressable>
            </>
          ) : (
            <>
              <ActivityIndicator accessibilityLabel="กำลังตรวจสอบสิทธิ์บัญชี" />
              <ThemedText type="small">กำลังตรวจสอบสิทธิ์บัญชี</ThemedText>
            </>
          )}
          <Pressable style={styles.secondaryButton} accessibilityRole="button" onPress={() => router.back()}>
            <ThemedText type="smallBold">กลับหน้าหลัก</ThemedText>
          </Pressable>
        </SafeAreaView>
      </ThemedView>
    );
  }

  // บัญชีที่ไม่ใช่ผู้ดูแลไม่เห็นข้อมูลคำขอใด ๆ แม้จะเปิด URL ของหน้านี้ตรง ๆ
  if (!isAdmin) {
    return (
      <ThemedView style={styles.screen}>
        <SafeAreaView style={styles.content}>
          <ThemedText type="subtitle">ตรวจคำขอยืนยันตัวตน</ThemedText>
          <ThemedText>หน้านี้สำหรับบัญชีผู้ดูแลระบบเท่านั้น</ThemedText>
          <Pressable style={styles.secondaryButton} accessibilityRole="button" onPress={() => router.back()}>
            <ThemedText type="smallBold">กลับ</ThemedText>
          </Pressable>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const selected = state.items.find(item => item.id === state.selectedId) ?? null;
  const busy = state.deciding !== null;

  const renderListItem = (item: ReviewRequest) => {
    const submittedAt = formatDate(item.submittedAt);
    return (
      <Pressable
        key={item.id}
        style={[styles.listItem, { borderColor: theme.backgroundSelected }]}
        accessibilityRole="button"
        accessibilityLabel={`เปิดคำขอของ ${item.sellerName}`}
        onPress={() => store.select(item.id)}>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColors[item.status] }]} />
          <ThemedText type="smallBold" numberOfLines={1} style={styles.listName}>{item.sellerName}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">#{item.id}</ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{item.sellerEmail}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {item.bankName} • {item.bankAccountName} • เลขบัญชีลงท้าย {item.bankAccountLast4}
        </ThemedText>
        {submittedAt ? (
          <ThemedText type="small" themeColor="textSecondary">ส่งคำขอเมื่อ {submittedAt}</ThemedText>
        ) : null}
      </Pressable>
    );
  };

  const renderDetail = (item: ReviewRequest) => {
    const submittedAt = formatDate(item.submittedAt);
    const reviewedAt = formatDate(item.reviewedAt);
    const canDecide = item.status === 'PENDING';
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColors[item.status] }]} />
          <ThemedText type="smallBold" accessibilityLiveRegion="polite">
            คำขอ #{item.id} • {statusLabels[item.status]}
          </ThemedText>
        </View>

        <ThemedText type="smallBold">{item.sellerName}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{item.sellerEmail}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">ธนาคาร {item.bankName}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">ชื่อบัญชี {item.bankAccountName}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          เลขบัญชีลงท้าย {item.bankAccountLast4}
        </ThemedText>
        {submittedAt ? (
          <ThemedText type="small" themeColor="textSecondary">ส่งคำขอเมื่อ {submittedAt}</ThemedText>
        ) : null}
        {reviewedAt ? (
          <ThemedText type="small" themeColor="textSecondary">ตรวจเมื่อ {reviewedAt}</ThemedText>
        ) : null}
        {item.reviewedByName ? (
          <ThemedText type="small" themeColor="textSecondary">ผู้ตรวจ {item.reviewedByName}</ThemedText>
        ) : null}
        {item.status === 'REJECTED' && item.rejectReason ? (
          <ThemedView style={[styles.reasonBox, { borderColor: statusColors.REJECTED }]}>
            <ThemedText type="smallBold">เหตุผลที่ปฏิเสธ</ThemedText>
            <ThemedText type="small">{item.rejectReason}</ThemedText>
          </ThemedView>
        ) : null}

        <View style={styles.field}>
          <ThemedText type="smallBold">หลักฐานรูปบัตรประชาชน</ThemedText>
          {item.hasIdCardImage ? (
            <Pressable
              style={[styles.secondaryButton, state.evidenceLoading && styles.buttonDisabled]}
              disabled={state.evidenceLoading}
              accessibilityRole="button"
              accessibilityLabel="เปิดดูรูปบัตรประชาชน"
              onPress={() => { void store.loadEvidence(); }}>
              <ThemedText type="smallBold">
                {state.evidenceLoading
                  ? 'กำลังเปิดรูปบัตร'
                  : state.evidence ? 'โหลดรูปบัตรใหม่' : 'เปิดดูรูปบัตรประชาชน'}
              </ThemedText>
            </Pressable>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">คำขอนี้ไม่มีรูปบัตรแนบมา</ThemedText>
          )}
          {state.evidenceLoading ? <ActivityIndicator accessibilityLabel="กำลังเปิดรูปบัตร" /> : null}
          {state.evidence ? (
            <View style={styles.field}>
              <Image
                source={{ uri: state.evidence.url }}
                style={styles.evidence}
                contentFit="contain"
                accessibilityLabel={`รูปบัตรประชาชนของคำขอ ${item.id}`}
              />
              <ThemedText type="small" themeColor="textSecondary">
                ลิงก์รูปบัตรมีอายุ {Math.round(state.evidence.expiresIn / 60) || 1} นาที
                และใช้เพื่อการตรวจสอบเท่านั้น
              </ThemedText>
            </View>
          ) : null}
          {/* หลักฐานแสดงได้เท่าที่ API อนุญาต ถ้าถูกปฏิเสธสิทธิ์ก็บอกผู้ดูแลตรง ๆ */}
          {state.evidenceError ? (
            <ThemedText type="small" style={styles.errorText} accessibilityLiveRegion="polite">
              {evidenceMessages[state.evidenceError]}
            </ThemedText>
          ) : null}
        </View>

        {canDecide ? (
          <View style={styles.field}>
            <ThemedText type="smallBold">เหตุผล (บังคับกรอกเมื่อปฏิเสธ)</ThemedText>
            <TextInput
              style={[styles.input, {
                color: theme.text,
                borderColor: state.reasonError ? statusColors.REJECTED : theme.backgroundSelected,
              }]}
              value={state.rejectReason}
              onChangeText={text => store.setRejectReason(text)}
              placeholder="เช่น รูปบัตรไม่ชัด อ่านเลขบัตรไม่ออก"
              placeholderTextColor={theme.textSecondary}
              editable={!busy}
              multiline
              maxLength={MAX_REJECT_REASON_LENGTH}
              accessibilityLabel="เหตุผลที่ปฏิเสธ"
              accessibilityHint={state.reasonError ?? undefined}
            />
            {state.reasonError ? (
              <ThemedText type="small" style={styles.errorText} accessibilityLiveRegion="polite">
                {state.reasonError}
              </ThemedText>
            ) : null}

            {state.decisionError ? (
              <ThemedText type="small" style={styles.errorText} accessibilityLiveRegion="polite">
                {state.alreadyReviewed
                  ? `คำขอนี้ถูกตรวจไปแล้ว${state.alreadyReviewed.reviewedByName
                    ? ` โดย ${state.alreadyReviewed.reviewedByName}` : ''}`
                  : errorMessages[state.decisionError]}
              </ThemedText>
            ) : null}

            <View style={styles.actions}>
              <Pressable
                style={[styles.primaryButton, styles.approveButton, busy && styles.buttonDisabled]}
                disabled={busy}
                accessibilityRole="button"
                accessibilityState={{ disabled: busy, busy: state.deciding === 'APPROVED' }}
                onPress={() => { void store.decide('APPROVED'); }}>
                {state.deciding === 'APPROVED'
                  ? <ActivityIndicator color="#ffffff" accessibilityLabel="กำลังบันทึกการอนุมัติ" />
                  : null}
                <ThemedText type="smallBold" style={styles.primaryButtonText}>
                  {state.deciding === 'APPROVED' ? 'กำลังบันทึก' : 'อนุมัติ'}
                </ThemedText>
              </Pressable>

              <Pressable
                style={[styles.primaryButton, styles.rejectButton, busy && styles.buttonDisabled]}
                disabled={busy}
                accessibilityRole="button"
                accessibilityState={{ disabled: busy, busy: state.deciding === 'REJECTED' }}
                onPress={() => { void store.decide('REJECTED'); }}>
                {state.deciding === 'REJECTED'
                  ? <ActivityIndicator color="#ffffff" accessibilityLabel="กำลังบันทึกการปฏิเสธ" />
                  : null}
                <ThemedText type="smallBold" style={styles.primaryButtonText}>
                  {state.deciding === 'REJECTED' ? 'กำลังบันทึก' : 'ปฏิเสธ'}
                </ThemedText>
              </Pressable>
            </View>
          </View>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            คำขอนี้ถูกตรวจไปแล้ว จึงเปลี่ยนผลไม่ได้
          </ThemedText>
        )}

        <Pressable
          style={[styles.secondaryButton, busy && styles.buttonDisabled]}
          disabled={busy}
          accessibilityRole="button"
          onPress={() => store.select(null)}>
          <ThemedText type="smallBold">กลับไปที่รายการ</ThemedText>
        </Pressable>
      </ThemedView>
    );
  };

  return (
    <ThemedView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <SafeAreaView style={styles.content}>
          <ThemedText type="subtitle">ตรวจคำขอยืนยันตัวตน</ThemedText>

          <View style={styles.tabs}>
            {tabs.map(tab => {
              const active = state.status === tab.status;
              return (
                <Pressable
                  key={tab.status}
                  style={[styles.tab, { borderColor: theme.backgroundSelected },
                    active && styles.tabActive, busy && styles.buttonDisabled]}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => { void store.setStatus(tab.status); }}>
                  <ThemedText type="smallBold" style={active ? styles.tabActiveText : undefined}>
                    {tab.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          {state.lastDecision ? (
            <ThemedText type="small" accessibilityLiveRegion="polite">
              บันทึกผลคำขอ #{state.lastDecision.id} เป็น
              {state.lastDecision.decision === 'APPROVED' ? ' อนุมัติ' : ' ปฏิเสธ'} แล้ว
            </ThemedText>
          ) : null}

          {!selected && state.decisionError ? (
            <ThemedText type="small" style={styles.errorText} accessibilityLiveRegion="polite">
              {state.alreadyReviewed
                ? `คำขอนี้ถูกตรวจไปแล้ว${state.alreadyReviewed.reviewedByName
                  ? ` โดย ${state.alreadyReviewed.reviewedByName}` : ''}`
                : errorMessages[state.decisionError]}
            </ThemedText>
          ) : null}

          {state.loading && !state.loaded ? (
            <View style={styles.center}>
              <ActivityIndicator accessibilityLabel="กำลังโหลดรายการคำขอ" />
              <ThemedText type="small">กำลังโหลดรายการคำขอ</ThemedText>
            </View>
          ) : null}

          {state.loadError ? (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText accessibilityLiveRegion="polite">{errorMessages[state.loadError]}</ThemedText>
              <Pressable
                style={[styles.secondaryButton, (state.loading || state.refreshing) && styles.buttonDisabled]}
                disabled={state.loading || state.refreshing}
                accessibilityRole="button"
                onPress={() => { void store.retry(); }}>
                <ThemedText type="smallBold">ลองใหม่อีกครั้ง</ThemedText>
              </Pressable>
            </ThemedView>
          ) : null}

          {selected ? renderDetail(selected) : null}

          {!selected && state.loaded && !state.loadError ? (
            <ThemedView type="backgroundElement" style={styles.card}>
              <View style={styles.statusRow}>
                <ThemedText type="smallBold" style={styles.listName}>
                  {statusLabels[state.status]} ({state.total})
                </ThemedText>
                <Pressable
                  style={[styles.secondaryButton, state.refreshing && styles.buttonDisabled]}
                  disabled={state.loading || state.refreshing}
                  accessibilityRole="button"
                  onPress={() => { void store.refresh(); }}>
                  <ThemedText type="smallBold">
                    {state.refreshing ? 'กำลังรีเฟรช' : 'รีเฟรช'}
                  </ThemedText>
                </Pressable>
              </View>

              {state.items.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite">
                  {emptyMessages[state.status]}
                </ThemedText>
              ) : state.items.map(renderListItem)}

              {state.total > state.items.length ? (
                <ThemedText type="small" themeColor="textSecondary">
                  แสดง {state.items.length} จาก {state.total} คำขอ
                </ThemedText>
              ) : null}
            </ThemedView>
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
  tabs: { flexDirection: 'row', gap: Spacing.two },
  tab: { flex: 1, borderWidth: 1, borderRadius: Spacing.two, paddingVertical: Spacing.two, alignItems: 'center' },
  tabActive: { backgroundColor: '#243a73', borderColor: '#243a73' },
  tabActiveText: { color: '#ffffff' },
  listItem: { borderWidth: 1, borderRadius: Spacing.two, padding: Spacing.two, gap: Spacing.half },
  listName: { flex: 1 },
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
    minHeight: 72,
    textAlignVertical: 'top',
  },
  errorText: { color: '#C53030' },
  evidence: { width: '100%', height: 220, borderRadius: Spacing.two },
  actions: { flexDirection: 'row', gap: Spacing.two },
  primaryButton: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.two,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveButton: { backgroundColor: '#2F855A' },
  rejectButton: { backgroundColor: '#C53030' },
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
