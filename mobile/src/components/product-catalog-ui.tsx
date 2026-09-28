import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, View, type DimensionValue } from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { MarketplaceIcon } from './marketplace-icon';

type ProductImageProps = {
  uri: string | null | undefined;
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  accessibilityLabel?: string;
  hovered?: boolean;
};

/** แสดง placeholder เมื่อไม่มีรูปหรือรูปโหลดไม่สำเร็จ (onError) แต่ละ instance มี state ความล้มเหลวของตัวเอง */
export function ProductImage({ uri, width = 72, height = 72, borderRadius = 12, accessibilityLabel, hovered }: ProductImageProps) {
  const theme = useTheme();
  const [prevUri, setPrevUri] = useState(uri);
  const [failed, setFailed] = useState(false);
  const [internalHovered, setInternalHovered] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  if (prevUri !== uri) {
    setPrevUri(uri);
    setFailed(false);
  }

  const showPlaceholder = !uri || failed;
  const isHovered = hovered ?? internalHovered;
  const prevHovered = useRef(isHovered);

  useEffect(() => {
    if (prevHovered.current === isHovered) return;
    prevHovered.current = isHovered;
    const anim = Animated.timing(scaleAnim, {
      toValue: isHovered && !showPlaceholder ? 1.07 : 1,
      duration: 250,
      useNativeDriver: false,
    });
    anim.start();
    return () => {
      anim.stop();
    };
  }, [isHovered, showPlaceholder, scaleAnim]);

  return (
    <View
      onPointerEnter={() => setInternalHovered(true)}
      onPointerLeave={() => setInternalHovered(false)}
      style={[styles.frame, { width, height, borderRadius, backgroundColor: theme.backgroundSelected }]}
    >
      {showPlaceholder ? (
        <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel ?? 'ไม่มีรูปสินค้า'}>
          <MarketplaceIcon name="image" size={32} />
        </View>
      ) : (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { transform: [{ scale: scaleAnim }] },
            Platform.OS === 'web' ? ({ transition: 'transform 0.25s ease-out' } as any) : undefined,
          ]}
        >
          <Image
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            onError={() => setFailed(true)}
            accessibilityLabel={accessibilityLabel}
          />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
