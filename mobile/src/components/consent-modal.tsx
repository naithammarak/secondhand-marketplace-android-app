import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/auth-provider';
import { useTheme } from '@/hooks/use-theme';
import { useProfile } from '@/profile/use-profile';
import { PROTOTYPE_POLICY } from '@/profile/policy';
import { POLICY_VERSION } from '@/services/profile-service';
import { MaxContentWidth } from '@/constants/theme';
import { ThemedText } from './themed-text';
import { BrandIcon } from './wondee/brand-logo';
import { Button } from './order-ui';

type Props = { visible: boolean; userName?: string | null; loading?: boolean; onAgree(): void; onCancel(): void };
export function ConsentModal(props: Props) {
  const auth = useAuth();
  return <Modal visible={props.visible} animationType="slide" onRequestClose={props.onCancel}>
    {props.visible && <PolicyContents key={auth.session?.user.id ?? 'guest'} {...props} />}
  </Modal>;
}

function PolicyContents({ userName, loading, onAgree, onCancel }: Props) {
  const theme = useTheme();
  const model = useProfile();
  const [checked, setChecked] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  return <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
    <ScrollView contentContainerStyle={styles.content}>
      <BrandIcon size={56} />
      <ThemedText type="subtitle">ข้อกำหนดและนโยบายความเป็นส่วนตัว</ThemedText>
      {!!userName && <ThemedText>{userName}</ThemedText>}
      <ThemedText>{POLICY_VERSION}</ThemedText>
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {PROTOTYPE_POLICY.map(paragraph => <ThemedText key={paragraph}>{paragraph}</ThemedText>)}
      </View>
      {model.profile?.privacy_acknowledged_at && <ThemedText>บันทึกการรับทราบแล้ว: {model.profile.privacy_acknowledged_at}</ThemedText>}
      {model.error && <><ThemedText accessibilityRole="alert">{model.error}</ThemedText><Button label="ลองโหลดนโยบายอีกครั้ง" onPress={() => void model.reload()} /></>}
      <Pressable accessibilityRole="checkbox" accessibilityLabel="รับทราบนโยบายต้นแบบ" accessibilityState={{ checked }} onPress={() => setChecked(!checked)}>
        <ThemedText>{checked ? '☑' : '☐'} ฉันอ่านและรับทราบนโยบายต้นแบบนี้</ThemedText>
      </Pressable>
      <Button label="บันทึกการรับทราบ" disabled={!checked || loading || model.busy || model.profile?.status !== 'ACTIVE'} onPress={() => {
        void model.acknowledge().then(ok => { if (ok && mounted.current) onAgree(); });
      }} />
      <Button label="ปิดนโยบาย" onPress={onCancel} />
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({ content: { padding: 20, gap: 16, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  card: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 14 } });
