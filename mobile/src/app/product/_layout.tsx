import { Slot, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { useAuth } from '@/auth/auth-provider';
import { useVerification } from '@/verification/verification-provider';
import SellScreen from '../sell';

/** Deep links must observe the same server approval as the profile entry. */
export default function ProductManagementLayout() {
  const auth = useAuth();
  const { state, store } = useVerification();
  const owner = auth.session?.user.id;
  const seller = auth.account?.source === 'backend' && auth.account.role === 'SELLER' && !auth.accountError;
  useFocusEffect(useCallback(() => {
    if (seller && owner === state.owner) void store.refresh();
  }, [seller, owner, state.owner, store]));
  if (!owner || !seller || auth.accountChecking || state.owner !== owner || state.loadError
      || state.record?.status !== 'APPROVED') return <SellScreen />;
  // Reset drafts, selected images and open requests on an account change.
  return <Slot key={owner} />;
}
