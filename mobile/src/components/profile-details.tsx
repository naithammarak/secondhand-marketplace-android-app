import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/hooks/use-theme';
import type { useProfile } from '@/profile/use-profile';
import { Button, Loading } from './order-ui';
import { ThemedText } from './themed-text';
import { ConsentModal } from './consent-modal';

/** ข้อมูลส่วนตัว: แก้ได้เฉพาะชื่อที่แสดง อีเมล/บทบาท/สถานะอ่านอย่างเดียว และบันทึกการรับทราบนโยบายผ่าน API */
export function ProfileDetails({ model }: { model: ReturnType<typeof useProfile> }) {
  const theme = useTheme();
  const muted = theme.background === '#0c0e14' ? '#64748b' : '#94a3b8';
  const { profile, busy, error } = model;
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);
  const [policy, setPolicy] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => { setName(profile?.full_name ?? ''); }, [profile?.id, profile?.full_name]);
  useEffect(() => { setSaved(false); }, [profile?.id]);
  const editable = !busy && profile?.status === 'ACTIVE';
  return <View style={{ gap: 8 }}>
    <ThemedText style={[styles.groupTitle, { color: muted }]}>ข้อมูลส่วนตัว</ThemedText>
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {busy && <Loading label="กำลังโหลดหรือบันทึกข้อมูล" />}
      {error && <><ThemedText accessibilityRole="alert" style={{ color: theme.danger, fontSize: 12 }}>{error}</ThemedText>
        <Button label="โหลดโปรไฟล์อีกครั้ง" onPress={() => void model.reload()} disabled={busy} /></>}
      {profile && <>
        {[
          ['อีเมล', profile.email],
          ['บทบาท', profile.role ?? 'ยังไม่ระบุ'],
          ['สถานะ', profile.status],
        ].map(([label, value], index) => (
          <View key={label} style={[styles.row, index > 0 && { borderTopWidth: 1, borderTopColor: 'rgba(100, 116, 139, 0.15)' }]}>
            <ThemedText style={[styles.rowLabel, { color: theme.textSecondary }]}>{label}</ThemedText>
            <ThemedText style={[styles.rowValue, { color: theme.text }]} numberOfLines={1}>{value}</ThemedText>
          </View>
        ))}
        <View style={{ gap: 6, marginTop: 4 }}>
          <ThemedText style={[styles.fieldLabel, { color: theme.textSecondary }]}>ชื่อที่แสดง</ThemedText>
          <TextInput accessibilityLabel="ชื่อที่แสดง" value={name} editable={editable}
            onChangeText={value => { setName(value); setSaved(false); }}
            onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
            placeholderTextColor={muted}
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: focused ? '#10b981' : theme.border }]} />
        </View>
        <Button label="บันทึกชื่อ" variant="primary" disabled={busy || profile.status !== 'ACTIVE' || !name.trim() || name.trim() === profile.full_name}
          onPress={() => { void model.save(name).then(ok => { if (ok) setSaved(true); }); }} />
        {saved && <ThemedText style={styles.savedText}>บันทึกชื่อแล้ว</ThemedText>}
      </>}
      <Pressable accessibilityRole="button" accessibilityLabel="อ่านข้อกำหนดและนโยบายความเป็นส่วนตัว" onPress={() => setPolicy(true)}
        style={({ pressed }) => [styles.policyRow, { borderTopColor: 'rgba(100, 116, 139, 0.15)', opacity: pressed ? 0.7 : 1 }]}>
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
          <Path d="M12 3l7.5 3v5.5c0 4.4-3.2 8.3-7.5 9.5-4.3-1.2-7.5-5.1-7.5-9.5V6z" stroke={theme.textSecondary} strokeWidth={2} strokeLinejoin="round" />
        </Svg>
        <View style={{ flex: 1 }}>
          <ThemedText style={[styles.policyTitle, { color: theme.text }]}>อ่านข้อกำหนดและนโยบายความเป็นส่วนตัว</ThemedText>
          {profile ? <ThemedText style={[styles.policySub, { color: profile.privacy_acknowledged_at ? '#10b981' : '#f59e0b' }]}>
            {profile.privacy_acknowledged_at
              ? `รับทราบนโยบาย ${profile.privacy_policy_version} เมื่อ ${new Date(profile.privacy_acknowledged_at).toLocaleString('th-TH')}`
              : 'ยังไม่ได้บันทึกการรับทราบนโยบาย'}
          </ThemedText> : null}
        </View>
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none"><Path d="M9 5l7 7-7 7" stroke={theme.textSecondary} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
      </Pressable>
    </View>
    <ConsentModal visible={policy} userName={profile?.full_name} onCancel={() => setPolicy(false)}
      onAgree={() => { setPolicy(false); void model.reload(); }} />
  </View>;
}
const styles = StyleSheet.create({
  groupTitle: { fontSize: 11, lineHeight: 16, fontWeight: '600', paddingHorizontal: 4 },
  card: { borderRadius: 16, padding: 16, borderWidth: 1, gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 6 },
  rowLabel: { fontSize: 12, lineHeight: 18 },
  rowValue: { flexShrink: 1, fontSize: 12, lineHeight: 18, fontWeight: '600', textAlign: 'right' },
  fieldLabel: { fontSize: 11, lineHeight: 16, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13 },
  savedText: { fontSize: 12, color: '#10b981', fontWeight: '600' },
  policyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, paddingTop: 12, marginTop: 4 },
  policyTitle: { fontSize: 13, lineHeight: 19, fontWeight: '600' },
  policySub: { fontSize: 11, lineHeight: 16, marginTop: 2 },
});
