import { Image } from 'expo-image';
import { useTheme } from '@/hooks/use-theme';

const icons = {
  home: require('@/assets/icons/home.svg'), orders: require('@/assets/icons/orders.svg'),
  sell: require('@/assets/icons/sell.svg'), profile: require('@/assets/icons/profile.svg'),
  search: require('@/assets/icons/search.svg'), back: require('@/assets/icons/back.svg'),
  image: require('@/assets/icons/image.svg'),
};
export function MarketplaceIcon({ name, color, size = 22 }: {
  name: keyof typeof icons; color?: string; size?: number;
}) {
  const theme = useTheme();
  return <Image source={icons[name]} style={{ width: size, height: size }}
    tintColor={color ?? theme.textSecondary} accessible={false} />;
}
