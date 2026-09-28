/**
 * ทางเข้า Checkout ชั่วคราวสำหรับทดสอบด้วยรหัสสินค้าตรง ๆ (Decision Log D-16)
 *
 * ทางเข้าหลักคือปุ่ม "ซื้อสินค้านี้" ในหน้ารายละเอียดสินค้า หน้านี้จึงอยู่หลัง Feature Flag
 * ที่ปิดเป็นค่าตั้งต้น (ดู src/orders/order-runtime.ts) และไม่นับว่าปิดงาน ORDER-04
 * เมื่อเลิกใช้ ให้ลบไฟล์นี้ route buy-by-product-id และ flag พร้อมกัน
 */
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-provider';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Screen, styles } from '@/components/order-ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isDirectProductIdEntryEnabled } from '@/orders/order-runtime';
import { parseRouteId } from '@/orders/route-params';

export function BuyByProductIdScreen() {
  const auth = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  // ปิดสนิทเมื่อ flag ปิด: เข้ามาทาง deep link ตรง ๆ ก็ต้องไม่เห็นหน้านี้
  if (!isDirectProductIdEntryEnabled()) return <Redirect href="/" />;
  if (!auth.session) return <Redirect href="/login" />;

  const open = () => {
    const productId = parseRouteId(value.trim());
    if (productId === null) {
      setError('กรุณากรอกรหัสสินค้าเป็นตัวเลข');
      return;
    }
    setError('');
    router.push({ pathname: '/checkout/[productId]', params: { productId: String(productId) } });
  };

  return (
    <Screen>
      <SafeAreaView style={[styles.content, { alignSelf: 'center', padding: Spacing.three }]}>
        <ThemedText type="subtitle">ซื้อด้วยรหัสสินค้า</ThemedText>
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            ทางเข้าชั่วคราวสำหรับทดสอบ จนกว่าหน้ารายละเอียดสินค้าจะพร้อม
          </ThemedText>
          <View style={styles.field}>
            <ThemedText type="smallBold">รหัสสินค้า</ThemedText>
            <TextInput
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: error ? theme.danger : theme.border }]}
              value={value}
              onChangeText={text => { setValue(text); setError(''); }}
              keyboardType="number-pad"
              placeholder="เช่น 12"
              placeholderTextColor={theme.textSecondary}
              accessibilityLabel="รหัสสินค้า"
            />
            {error ? <ThemedText type="small" style={styles.errorText}>{error}</ThemedText> : null}
          </View>
          <Button label="ไปหน้ายืนยันการสั่งซื้อ" variant="primary" onPress={open} />
        </Card>
        <Button label="กลับ" onPress={() => router.back()} />
      </SafeAreaView>
    </Screen>
  );
}
