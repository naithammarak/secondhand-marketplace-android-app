import React, { useEffect, useRef } from 'react';
import {
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { BrandIcon, BrandWordmark } from './brand-logo';
import { useMotionAllowed } from './motion';
import { useTheme } from '@/hooks/use-theme';

interface SplashScreenViewProps {
  onFinish(): void;
}

/**
 * 2NDHAND Splash Screen Animation
 * Based on Figma: "2NDHAND Splash Screen.fig" (Android Compact 4 → 8)
 *
 * Sequence:
 * 1. Blank screen for 250ms
 * 2. 4→5: Logo opacity 0→1 (Spring mass 1, stiffness 600, damping 15 · 958ms)
 * 3. 5→6: Logo x 158→287 (Spring mass 1, stiffness 300, damping 20 · 744ms)
 * 4. 6→7: Logo x 287→56 + Cover shrinks 222→0 (covers the full 220px wordmark) (ease-out cubic(0,0,.58,1) · 800ms)
 * 5. Pause for 800ms
 * 6. 7→8: Stage opacity 1→0 (linear 600ms) → onFinish()
 */
export function SplashScreenView({ onFinish }: SplashScreenViewProps) {
  const windowWidth = Dimensions.get('window').width;
  const stageScale = Math.min(1, Math.max(0.65, windowWidth / 412));
  const motionAllowed = useMotionAllowed();
  // พื้นและม่านต้องเป็นสีเดียวกับพื้นธีม ไม่งั้นธีมมืดโลโก้สีขาวจะกลืนกับพื้นขาว
  const theme = useTheme();
  const finishedRef = useRef(false);

  const stageOpacity = useSharedValue(1);
  const logoOpacity = useSharedValue(0);
  const logoX = useSharedValue(158);
  const coverWidth = useSharedValue(222);

  const handleFinish = () => {
    if (!finishedRef.current) {
      finishedRef.current = true;
      onFinish();
    }
  };

  useEffect(() => {
    if (!motionAllowed) {
      // Reduced motion: show static logo for brief moment then finish
      const t = setTimeout(() => {
        handleFinish();
      }, 1000);
      return () => clearTimeout(t);
    }

    const t0 = 250; // Initial brief blank screen

    // 4→5: Logo fade in
    logoOpacity.value = withDelay(
      t0,
      withSpring(1, {
        stiffness: 600,
        damping: 15,
        mass: 1,
      }),
    );

    // 5→6: Logo moves right (158 -> 287)
    const t1 = t0 + 958;
    logoX.value = withDelay(
      t1,
      withSpring(287, {
        stiffness: 300,
        damping: 20,
        mass: 1,
      }),
    );

    // 6→7: Logo moves left (287 -> 56) and cover shrinks (222 -> 0)
    const t2 = t1 + 744;
    const easeOutFigma = Easing.bezier(0, 0, 0.58, 1);

    logoX.value = withDelay(
      t2,
      withTiming(56, {
        duration: 800,
        easing: easeOutFigma,
      }),
    );

    coverWidth.value = withDelay(
      t2,
      withTiming(0, {
        duration: 800,
        easing: easeOutFigma,
      }),
    );

    // 7→8: Hold for 800ms, then stage fades out (1 -> 0 over 600ms)
    const t3 = t2 + 800 + 800;
    stageOpacity.value = withDelay(
      t3,
      withTiming(
        0,
        {
          duration: 600,
          easing: Easing.linear,
        },
        finished => {
          if (finished) {
            runOnJS(handleFinish)();
          }
        },
      ),
    );

    // Fallback safety timer
    const totalTime = t3 + 750;
    const safetyTimer = setTimeout(() => {
      handleFinish();
    }, totalTime);

    return () => {
      clearTimeout(safetyTimer);
      cancelAnimation(stageOpacity);
      cancelAnimation(logoOpacity);
      cancelAnimation(logoX);
      cancelAnimation(coverWidth);
    };
  }, [motionAllowed]);

  const animatedStageStyle = useAnimatedStyle(() => ({
    opacity: stageOpacity.value,
    transform: [{ scale: stageScale }],
  }));

  const animatedLogoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    left: logoX.value,
  }));

  const animatedCoverStyle = useAnimatedStyle(() => ({
    width: coverWidth.value,
  }));

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]} testID="splash-screen-container">
      {/* Skip button in top right */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="ข้าม"
        onPress={handleFinish}
        style={({ pressed }) => [
          styles.skipButton,
          { backgroundColor: theme.backgroundElement, borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Text style={[styles.skipButtonText, { color: theme.textSecondary }]}>ข้าม</Text>
      </Pressable>

      {/* Main 412x96 Stage */}
      <Animated.View style={[styles.stage, animatedStageStyle]}>
        {/* Wordmark (2NDHAND Marketplace) */}
        <View style={styles.wordmarkContainer}>
          <BrandWordmark width={220} height={78} />
        </View>

        {/* Wordmark Cover (theme-coloured curtain that reveals wordmark as it shrinks) */}
        <Animated.View style={[styles.cover, { backgroundColor: theme.background }, animatedCoverStyle]} />

        {/* Moving Logo Emblem */}
        <Animated.View style={[styles.logoContainer, animatedLogoStyle]}>
          <BrandIcon size={96} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10000,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  skipButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  stage: {
    width: 412,
    height: 96,
    position: 'relative',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  wordmarkContainer: {
    position: 'absolute',
    left: 137,
    top: 9,
    width: 220,
    height: 78,
    justifyContent: 'center',
  },
  cover: {
    position: 'absolute',
    left: 137,
    top: 8,
    height: 80,
    zIndex: 2,
  },
  logoContainer: {
    position: 'absolute',
    top: 0,
    width: 96,
    height: 96,
    zIndex: 3,
  },
});
