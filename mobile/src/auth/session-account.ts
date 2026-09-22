import type { MeResult } from '../services/me-service';

type UnauthorizedError = Error & { kind?: string };

export async function withTokenRefresh<T>(options: {
  accessToken: string;
  request(token: string): Promise<T>;
  refresh(): Promise<{ accessToken: string } | null>;
}): Promise<T> {
  try {
    return await options.request(options.accessToken);
  } catch (error) {
    if ((error as UnauthorizedError).kind !== 'unauthorized') throw error;
  }
  const refreshed = await options.refresh();
  if (!refreshed) {
    const error = new Error('unauthorized') as UnauthorizedError;
    error.kind = 'unauthorized';
    throw error;
  }
  return options.request(refreshed.accessToken);
}

export function verifyAccountWithRefresh(options: {
  accessToken: string;
  getMe(token: string): Promise<MeResult>;
  refresh(): Promise<{ accessToken: string } | null>;
}): Promise<MeResult> {
  return withTokenRefresh({
    accessToken: options.accessToken,
    request: options.getMe,
    refresh: options.refresh,
  });
}
