import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { marketplaceReturn } from '@/auth/marketplace-return-instance';
import type { MarketplaceDestination } from '@/auth/marketplace-return';
import { Button, Card, Loading, Screen } from './order-ui';
import { ThemedText } from './themed-text';

export function MarketplaceLoginRequired({ destination }: { destination: MarketplaceDestination }) {
  const [failed, setFailed] = useState(false);
  const key = JSON.stringify(destination);
  useEffect(() => {
    let active = true;
    void marketplaceReturn.save(JSON.parse(key)).then(() => {
      if (active) router.replace('/login');
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [key]);
  return <Screen>{failed ? <Card><ThemedText>เปิดหน้าเข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่</ThemedText>
    <Button label="กลับไปดูสินค้า" onPress={() => router.replace('/')} />
  </Card> : <Loading label="กรุณาเข้าสู่ระบบเพื่อดำเนินการต่อ" />}</Screen>;
}
