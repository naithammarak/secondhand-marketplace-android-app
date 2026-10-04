/**
 * UI2 staff kit: role guard, account-scoped loader and small status pieces built on
 * the existing theme/primitives. Swap to UI1 shared primitives after E_BASE if wanted.
 */
import { useCallback, useEffect, useRef, useState, type PropsWithChildren, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Redirect, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/auth-provider';
import { useTheme } from '@/hooks/use-theme';
import { inspectionError } from '@/inspections/use-inspection-api';
import { Button, Loading, Screen, styles } from '../order-ui';
import { MarketplaceHeader } from '../marketplace-header';
import { ThemedText } from '../themed-text';
import { TextField } from '../wondee/primitives';

export type StaffRole = 'INSPECTOR' | 'ADMIN';

/** Client role check is convenience only; every request is authorized by the server. */
export function StaffScreen({ title, role, children, fill }: PropsWithChildren<{ title: string; role: StaffRole;
  /** true = หน้าจัดการ ScrollView/แถบล่างเอง (เช่นหน้าตรวจสินค้าที่มีปุ่มหลักติดล่างจอ) */
  fill?: boolean }>) {
  const theme = useTheme();
  const auth = useAuth();
  if (!auth.initializing && !auth.session) return <Redirect href="/login" />;
  const checking = auth.initializing || auth.accountChecking;
  const allowed = auth.account?.source === 'backend' && !auth.accountError && auth.account.role === role;
  const gate = checking ? <Loading label="กำลังตรวจสอบบัญชี" />
    : !allowed ? <Notice tone="neutral" testID="staff-denied" title="บัญชีนี้ไม่มีสิทธิ์ใช้งานส่วนนี้" detail="สิทธิ์เจ้าหน้าที่กำหนดโดยผู้ดูแลระบบเท่านั้น">
      <Button label="ตรวจบัญชีอีกครั้ง" onPress={() => { void auth.retryAccount(); }} /></Notice> : null;
  return <Screen><SafeAreaView style={[styles.content, { flex: 1, alignSelf: 'center', gap: 0, maxWidth: undefined, backgroundColor: theme.background }]}>
    <MarketplaceHeader title={title} back />
    {fill && !gate
      // Key by account so private images and data never carry across a switch.
      ? <View key={auth.session?.user.id} style={{ flex: 1 }}>{children}</View>
      : <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48, width: '100%', maxWidth: 800, alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        {gate ?? <View key={auth.session?.user.id} style={{ gap: 14 }}>{children}</View>}
      </ScrollView>}
  </SafeAreaView></Screen>;
}

/** Load on focus; drop responses from older requests. */
export function useStaffResource<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState<number>();
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true); setError(undefined); setStatus(undefined);
    try { const next = await load(); if (generation.current === current) setData(next); }
    catch (failure) {
      if (generation.current !== current) return;
      setError(inspectionError(failure));
      setStatus(typeof failure === 'object' && failure !== null ? (failure as { status?: number }).status : undefined);
    } finally { if (generation.current === current) setLoading(false); }
  }, [load]);
  useFocusEffect(useCallback(() => { void reload(); return () => { generation.current++; }; }, [reload]));
  return { data, error, status, loading, reload };
}

export function LoadState({ loading, error, reload, label = 'กำลังโหลดข้อมูลจากระบบ' }: { loading: boolean; error?: string; reload(): Promise<void>; label?: string }) {
  return <>{loading ? <Loading label={label} /> : null}
    {error ? <Notice tone="danger" title="โหลดข้อมูลไม่สำเร็จ" detail={error}><Button label="ลองโหลดอีกครั้ง" onPress={() => { void reload(); }} /></Notice> : null}</>;
}

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';
export function Notice({ tone, title, detail, children, testID }: PropsWithChildren<{ tone: Tone; title: string; detail?: ReactNode; testID?: string }>) {
  const theme = useTheme();
  const tint = { success: '16, 185, 129', warning: '245, 158, 11', danger: '244, 63, 94', info: '14, 165, 233' } as const;
  const fg = tone === 'neutral' ? theme.text : theme[tone];
  const bg = tone === 'neutral' ? theme.surface : `rgba(${tint[tone]}, 0.1)`;
  const border = tone === 'neutral' ? theme.border : `rgba(${tint[tone]}, 0.35)`;
  return <View testID={testID} accessibilityLiveRegion="polite" style={{ borderWidth: 1, borderColor: border, backgroundColor: bg, borderRadius: 16, padding: 14, gap: 8 }}>
    <ThemedText style={{ color: fg, fontSize: 14, lineHeight: 20, fontWeight: '700' }}>{title}</ThemedText>
    {typeof detail === 'string' ? <ThemedText themeColor="textSecondary" style={{ fontSize: 12, lineHeight: 18 }}>{detail}</ThemedText> : detail}
    {children}
  </View>;
}

export function SimLabel({ text = 'จำลองสำหรับต้นแบบ' }: { text?: string }) {
  const theme = useTheme();
  return <View style={{ alignSelf: 'flex-start', borderWidth: 1, borderColor: theme.warning, backgroundColor: theme.warningSoft, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
    <ThemedText type="small" style={{ color: theme.warning, fontSize: 11 }}>{text}</ThemedText>
  </View>;
}

export const codePoints = (value: string) => [...value.trim()].length;

export function ReasonInput({ label, value, onChange, min = 10, max = 1000, editable = true }: {
  label: string; value: string; onChange(value: string): void; min?: number; max?: number; editable?: boolean;
}) {
  const count = codePoints(value);
  const error = count > max ? `ไม่เกิน ${max} ตัวอักษร` : count > 0 && count < min ? `อย่างน้อย ${min} ตัวอักษร` : undefined;
  return <View style={{ gap: 4 }}>
    <TextField label={label} value={value} onChangeText={onChange} multiline editable={editable} error={error} style={{ minHeight: 96, textAlignVertical: 'top' }} />
    <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'right' }}>{count}/{max}</ThemedText>
  </View>;
}

export function Field({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  if (!value) return null;
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, paddingVertical: 3 }}>
    <ThemedText themeColor="textSecondary" style={{ fontSize: 12, lineHeight: 18 }}>{label}</ThemedText>
    <ThemedText selectable style={[{ fontSize: 12, lineHeight: 18, fontWeight: '600', flexShrink: 1, textAlign: 'right' }, mono ? { fontFamily: 'monospace' } : null]}>{value}</ThemedText>
  </View>;
}

export const when = (value: string | null | undefined) => (value ? new Date(value).toLocaleString('th-TH') : null);

/** Remaining time to a server deadline, informative only. */
export function remaining(deadline: string | null | undefined, serverNow?: string | null): string | null {
  if (!deadline) return null;
  const now = serverNow ? Date.parse(serverNow) : Date.now();
  const left = Math.floor((Date.parse(deadline) - now) / 1000);
  if (Number.isNaN(left) || left <= 0) return null;
  const days = Math.floor(left / 86400);
  const hours = Math.floor((left % 86400) / 3600);
  const minutes = Math.floor((left % 3600) / 60);
  return days > 0 ? `${days} วัน ${hours} ชม.` : `${hours} ชม. ${minutes} นาที`;
}

/** Choice chips (role-free; used for filters, results, resolutions and references). */
export function Chips<T extends string>({ options, value, onChange, disabled, multi, scroll }: {
  options: { value: T; label: string }[]; value: T | T[] | null; onChange(value: T): void; disabled?: boolean; multi?: boolean;
  /** แถวเดียวเลื่อนแนวนอน (ไม่ตัดบรรทัด) สำหรับแถบตัวกรองด้านบน */
  scroll?: boolean;
}) {
  const selected = (item: T) => (Array.isArray(value) ? value.includes(item) : value === item);
  const theme = useTheme();
  // ชิปแบบเม็ดยา (design home-chip) แตะง่าย เห็นตัวที่เลือกชัด
  const chips = options.map(option => {
    const on = selected(option.value);
    return <Pressable key={option.value} accessibilityRole="button" accessibilityLabel={option.label}
      accessibilityState={{ selected: on, disabled: !!disabled }} disabled={disabled} onPress={() => onChange(option.value)}
      style={({ pressed }) => ({ minHeight: 36, borderRadius: 999, paddingHorizontal: 14, justifyContent: 'center',
        backgroundColor: on ? '#059669' : theme.backgroundElement, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 })}>
      <ThemedText style={{ fontSize: 12, lineHeight: 17, fontWeight: on ? '700' : '500', color: on ? '#ffffff' : theme.textSecondary }}>
        {multi ? (on ? '✓ ' : '') : ''}{option.label}
      </ThemedText>
    </Pressable>;
  });
  return scroll
    ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginHorizontal: -16 }}
      contentContainerStyle={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16 }}>{chips}</ScrollView>
    : <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{chips}</View>;
}

export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(timer); }, [intervalMs]);
  return now;
}
