import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/auth/auth-provider';
import { getSupabaseClient } from '@/auth/supabase-client';
import { withTokenRefresh } from '@/auth/session-account';
import { createProfileService, type Profile } from '@/services/profile-service';

export function useProfile() {
  const auth = useAuth();
  const owner = auth.session?.user.id ?? null;
  const service = useMemo(() => createProfileService({ baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL }), []);
  const identity = useRef(owner);
  identity.current = owner;
  const epoch = useRef(0);
  const flight = useRef<AbortController | null>(null);
  const [state, setState] = useState<{ owner: string | null; profile: Profile | null; busy: boolean; error: string | null }>(
    { owner: null, profile: null, busy: false, error: null });

  const run = useCallback(async (action: 'get' | 'save' | 'acknowledge', name?: string) => {
    if (!owner || flight.current) return false;
    const controller = new AbortController();
    flight.current = controller;
    const generation = epoch.current;
    const current = () => !controller.signal.aborted && identity.current === owner && epoch.current === generation;
    setState(old => ({ owner, profile: old.owner === owner ? old.profile : null, busy: true, error: null }));
    try {
      const supabase = getSupabaseClient();
      const session = (await supabase?.auth.getSession())?.data.session;
      if (!current() || session?.user.id !== owner) throw new Error('account_changed');
      const profile = await withTokenRefresh({ accessToken: session.access_token,
        request: token => {
          if (!current()) throw new Error('account_changed');
          return action === 'save' ? service.save(token, name!, controller.signal)
            : service[action](token, controller.signal);
        },
        refresh: async () => {
          const refreshed = await supabase!.auth.refreshSession();
          return current() && !refreshed.error && refreshed.data.session?.user.id === owner
            ? { accessToken: refreshed.data.session.access_token } : null;
        },
      });
      if (!current()) return false;
      setState({ owner, profile, busy: false, error: null });
      return true;
    } catch {
      if (current()) setState(old => ({ ...old, busy: false, error: 'บันทึกหรือโหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่' }));
      return false;
    } finally {
      if (flight.current === controller) flight.current = null;
    }
  }, [owner, service]);

  useEffect(() => {
    epoch.current += 1;
    flight.current?.abort(); flight.current = null;
    setState({ owner, profile: null, busy: !!owner, error: null });
    if (owner) void run('get');
    return () => { epoch.current += 1; flight.current?.abort(); flight.current = null; };
  }, [owner, run]);

  return { profile: state.owner === owner ? state.profile : null, busy: state.owner !== owner || state.busy,
    error: state.owner === owner ? state.error : null, reload: () => run('get'),
    save: (name: string) => run('save', name), acknowledge: () => run('acknowledge') };
}
