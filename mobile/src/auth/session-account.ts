import type { MeResult } from '../services/me-service';

type UnauthorizedError = Error & { kind?: string };

export async function verifyAccountWithRefresh(options: {
  accessToken: string;
  getMe(token: string): Promise<MeResult>;
  refresh(): Promise<{ accessToken: string } | null>;
}): Promise<MeResult> {
  try {
    return await options.getMe(options.accessToken);
  } catch (error) {
    if ((error as UnauthorizedError).kind !== 'unauthorized') throw error;
  }
  const refreshed = await options.refresh();
  if (!refreshed) {
    const error = new Error('unauthorized') as UnauthorizedError;
    error.kind = 'unauthorized';
    throw error;
  }
  return options.getMe(refreshed.accessToken);
}
