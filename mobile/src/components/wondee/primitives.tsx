import { useEffect, useState, type PropsWithChildren } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View, type TextInputProps, useWindowDimensions } from 'react-native';
import { Image, type ImageSource } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/hooks/use-theme';
import { Fonts } from '@/constants/theme';
import { ThemedText } from '../themed-text';
import Svg, { Circle, Path } from 'react-native-svg';
import { useMotionAllowed } from './motion';

export function TextField({ label, error, style, ...props }: TextInputProps & { label: string; error?: string }) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return <View style={{ gap: 6 }}>
    <ThemedText type="smallBold">{label}</ThemedText>
    <TextInput {...props} accessibilityLabel={label} accessibilityHint={error} placeholderTextColor={theme.textSecondary}
      onFocus={event => { setFocused(true); props.onFocus?.(event); }} onBlur={event => { setFocused(false); props.onBlur?.(event); }}
      style={[styles.input, { backgroundColor: theme.input, color: theme.text, borderColor: error ? theme.danger : focused ? theme.focus : theme.inputBorder }, style]} />
    {!!error && <ThemedText type="small" style={{ color: theme.danger }} accessibilityRole="alert">{error}</ThemedText>}
  </View>;
}
export type StateIconName = 'bag' | 'search' | 'offline' | 'alert' | 'receipt';
// ไอคอนเส้นในวงกลมตาม design (emptyBlock) แทน mascot
function StateIcon({ name, color }: { name: StateIconName; color: string }) {
  const stroke = { stroke: color, strokeWidth: 2, fill: 'none' as const, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return <Svg width={28} height={28} viewBox="0 0 24 24">
    {name === 'bag' && <Path {...stroke} d="M16 11V7a4 4 0 0 0-8 0v4M5 9h14l1 12H4L5 9z" />}
    {name === 'search' && <><Circle {...stroke} cx={11} cy={11} r={7} /><Path {...stroke} d="m20 20-4-4" /></>}
    {name === 'offline' && <Path {...stroke} d="M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.8M19 13a10 10 0 0 0-2.3-1.7M2 8.8a15 15 0 0 1 4.2-2.7M22 8.8a15 15 0 0 0-11.2-3.7M12 20h.01" />}
    {name === 'receipt' && <Path {...stroke} d="M7 3h10a1 1 0 0 1 1 1v17l-3-2-3 2-3-2-3 2V4a1 1 0 0 1 1-1zM9 8h6M9 12h6" />}
    {name === 'alert' && <><Circle {...stroke} cx={12} cy={12} r={9} /><Path {...stroke} d="M12 8v4M12 16h.01" /></>}
  </Svg>;
}
function StateBlock({ icon, iconColor, title, detail, children }: PropsWithChildren<{ icon: StateIconName; iconColor?: string; title: string; detail?: string }>) {
  const theme = useTheme();
  return <>
    <View style={[styles.stateIcon, { backgroundColor: theme.backgroundElement }]}><StateIcon name={icon} color={iconColor ?? theme.textSecondary} /></View>
    <ThemedText style={[styles.stateTitle, { color: theme.text }]}>{title}</ThemedText>
    {detail && <ThemedText style={styles.stateDetail} themeColor="textSecondary">{detail}</ThemedText>}
    {children}
  </>;
}
export function EmptyState({ title, detail, icon = 'bag', children }: PropsWithChildren<{ title: string; detail?: string; icon?: StateIconName }>) {
  return <View style={styles.state}><StateBlock icon={icon} title={title} detail={detail}>{children}</StateBlock></View>;
}
export function ErrorState({ title, detail, icon = 'alert', children }: PropsWithChildren<{ title: string; detail?: string; icon?: StateIconName }>) {
  const theme = useTheme();
  return <View accessibilityLiveRegion="polite" style={styles.state}>
    <StateBlock icon={icon} iconColor={theme.danger} title={title} detail={detail}>{children}</StateBlock>
  </View>;
}
export function Skeleton({ height = 20, label = 'กำลังโหลด', animated = true }: { height?: number; label?: string; animated?: boolean }) {
  const theme = useTheme();
  const moving = useMotionAllowed(animated);
  const sweep = useSharedValue(-1);
  useEffect(() => {
    sweep.value = -1;
    if (moving) sweep.value = withRepeat(withTiming(1, { duration: 1400 }), -1);
    return () => cancelAnimation(sweep);
  }, [moving, sweep]);
  const motion = useAnimatedStyle(() => ({ transform: [{ translateX: sweep.value * 400 }] }));
  return <View accessibilityLabel={label} accessibilityState={{ busy: true }} style={{ height, borderRadius: 12, backgroundColor: theme.skeleton, overflow: 'hidden' }}>
    {moving && <Animated.View style={[StyleSheet.absoluteFill, motion]}><LinearGradient colors={['transparent', theme.background === '#0c0e14' ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.95)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} /></Animated.View>}
  </View>;
}
export function ConfirmationSheet({ visible, title, children, onClose }: PropsWithChildren<{ visible: boolean; title: string; onClose(): void }>) {
  const theme = useTheme();
  return <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
    <View style={styles.backdrop}><ScrollView contentContainerStyle={[styles.sheet, { backgroundColor: theme.surface }]} accessibilityViewIsModal>
      <ThemedText type="subtitle">{title}</ThemedText>{children}
      <Pressable accessibilityRole="button" accessibilityLabel="ปิด" onPress={onClose} style={styles.close}><ThemedText themeColor="accent">ปิด</ThemedText></Pressable>
    </ScrollView></View>
  </Modal>;
}
export function ImageViewer({ uri, source, label, onClose }: { uri?: string | null; source?: ImageSource | null; label: string; onClose(): void }) {
  const picture = source ?? (uri ? { uri } : null);
  return <ConfirmationSheet visible={!!picture} title={label} onClose={onClose}>
    {picture && <ZoomImage key={uri ?? JSON.stringify(source)} source={picture} label={label} />}
  </ConfirmationSheet>;
}
function ZoomImage({ source, label }: { source: ImageSource; label: string }) {
  const { width } = useWindowDimensions();
  const [scale, setScale] = useState(1);
  const size = Math.max(160, Math.min(width - 80, 520));
  return <View style={{ gap: 12 }}>
    <View style={{ flexDirection: 'row', gap: 12, justifyContent: 'center' }}>
      <Pressable accessibilityRole="button" accessibilityLabel="ย่อภาพ" disabled={scale === 1} onPress={() => setScale(value => Math.max(1, value - 1))} style={styles.zoom}><ThemedText>−</ThemedText></Pressable>
      <ThemedText style={{ alignSelf: 'center' }}>{scale}×</ThemedText>
      <Pressable accessibilityRole="button" accessibilityLabel="ขยายภาพ" disabled={scale === 4} onPress={() => setScale(value => Math.min(4, value + 1))} style={styles.zoom}><ThemedText>+</ThemedText></Pressable>
    </View>
    <ScrollView horizontal style={{ maxHeight: 420 }}><ScrollView style={{ maxHeight: 420 }}><Image source={source} cachePolicy="none" style={{ width: size * scale, height: size * scale }} contentFit="contain" accessibilityLabel={label} /></ScrollView></ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  zoom: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: Fonts.sans },
  state: { paddingVertical: 40, paddingHorizontal: 24, alignItems: 'center' },
  stateIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  stateTitle: { fontSize: 14, lineHeight: 20, fontWeight: '700', textAlign: 'center' },
  stateDetail: { fontSize: 11, lineHeight: 17, marginTop: 4, textAlign: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.65)', justifyContent: 'center', padding: 16 },
  sheet: { padding: 24, gap: 16, borderRadius: 24, width: '100%', maxWidth: 600, alignSelf: 'center' },
  close: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
});
