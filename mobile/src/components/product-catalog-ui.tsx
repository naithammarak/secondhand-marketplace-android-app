import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

const PLACEHOLDER_COLOR = '#eef3f9';

type ProductImageProps = {
  uri: string | null | undefined;
  width?: number;
  height?: number;
  borderRadius?: number;
  accessibilityLabel?: string;
};

/** แสดง placeholder เมื่อไม่มีรูปหรือรูปโหลดไม่สำเร็จ (onError) แต่ละ instance มี state ความล้มเหลวของตัวเอง */
export function ProductImage({ uri, width = 72, height = 72, borderRadius = 12, accessibilityLabel }: ProductImageProps) {
  const [failed, setFailed] = useState(false);
  const showPlaceholder = !uri || failed;

  return (
    <View style={[styles.frame, { width, height, borderRadius }]}>
      {showPlaceholder ? (
        <Text style={styles.placeholderIcon} accessibilityLabel={accessibilityLabel ?? 'ไม่มีรูปสินค้า'}>🖼</Text>
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
    backgroundColor: PLACEHOLDER_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  placeholderIcon: { fontSize: 24, color: '#9aa3af' },
});
