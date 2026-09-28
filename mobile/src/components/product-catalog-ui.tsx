import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View, type DimensionValue } from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { MarketplaceIcon } from './marketplace-icon';

type ProductImageProps = {
  uri: string | null | undefined;
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  accessibilityLabel?: string;
};

/** แสดง placeholder เมื่อไม่มีรูปหรือรูปโหลดไม่สำเร็จ (onError) แต่ละ instance มี state ความล้มเหลวของตัวเอง */
export function ProductImage({ uri, width = 72, height = 72, borderRadius = 12, accessibilityLabel }: ProductImageProps) {
  const theme = useTheme();
  const [prevUri, setPrevUri] = useState(uri);
  const [failed, setFailed] = useState(false);

  if (prevUri !== uri) {
    setPrevUri(uri);
    setFailed(false);
  }

  const showPlaceholder = !uri || failed;

  return (
    <View style={[styles.frame, { width, height, borderRadius, backgroundColor: theme.backgroundSelected }]}>
      {showPlaceholder ? (
        <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel ?? 'ไม่มีรูปสินค้า'}>
          <MarketplaceIcon name="image" size={32} />
        </View>
      ) : (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          onError={() => setFailed(true)}
          accessibilityLabel={accessibilityLabel}
        />
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
