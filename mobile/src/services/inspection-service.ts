/** INSPECT-02/03 API client. Private image URLs require a Bearer token. */

import type { OrderStatus } from './order-service';

export type InspectionResult = 'PASS' | 'MINOR_ISSUE' | 'NOT_AS_DESCRIBED' | 'FAKE';
export type EvidenceFile = { uri: string; name: string; type: string; size?: number; file?: unknown };
export type Evidence = { id: number; mime_type: string; size_bytes: number; url: string; expires_at?: string | null };
export type Certificate = { certificate_no: string; public_url: string };
export type Progress = {
  order_id: number; order_status: OrderStatus;
  shipment: { carrier: string; tracking_number: string; shipped_at: string; received_at: string | null } | null;
  inspection: { status: OrderStatus; started_at: string | null; inspected_at: string | null } | null;
};
export type WorkDetail = {
  id: number; order_id: number; order_status: OrderStatus;
  product: { id: number; name: string; condition: string; size: string };
  shipment: Progress['shipment']; inspector_id: number | null;
  started_at: string | null; result: InspectionResult | null;
  summary: string | null; inspected_at: string | null;
  evidence: Evidence[]; certificate: Certificate | null;
  next_action: 'WAIT_BUYER_DECISION' | 'RETURN_TO_SELLER' | null;
};
export type BuyerResult = Pick<WorkDetail, 'order_id' | 'order_status' | 'result' | 'summary' | 'inspected_at' | 'evidence' | 'certificate' | 'next_action'>;

export class InspectionServiceError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string>;
  constructor(status: number, code: string, fields: Record<string, string> = {}) {
    super(code);
    this.name = 'InspectionServiceError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export function createInspectionService(options: { baseUrl?: string; fetch?: FetchLike; timeoutMs?: number }) {
  const origin = options.baseUrl ? new URL(options.baseUrl).origin : null;
  if (origin && !/^https?:/.test(origin)) throw new Error('Invalid API origin');
  const fetcher = options.fetch ?? fetch;

  const request = async <T>(token: string | null, path: string, init: RequestInit = {}, timeoutMs = options.timeoutMs ?? 20_000): Promise<T> => {
    if (!origin) throw new InspectionServiceError(503, 'api_unavailable');
    if (!token) throw new InspectionServiceError(401, 'unauthorized');
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const aborted = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
    aborted.catch(() => {});
    let response: Response;
    let body: unknown;
    try {
      response = await Promise.race([fetcher(`${origin}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, ...init.headers },
        signal: controller.signal,
      }), aborted]);
      body = await Promise.race([response.json(), aborted]);
    } catch {
      throw new InspectionServiceError(0, timedOut ? 'timeout' : 'network_error');
    } finally {
      clearTimeout(timer);
    }
    if (timedOut) throw new InspectionServiceError(0, 'timeout');
    if (!response.ok) {
      const detail = typeof body === 'object' && body !== null && 'detail' in body ? (body as { detail: unknown }).detail : null;
      const data = typeof detail === 'object' && detail !== null ? detail as Record<string, unknown> : {};
      throw new InspectionServiceError(response.status, typeof data.code === 'string' ? data.code : 'request_failed',
        typeof data.fields === 'object' && data.fields !== null ? data.fields as Record<string, string> : {});
    }
    return body as T;
  };

  const json = (payload: unknown, key: string): RequestInit => ({
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify(payload),
  });

  return {
    getProgress: (token: string, orderId: number) => request<Progress>(token, `/orders/${orderId}/inspection-progress`),
    ship: (token: string, orderId: number, input: { carrier: string; tracking_number: string }, key: string) =>
      request<Progress>(token, `/orders/${orderId}/ship-to-center`, json(input, key)),
    getBuyerResult: (token: string, orderId: number) => request<BuyerResult>(token, `/orders/${orderId}/inspection`),
    list: (token: string, offset = 0, status?: OrderStatus) => request<{ items: WorkDetail[]; total: number; limit: number; offset: number }>(
      token, `/inspections?limit=20&offset=${offset}${status ? `&status=${encodeURIComponent(status)}` : ''}`),
    detail: (token: string, id: number) => request<WorkDetail>(token, `/inspections/${id}`),
    receive: (token: string, id: number, note: string | null, key: string) => request<WorkDetail>(token, `/inspections/${id}/receive`, json({ note }, key)),
    start: (token: string, id: number, key: string) => request<WorkDetail>(token, `/inspections/${id}/start`, json({}, key)),
    upload: (token: string, id: number, file: EvidenceFile, key: string) => {
      const form = new FormData();
      form.append('file', (file.file ?? { uri: file.uri, name: file.name, type: file.type }) as Blob);
      return request<{ evidence: { id: number; mime_type: string; size_bytes: number } }>(token,
        `/inspections/${id}/evidence`, { method: 'POST', headers: { 'Idempotency-Key': key }, body: form }, 60_000);
    },
    result: (token: string, id: number, payload: { result: InspectionResult; summary: string; evidence_ids: number[] }, key: string) =>
      request<WorkDetail>(token, `/inspections/${id}/result`, json(payload, key)),
    privateImageSource: (token: string, evidence: Evidence) => {
      if (!origin || !/^\/inspection-evidence\/\d+$/.test(evidence.url)) throw new InspectionServiceError(500, 'invalid_evidence_url');
      return { uri: `${origin}${evidence.url}`, headers: { Authorization: `Bearer ${token}` } };
    },
  };
}

export type InspectionService = ReturnType<typeof createInspectionService>;
