import type { LoginAdapter, LoginResult } from './login-controller';

type Dependencies = {
  platform: 'native' | 'web';
  redirectTo: string;
  signIn(options: { provider: 'google'; redirectTo: string; skipBrowserRedirect: boolean }): Promise<{ url?: string }>;
  openBrowser?: (url: string, redirectTo: string) => Promise<{ type: string; url?: string }>;
  processCallback(url: string, signal: AbortSignal): Promise<LoginResult>;
  dismissBrowser?(): void;
};

export function createGoogleLoginAdapter(dependencies: Dependencies): LoginAdapter {
  return {
    async run({ signal, processing }) {
      if (signal.aborted) return 'cancelled';
      const { url } = await dependencies.signIn({
        provider: 'google',
        redirectTo: dependencies.redirectTo,
        skipBrowserRedirect: dependencies.platform !== 'web',
      });
      if (!url || signal.aborted) return signal.aborted ? 'cancelled' : 'oauth-error';

      if (dependencies.platform === 'web') {
        processing();
        return 'success';
      }

      if (!dependencies.openBrowser) return 'oauth-error';

      const dismiss = () => dependencies.dismissBrowser?.();
      signal.addEventListener('abort', dismiss, { once: true });
      try {
        const result = await dependencies.openBrowser(url, dependencies.redirectTo);
        if (signal.aborted) return 'cancelled';
        if (result.type === 'cancel' || result.type === 'dismiss') return 'cancelled';
        if (result.type !== 'success' || !result.url) return 'oauth-error';
        processing();
        return await dependencies.processCallback(result.url, signal);
      } finally {
        signal.removeEventListener('abort', dismiss);
      }
    },
  };
}
