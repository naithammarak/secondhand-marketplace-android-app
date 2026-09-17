export type AccountRole = 'BUYER' | 'SELLER' | 'ADMIN' | 'INSPECTOR' | null;
export type MeResult = { role: AccountRole; source: 'backend' | 'mock' };
export type MeErrorKind = 'unauthorized' | 'forbidden' | 'network-error' | 'server-error';

export class MeServiceError extends Error {
  readonly kind: MeErrorKind;

  constructor(kind: MeErrorKind) {
    super(kind);
    this.name = 'MeServiceError';
    this.kind = kind;
  }
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export function createMeService(options: { baseUrl?: string; fetch?: FetchLike }) {
  let baseUrl: string | undefined;
  if (options.baseUrl) {
    const parsed = new URL(options.baseUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Invalid API origin');
    baseUrl = parsed.origin;
  }
  const fetcher = options.fetch ?? fetch;
  return {
    async getMe(accessToken: string, signal?: AbortSignal): Promise<MeResult> {
      if (!baseUrl) return { role: null, source: 'mock' };
      const headers = { Authorization: `Bearer ${accessToken}` };
      const request = async (path: string, init: RequestInit): Promise<Response> => {
        let response: Response;
        try {
          response = await fetcher(`${baseUrl}${path}`, { ...init, signal });
        } catch (error) {
          if (signal?.aborted) throw error;
          throw new MeServiceError('network-error');
        }
        if (response.status === 401) throw new MeServiceError('unauthorized');
        if (response.status === 403) throw new MeServiceError('forbidden');
        if (!response.ok) throw new MeServiceError('server-error');
        return response;
      };

      // หลัง Google Login ให้ backend สร้างหรืออ่านบัญชีก่อนดึงข้อมูลผู้ใช้
      await request('/auth/google', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: '{}',
      });
      const response = await request('/auth/me', { method: 'GET', headers });
      const data = await response.json() as { role?: AccountRole };
      return { role: data.role ?? null, source: 'backend' };
    },
  };
}
