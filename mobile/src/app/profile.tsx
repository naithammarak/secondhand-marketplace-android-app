import { ProfileScreen } from '@/components/profile-screen';
import { BuyerProfileScreen } from '@/components/buyer-order-screens';
import { isBuyerOrdersMode } from '@/runtime/catalog-capability';
export default function ProfileRoute() { return isBuyerOrdersMode() ? <BuyerProfileScreen /> : <ProfileScreen />; }
