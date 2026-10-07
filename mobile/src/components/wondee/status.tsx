/**
 * Shared status primitives (UI1-01). Stable props for UI1 and UI2 screens.
 * Presentation only: no network, no timers that change business state, no money math.
 */
import { useEffect, useState, type PropsWithChildren, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { formatBaht, formatDateTime, formatLongRemaining, textLength } from '@/orders/order-format';
import type { ActionFailure } from '@/orders/action-errors';
import { Button } from '../order-ui';
import { ThemedText } from '../themed-text';
import { TextField } from './primitives';

export { formatLongRemaining, textLength };

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

function toneColors(theme: ReturnType<typeof useTheme>, tone: Tone) {
  // พื้นอ่อน + ขอบโปร่งแบบ design (bg-*-500/10 border-*-500/30)
  const tint = { success: '16, 185, 129', warning: '245, 158, 11', danger: '244, 63, 94', info: '14, 165, 233' } as const;
  if (tone === 'neutral') return { fg: theme.text, bg: theme.backgroundElement, border: 'rgba(100, 116, 139, 0.25)' };
  return { fg: theme[tone], bg: `rgba(${tint[tone]}, 0.1)`, border: `rgba(${tint[tone]}, 0.3)` };
}

/** Section-level state banner. `testID` lets tests and visual QA target the state. */
export function StatusBanner({ tone, title, detail, children, testID }: PropsWithChildren<{
  tone: Tone; title: string; detail?: ReactNode; testID?: string;
}>) {
  const theme = useTheme();
  const colors = toneColors(theme, tone);
  return <View testID={testID} accessibilityLiveRegion="polite"
    style={[styles.banner, { backgroundColor: colors.bg, borderColor: colors.border }]}>
    <ThemedText style={{ color: tone === 'neutral' ? theme.text : colors.fg, fontSize: 14, lineHeight: 20, fontWeight: '700' }}>{title}</ThemedText>
    {typeof detail === 'string' ? <ThemedText themeColor="textSecondary" style={styles.bannerDetail}>{detail}</ThemedText> : detail}
    {children}
  </View>;
}

/** Visible label for every simulated provider fact (payment, transport event, payout/refund). */
export function SimulationLabel({ text = 'จำลองสำหรับต้นแบบ' }: { text?: string }) {
  const theme = useTheme();
  return <View accessibilityRole="text" style={[styles.pill, { backgroundColor: theme.warningSoft, borderColor: theme.warning }]}>
    <ThemedText type="small" style={{ color: theme.warning, fontSize: 11 }}>{text}</ThemedText>
  </View>;
}

/** Money row: server decimal strings only. `emphasis` for totals, `negative` shows a leading minus. */
export function MoneyRow({ label, amount, emphasis, negative, note }: {
  label: string; amount: string | null | undefined; emphasis?: boolean; negative?: boolean; note?: string;
}) {
  const shown = formatBaht(amount);
  return <View style={styles.moneyRow}>
    <View style={{ flex: 1, gap: 2 }}>
      <ThemedText themeColor={emphasis ? undefined : 'textSecondary'} style={emphasis ? styles.moneyStrong : styles.money}>{label}</ThemedText>
      {note ? <ThemedText themeColor="textSecondary" style={styles.moneyNote}>{note}</ThemedText> : null}
    </View>
    {/* ยอดรวมเป็นสีเขียวเฉพาะเมื่อมีเงินจริง ยอด 0 (เช่นไม่จ่ายผู้ขายเพราะคืนเงิน) ไม่ทำให้ดูเหมือนได้เงิน */}
    <ThemedText style={emphasis ? [styles.moneyStrong, Number(amount) > 0 ? { color: '#10b981' } : null] : styles.money}>{negative && shown !== '-' ? `-${shown}` : shown}</ThemedText>
  </View>;
}

export function SectionCard({ title, trailing, children, testID }: PropsWithChildren<{ title: string; trailing?: ReactNode; testID?: string }>) {
  const theme = useTheme();
  return <View testID={testID} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
    <View style={styles.cardHeader}><ThemedText style={styles.cardTitle}>{title}</ThemedText>{trailing}</View>
    {children}
  </View>;
}

/**
 * Informative countdown to a server deadline. The skew between server_time and the
 * device clock is applied so the display matches the server; reaching zero only calls
 * `onReached` (refetch) — it never settles, decides or dispatches anything.
 */
export function ServerDeadline({ label, deadline, serverTime, onReached, passedText = 'ถึงเวลาที่กำหนดแล้ว กำลังตรวจสถานะล่าสุดจากระบบ' }: {
  label: string; deadline: string | null | undefined; serverTime?: string | null; onReached?(): void; passedText?: string;
}) {
  const theme = useTheme();
  const [skew] = useState(() => {
    const server = serverTime ? new Date(serverTime).getTime() : NaN;
    return Number.isNaN(server) ? 0 : server - Date.now();
  });
  const [now, setNow] = useState(() => Date.now() + skew);
  useEffect(() => {
    if (!deadline) return;
    const timer = setInterval(() => setNow(Date.now() + skew), 1000);
    return () => clearInterval(timer);
  }, [deadline, skew]);
  const remaining = formatLongRemaining(deadline, now);
  const passed = !!deadline && remaining === null;
  useEffect(() => { if (passed) onReached?.(); }, [passed]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!deadline) return null;
  return <View style={[styles.deadline, { borderColor: passed ? theme.danger : theme.warning, backgroundColor: passed ? theme.dangerSoft : theme.warningSoft }]}
    accessibilityLabel={`${label} ${remaining ?? passedText}`}>
    <View style={{ flex: 1, gap: 2 }}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">ภายใน {formatDateTime(deadline) ?? '-'} (เวลาจากระบบ)</ThemedText>
    </View>
    <ThemedText type="smallBold" style={{ color: passed ? theme.danger : theme.warning, fontVariant: ['tabular-nums'] }}>
      {remaining ?? 'หมดเวลา'}
    </ThemedText>
    {passed ? <ThemedText type="small" style={{ color: theme.danger, width: '100%' }}>{passedText}</ThemedText> : null}
  </View>;
}

/** Failure notice with the server-driven next step. Retry reuses the caller's stored key. */
export function ActionNotice({ failure, onRetry, onRefetch, onLogin, retrying }: {
  failure: ActionFailure | null; onRetry?(): void; onRefetch?(): void; onLogin?(): void; retrying?: boolean;
}) {
  const theme = useTheme();
  if (!failure) return null;
  return <View accessibilityRole="alert" testID={`action-error-${failure.status}`}
    style={[styles.notice, { borderColor: theme.danger, backgroundColor: theme.dangerSoft }]}>
    <ThemedText type="small" style={{ color: theme.danger }}>{failure.message}</ThemedText>
    {failure.next === 'retry-same' && onRetry ? <Button label="ลองคำขอเดิมอีกครั้ง" busy={retrying} onPress={onRetry} /> : null}
    {failure.next === 'refetch' && onRefetch ? <Button label="โหลดสถานะล่าสุด" busy={retrying} onPress={onRefetch} /> : null}
    {failure.next === 'relogin' && onLogin ? <Button label="เข้าสู่ระบบอีกครั้ง" onPress={onLogin} /> : null}
  </View>;
}

/** Multiline reason with live count and server bounds; `min` 0 makes it optional. */
export function ReasonField({ label, value, onChange, min, max, editable = true, error }: {
  label: string; value: string; onChange(value: string): void; min: number; max: number; editable?: boolean; error?: string;
}) {
  const length = textLength(value);
  const local = length > max ? `ไม่เกิน ${max} ตัวอักษร` : length > 0 && length < min ? `อย่างน้อย ${min} ตัวอักษร` : undefined;
  return <View style={{ gap: 4 }}>
    <TextField label={label} value={value} onChangeText={onChange} multiline editable={editable}
      error={error ?? local} style={{ minHeight: 110, textAlignVertical: 'top' }} />
    <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'right' }}>{length}/{max}{min > 0 ? ` (ขั้นต่ำ ${min})` : ''}</ThemedText>
  </View>;
}

const styles = StyleSheet.create({
  banner: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 4 },
  bannerDetail: { fontSize: 11, lineHeight: 17 },
  money: { fontSize: 12, lineHeight: 18 },
  moneyStrong: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  moneyNote: { fontSize: 10, lineHeight: 15 },
  cardTitle: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  pill: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  moneyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 3 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deadline: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 14, padding: 12 },
  notice: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
});
