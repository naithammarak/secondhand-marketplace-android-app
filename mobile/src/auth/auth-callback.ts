export const AUTH_SCHEME = 'secondhandmarketplace';
export const AUTH_HOST = 'auth';
export const AUTH_PATH = '/callback';

export type ParsedAuthCallback =
  | { accessToken: string; refreshToken: string }
  | { error: 'oauth-error' };

export function parseAuthCallback(value: string): ParsedAuthCallback | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== `${AUTH_SCHEME}:` || url.hostname !== AUTH_HOST || url.pathname !== AUTH_PATH) {
    return null;
  }

  const query = url.searchParams;
  const fragment = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : '');
  if (query.has('error') || query.has('error_code') || fragment.has('error') || fragment.has('error_code')) {
    return { error: 'oauth-error' };
  }
  const params = url.hash ? fragment : query;
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) return { error: 'oauth-error' };
  return { accessToken, refreshToken };
}
