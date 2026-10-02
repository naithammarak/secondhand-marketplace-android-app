import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import type { useProfile } from '@/profile/use-profile';
import { Button, Loading } from './order-ui';
import { ThemedText } from './themed-text';
import { ConsentModal } from './consent-modal';

export function ProfileDetails({ model }: { model: ReturnType<typeof useProfile> }) {
  const theme = useTheme();
  const { profile, busy, error } = model;
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);
  const [policy, setPolicy] = useState(false);
  useEffect(() => { setName(profile?.full_name ?? ''); }, [profile?.id, profile?.full_name]);
  useEffect(() => { setSaved(false); }, [profile?.id]);
  return <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
    <ThemedText type="subtitle">ข้อมูลส่วนตัว</ThemedText>
    {busy && <Loading label="กำลังโหลดหรือบันทึกข้อมูล" />}
    {error && <><ThemedText accessibilityRole="alert">{error}</ThemedText><Button label="โหลดโปรไฟล์อีกครั้ง" onPress={() => void model.reload()} disabled={busy} /></>}
    {profile && <>
      <ThemedText>อีเมล: {profile.email}</ThemedText>
      <ThemedText>บทบาท: {profile.role ?? 'ยังไม่ระบุ'}</ThemedText>
      <ThemedText>สถานะ: {profile.status}</ThemedText>
      <TextInput accessibilityLabel="ชื่อที่แสดง" value={name} editable={!busy && profile.status === 'ACTIVE'}
        onChangeText={value => { setName(value); setSaved(false); }}
        style={[styles.input, { color: theme.text, borderColor: theme.border }]} />
      <Button label="บันทึกชื่อ" disabled={busy || profile.status !== 'ACTIVE' || !name.trim()}
        onPress={() => { void model.save(name).then(ok => { if (ok) setSaved(true); }); }} />
      {saved && <ThemedText>บันทึกชื่อแล้ว</ThemedText>}
      <ThemedText>{profile.privacy_acknowledged_at
        ? `รับทราบนโยบาย ${profile.privacy_policy_version} เมื่อ ${profile.privacy_acknowledged_at}` : 'ยังไม่ได้บันทึกการรับทราบนโยบาย'}</ThemedText>
    </>}
    <Button label="อ่านข้อกำหนดและนโยบายความเป็นส่วนตัว" onPress={() => setPolicy(true)} />
    <ConsentModal visible={policy} userName={profile?.full_name} onCancel={() => setPolicy(false)}
      onAgree={() => { setPolicy(false); void model.reload(); }} />
  </View>;
}
const styles = StyleSheet.create({ card: { borderRadius: 18, padding: 16, borderWidth: 1, gap: 12 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12 } });
