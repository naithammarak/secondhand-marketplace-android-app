import { router } from 'expo-router';
import { useAuth } from '@/auth/auth-provider';
import { Button } from './order-ui';

export function CatalogAccountButton() {
  const { session } = useAuth();
  return <Button label={session ? 'บัญชีของฉัน' : 'เข้าสู่ระบบ'}
    onPress={() => router.push(session ? '/profile' : '/login')} />;
}
