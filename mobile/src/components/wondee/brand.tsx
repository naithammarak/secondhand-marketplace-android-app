import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from '../themed-text';
import { useMotionAllowed } from './motion';

export type MascotVariant = 'neutral' | 'courier' | 'inspector' | 'pass' | 'minor' | 'discrepancy' | 'fake' | 'seal';
export function WondeeMascot({ size = 64, variant = 'neutral', outline = false, animate = false }: {
  size?: number; variant?: MascotVariant; outline?: boolean; animate?: boolean;
}) {
  const theme = useTheme();
  const moving = useMotionAllowed(animate);
  const blink = useSharedValue(1);
  useEffect(() => {
    blink.value = 1;
    if (moving) blink.value = withRepeat(withSequence(withDelay(1800, withTiming(.12, { duration: 150 })),
      withTiming(1, { duration: 150 }), withTiming(.12, { duration: 150 }), withTiming(1, { duration: 250 })), -1);
    return () => { cancelAnimation(blink); };
  }, [blink, moving]);
  const eyeStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: blink.value }] }));
  const ink = outline ? theme.textSecondary : '#022c22';
  return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: size, height: size }}>
    <Svg width={size} height={size} viewBox="0 0 64 64">
      {variant === 'seal' && <Circle cx="32" cy="32" r="30" fill="none" stroke="#d4a94b" strokeWidth="2" strokeDasharray="3 2" />}
      <Path d="M32 8 C29 15 13 28 13 40 C13 52 22 57 32 57 C43 57 51 51 51 40 C51 28 36 17 32 8 Z"
        fill={outline ? 'none' : '#10b981'} stroke={outline ? theme.textSecondary : '#059669'} strokeWidth="2" />
      <Path d="M31 15 C30 7 38 3 44 5 C43 13 37 16 31 15Z" fill={outline ? 'none' : '#00baa7'} stroke={outline ? theme.textSecondary : '#00baa7'} />
      <Path d="M24 55 L24 60 M40 55 L40 60" stroke={outline ? theme.textSecondary : '#059669'} strokeWidth="4" strokeLinecap="round" />
      {variant === 'courier' && <><Path d="M15 25 Q29 8 46 22 L49 28 L15 28Z" fill="#0f766e" /><Rect x="26" y="20" width="11" height="4" rx="2" fill="#d1fae5" /></>}
      {variant === 'inspector' && <><Path d="M15 26 L22 13 L42 13 L49 26Z" fill="#a78bfa" /><Path d="M11 27 L53 27" stroke="#6d28d9" strokeWidth="4" /></>}
      {variant === 'pass' && <><Path d="M16 21 L20 9 L28 16 L33 4 L39 16 L47 9 L49 22Z" fill="#fbbf24" /><Path d="M24 44 Q32 51 40 44" stroke={ink} strokeWidth="2" fill="none" /></>}
      {variant === 'minor' && <><Circle cx="25" cy="36" r="8" fill="none" stroke="#022c22" strokeWidth="2" /><Circle cx="40" cy="36" r="8" fill="none" stroke="#022c22" strokeWidth="2" /></>}
      {(variant === 'inspector' || variant === 'discrepancy') && <><Circle cx="48" cy="43" r="10" fill="#cffafe" stroke="#d4a94b" strokeWidth="3" /><Path d="M54 51 L61 60" stroke="#d4a94b" strokeWidth="4" strokeLinecap="round" /></>}
      {variant === 'fake' && <><Path d="M44 34 L59 39 L58 51 Q53 59 48 61 Q40 56 39 46Z" fill="#be123c" /><Path d="M46 43 L53 50 M53 43 L46 50" stroke="white" strokeWidth="2" /></>}
    </Svg>
    <Animated.View style={[{ position: 'absolute', left: size * .29, top: size * .49, width: size * .38, height: size * .14 }, eyeStyle]}>
      <Svg width="100%" height="100%" viewBox="0 0 24 9"><Ellipse cx="6" cy="4.5" rx="2" ry="3.5" fill={ink} /><Ellipse cx="18" cy="4.5" rx="2" ry="3.5" fill={ink} /></Svg>
    </Animated.View>
  </View>;
}

export { BrandIcon, BrandWordmark, BrandHeaderLogo } from './brand-logo';
import { BrandIcon, BrandHeaderLogo } from './brand-logo';

export function WondeeLogo({ size = 32 }: { size?: number }) {
  return <BrandIcon size={size} />;
}

export function WondeeWordmark() {
  return <BrandHeaderLogo />;
}

const styles = StyleSheet.create({ wordmark: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 } });

export {
  GeometricMascot,
  MASCOT_PALETTES,
  getMascotBySeed,
  getRandomMascot,
  type GeometricMascotProps,
  type GeometricMascotShape,
  type MascotPalette,
} from './geometric-mascot';
