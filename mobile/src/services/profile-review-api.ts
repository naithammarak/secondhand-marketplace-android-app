export class ProfileReviewError extends Error {
  readonly kind: string;
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
    this.kind = status === 401 ? 'unauthorized' : code;
  }
}

/** Deadline covers both headers and body, including adapters which ignore abort. */
export function createPrivateApi(options: { baseUrl?: string; fetch?: typeof fetch; timeoutMs?: number }) {
  const origin = options.baseUrl?.replace(/\/+$/, '');
  if (origin && !/^https?:$/.test(new URL(origin).protocol)) throw new Error('Invalid API URL');
  return async <T>(path: string, token: string | null, init: RequestInit = {}, signal?: AbortSignal): Promise<T> => {
    if (!origin) throw new ProfileReviewError(503, 'api_unavailable');
    if (signal?.aborted) throw new ProfileReviewError(0, 'request_cancelled');
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const cancelled = new Promise<never>((_, reject) => {
      controller.signal.addEventListener('abort', () => reject(new ProfileReviewError(0, 'request_cancelled')), { once: true });
    });
    cancelled.catch(() => {});
    if (signal?.aborted) abort();
    const timer = setTimeout(abort, options.timeoutMs ?? 20_000);
    try {
      const response = await Promise.race([(options.fetch ?? fetch)(`${origin}${path}`, {
        ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
        signal: controller.signal,
      }), cancelled]);
      const body = await Promise.race([response.json(), cancelled]);
      if (!response.ok) throw new ProfileReviewError(response.status, body?.detail?.code ?? 'request_failed');
      return body as T;
    } catch (error) {
      if (error instanceof ProfileReviewError) throw error;
      throw new ProfileReviewError(0, 'network_error');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  };
}
