import AsyncStorage from '@react-native-async-storage/async-storage';
import { createMarketplaceReturn } from './marketplace-return';
export const marketplaceReturn = createMarketplaceReturn(AsyncStorage);
