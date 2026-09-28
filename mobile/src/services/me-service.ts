export type AccountRole = 'BUYER' | 'SELLER' | 'ADMIN' | 'INSPECTOR' | 'COURIER' | null;
export type SelectableRole = 'BUYER' | 'SELLER';
export type MeResult = { fullName: string | null; role: AccountRole; source: 'backend' | 'mock' };
export type MeErrorKind = 'unauthorized' | 'forbidden' | 'conflict' | 'validation-error'
  | 'not-configured' | 'network-error' | 'server-error';

export class MeServiceError extends Error {
  readonly kind: MeErrorKind;

  constructor(kind: MeErrorKind) {
    super(kind);
    this.name = 'MeServiceError';
    this.kind = kind;
  }
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

function accountFromResponse(data: { full_name?: unknown; role?: unknown }): MeResult {
  const supportedRoles: AccountRole[] = ['BUYER', 'SELLER', 'ADMIN', 'INSPECTOR', 'COURIER', null];
  const role = supportedRoles.includes(data.role as AccountRole) ? data.role as AccountRole : null;
  return {
    fullName: typeof data.full_name === 'string' && data.full_name.trim() ? data.full_name : null,
    role,
    source: 'backend',
  };
}

export function createMeService(options: { baseUrl?: string; fetch?: FetchLike }) {
  let baseUrl: string | undefined;
  if (options.baseUrl) {
    const parsed = new URL(options.baseUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Invalid API origin');
    baseUrl = parsed.origin;
  }
  const fetcher = options.fetch ?? fetch;
  const request = async (path: string, init: RequestInit, signal?: AbortSignal): Promise<Response> => {
    let response: Response;
    try {
      response = await fetcher(`${baseUrl}${path}`, { ...init, signal });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new MeServiceError('network-error');
    }
    if (response.status === 401) throw new MeServiceError('unauthorized');
    if (response.status === 403) throw new MeServiceError('forbidden');
    if (response.status === 409) throw new MeServiceError('conflict');
    if (response.status === 422) throw new MeServiceError('validation-error');
    if (!response.ok) throw new MeServiceError('server-error');
    return response;
  };

  return {
    async getMe(accessToken: string, signal?: AbortSignal): Promise<MeResult> {
      if (!baseUrl) return { fullName: null, role: null, source: 'mock' };
      const headers = { Authorization: `Bearer ${accessToken}` };

      // หลัง Google Login ให้ backend สร้างหรืออ่านบัญชีก่อนดึงข้อมูลผู้ใช้
      await request('/auth/google', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: '{}',
      }, signal);
      const response = await request('/auth/me', { method: 'GET', headers }, signal);
      return accountFromResponse(await response.json());
    },

    async setRole(accessToken: string, role: SelectableRole, signal?: AbortSignal): Promise<MeResult> {
      if (!baseUrl) throw new MeServiceError('not-configured');
      const response = await request('/auth/role', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      }, signal);
      return accountFromResponse(await response.json());
    },
  };
}
