import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { G, Path, Polygon } from 'react-native-svg';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useMotionAllowed } from './motion';
import { useThemePreference } from '@/theme/theme-provider';

interface WondeeLoaderProps {
  size?: number;
  accessibilityLabel?: string;
}

/**
 * 2NDHAND Prototype-accurate Loader
 * Features:
 * 1. Dual rotating circular arrows (#10B981 emerald + theme slate).
 * 2. 3D isometric cube in the center with subtle bobbing motion.
 * Directly extracted from prototype index.html (loaderSVG).
 */
export function WondeeLoader({
  size = 36,
  accessibilityLabel = 'กำลังโหลด',
}: WondeeLoaderProps) {
  const { scheme } = useThemePreference();
  const isDark = scheme === 'dark';
  const motionAllowed = useMotionAllowed();

  const arrowRotation = useSharedValue(0);
  const cubeOffsetY = useSharedValue(0);

  useEffect(() => {
    if (!motionAllowed) {
      cancelAnimation(arrowRotation);
      cancelAnimation(cubeOffsetY);
      arrowRotation.value = 0;
      cubeOffsetY.value = 0;
      return;
    }

    // Continuous 360-degree rotation for the arrows (1200ms)
    arrowRotation.value = withRepeat(
      withTiming(360, {
        duration: 1200,
        easing: Easing.linear,
      }),
      -1,
      false,
    );

    // Subtle bobbing motion for the 3D cube (1200ms cycle)
    cubeOffsetY.value = withRepeat(
      withSequence(
        withTiming(-2, {
          duration: 600,
          easing: Easing.inOut(Easing.quad),
        }),
        withTiming(0, {
          duration: 600,
          easing: Easing.inOut(Easing.quad),
        }),
      ),
      -1,
      true,
    );

    return () => {
      cancelAnimation(arrowRotation);
      cancelAnimation(cubeOffsetY);
    };
  }, [motionAllowed, arrowRotation, cubeOffsetY]);

  const animatedArrowStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${arrowRotation.value}deg` }],
  }));

  const animatedCubeStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: cubeOffsetY.value }],
  }));

  const darkColor = isDark ? '#E2E8F0' : '#1E293B';
  const emeraldColor = '#10B981';

  return (
    <View
      style={[styles.container, { width: size, height: size }]}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
    >
      {/* Rotating Dual Arrows */}
      <Animated.View style={[StyleSheet.absoluteFill, animatedArrowStyle]}>
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <G>
            {/* Top Green Arrow */}
            <Path
              d="M8.4 27.8 A24 24 0 0 1 54.5 23.8"
              fill="none"
              stroke={emeraldColor}
              strokeWidth={5}
              strokeLinecap="round"
            />
            <Polygon points="56.6,29.6 59.4,21.6 49.6,24.9" fill={emeraldColor} />

            {/* Bottom Dark/Slate Arrow (Rotated 180) */}
            <G transform="rotate(180 32 32)">
              <Path
                d="M8.4 27.8 A24 24 0 0 1 54.5 23.8"
                fill="none"
                stroke={darkColor}
                strokeWidth={5}
                strokeLinecap="round"
              />
              <Polygon points="56.6,29.6 59.4,21.6 49.6,24.9" fill={darkColor} />
            </G>
          </G>
        </Svg>
      </Animated.View>

      {/* Bobbing Isometric 3D Cube */}
      <Animated.View style={[StyleSheet.absoluteFill, animatedCubeStyle]}>
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <G>
            {/* Cube Top Face */}
            <Polygon points="32,20.5 42,26 32,31.5 22,26" fill={darkColor} opacity={0.9} />
            {/* Cube Left Face */}
            <Polygon points="22,27.4 31.2,32.6 31.2,43.5 22,38.3" fill={darkColor} opacity={0.7} />
            {/* Cube Right Face */}
            <Polygon points="32.8,32.6 42,27.4 42,38.3 32.8,43.5" fill={darkColor} opacity={0.8} />
          </G>
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
});
