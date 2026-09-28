import { useEffect, useState, type PropsWithChildren } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View, type TextInputProps, useWindowDimensions } from 'react-native';
import { Image, type ImageSource } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/hooks/use-theme';
import { Fonts } from '@/constants/theme';
import { ThemedText } from '../themed-text';
import { WondeeMascot } from './brand';
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
export function EmptyState({ title, detail, children }: PropsWithChildren<{ title: string; detail?: string }>) {
  return <View style={styles.state}><WondeeMascot size={80} /><ThemedText type="subtitle">{title}</ThemedText>
    {detail && <ThemedText style={{ textAlign: 'center' }} themeColor="textSecondary">{detail}</ThemedText>}{children}</View>;
}
export function ErrorState({ title, detail, children }: PropsWithChildren<{ title: string; detail?: string }>) {
  const theme = useTheme();
  return <View accessibilityLiveRegion="polite" style={[styles.state, { backgroundColor: theme.dangerSoft, borderRadius: 16 }]}>
    <WondeeMascot size={64} variant="discrepancy" /><ThemedText type="subtitle">{title}</ThemedText>
    {detail && <ThemedText>{detail}</ThemedText>}{children}</View>;
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
    <ScrollView horizontal style={{ maxHeight: 420 }}><ScrollView style={{ maxHeight: 420 }}><Image source={source} style={{ width: size * scale, height: size * scale }} contentFit="contain" accessibilityLabel={label} /></ScrollView></ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  zoom: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: Fonts.sans },
  state: { padding: 24, alignItems: 'center', gap: 12 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.65)', justifyContent: 'center', padding: 16 },
  sheet: { padding: 24, gap: 16, borderRadius: 24, width: '100%', maxWidth: 600, alignSelf: 'center' },
  close: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
});
