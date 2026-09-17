export type LoginResult = 'success' | 'cancelled' | 'oauth-error' | 'backend-error'
  | 'unauthorized' | 'forbidden' | 'network-error' | 'server-error';
export type LoginState = 'ready' | 'unavailable' | 'waiting' | 'processing' | LoginResult;

/** Boundary only; no OAuth flow selected. Real adapters must stop side effects on
 * abort before retry, validate/deduplicate callbacks, and require BE mapping for
 * success. Never expose tokens, callback URLs or raw exceptions through UI state. */
export interface LoginAdapter {
  run(context: { signal: AbortSignal; processing: () => void }): Promise<LoginResult>;
}

export function createLoginController(adapter?: LoginAdapter) {
  let state: LoginState = 'ready';
  let active: AbortController | undefined;
  const listeners = new Set<() => void>();
  const set = (next: LoginState) => {
    state = next;
    listeners.forEach(listener => listener());
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    async start() {
      if (active || state === 'success') return;
      if (!adapter) { set('unavailable'); return; }
      const attempt = new AbortController();
      active = attempt;
      set('waiting');
      try {
        const result = await adapter.run({
          signal: attempt.signal,
          processing: () => { if (active === attempt) set('processing'); },
        });
        if (active === attempt) { active = undefined; set(result); }
      } catch {
        if (active === attempt) {
          active = undefined;
          set(state === 'processing' ? 'backend-error' : 'oauth-error');
        }
      }
    },
    cancel() {
      if (!active) return;
      const attempt = active;
      active = undefined;
      attempt.abort();
      set('cancelled');
    },
    reset() {
      if (active) {
        const attempt = active;
        active = undefined;
        attempt.abort();
      }
      if (state !== 'ready') set('ready');
    },
  };
}
