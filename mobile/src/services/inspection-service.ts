/** INSPECT-02/03 API client. Private image URLs require a Bearer token. */

import type { OrderStatus } from './order-service';
import type { FulfillmentPolicy, ShipmentLeg } from '../fulfillment/contract';

export type InspectionResult = 'PASS' | 'MINOR_ISSUE' | 'NOT_AS_DESCRIBED' | 'FAKE';
export type EvidenceFile = { uri: string; name: string; type: string; size?: number; file?: unknown };
export type Evidence = { id: number; mime_type: string; size_bytes: number; url: string; expires_at?: string | null };
export type CertificateStatus = 'ISSUED' | 'REVOKED';
export type Certificate = { certificate_no: string; public_url: string; issued_at: string; status: CertificateStatus };
export type AdminCertificate = Certificate & {
  id: number; result: 'PASS' | 'MINOR_ISSUE'; revoked_at: string | null; can_revoke: boolean;
};
export type AdminCertificatesPage = { items: AdminCertificate[]; next_before_id: number | null };
export type BuyerDecision = 'CONFIRM' | 'REJECT';
export type BuyerDecisionRecord = { decision: BuyerDecision; reason: string | null; decided_at: string };
export type CourierShipmentScope = 'pending' | 'history' | 'all';
export type Progress = {
  order_id: number; order_status: OrderStatus;
  shipment: { carrier: string; tracking_number: string; shipped_at: string; courier_delivered_at: string | null; received_at: string | null } | null;
  inspection: { status: OrderStatus; started_at: string | null; inspected_at: string | null } | null;
};
export type WorkDetail = {
  id: number; order_id: number; order_status: OrderStatus;
  product: { id: number; name: string; condition: string; size: string };
  shipment: Progress['shipment']; inspector_id: number | null;
  started_at: string | null; result: InspectionResult | null;
  summary: string | null; inspected_at: string | null;
  evidence: Evidence[]; certificate: Certificate | null;
  next_action: 'WAIT_BUYER_DECISION' | 'RETURN_TO_SELLER' | 'SHIP_TO_BUYER' | null;
} & ResultWindow & {
  /** Inspector projection (PR130). Optional so older fixtures stay valid. */
  inspection_overdue_escalated_at?: string | null;
  buyer_decision?: { decision: BuyerDecision; decided_at: string } | null;
  fulfillment?: { id: number; leg: ShipmentLeg; status: string } | null;
  can_create_fulfillment?: boolean;
};
/**
 * Positive result window (EXTERNAL_V2): availability + 72h, server clock. Null for
 * negative/legacy. At the deadline `can_decide` turns false before a worker records
 * `result_timed_out_at`; never fabricate a timeout or decision locally.
 */
export type ResultWindow = {
  fulfillment_policy?: FulfillmentPolicy;
  result_available_at?: string | null;
  result_decision_deadline_at?: string | null;
  result_timed_out_at?: string | null;
};
export type BuyerResult = Pick<WorkDetail, 'order_id' | 'order_status' | 'result' | 'summary' | 'inspected_at' | 'evidence' | 'certificate' | 'next_action'> & ResultWindow & {
  decision: BuyerDecisionRecord | null; can_decide: boolean;
  /** Server clock at read time; use only to correct an informative countdown. */
  server_time?: string;
};

export type CourierShipment = { id: number; order_id: number; status: string; courier_delivered_at: string | null; proofs: Evidence[] };
export type CourierShipmentsPage = {
  items: CourierShipment[]; scope: CourierShipmentScope; offset: number; limit: number;
  has_more: boolean; next_offset: number | null;
};
export type AdminInboundOrder = { id: number; product: { name: string }; status: OrderStatus };

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

  const request = async <T>(token: string | null, path: string, init: RequestInit = {}, timeoutMs = options.timeoutMs ?? 20_000, publicRead = false): Promise<T> => {
    if (!origin) throw new InspectionServiceError(503, 'api_unavailable');
    if (!token && !publicRead) throw new InspectionServiceError(401, 'unauthorized');
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
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
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
    couriers: (token: string, offset = 0) => request<{ items: { id: number; name: string }[]; total: number }>(token, `/admin/couriers?limit=20&offset=${offset}`),
    publicCertificate: (publicToken: string) => request<{ certificate_no: string; result: InspectionResult; issued_at: string; status: CertificateStatus }>(null,
      `/certificates/${encodeURIComponent(publicToken)}/json`, { cache: 'no-store' }, options.timeoutMs ?? 20_000, true),
    adminCertificates: (token: string, beforeId?: number) => request<AdminCertificatesPage>(token,
      `/admin/certificates?limit=20${beforeId === undefined ? '' : `&before_id=${beforeId}`}`, { cache: 'no-store' }),
    adminCertificate: (token: string, id: number) => request<AdminCertificate>(token, `/admin/certificates/${id}`, { cache: 'no-store' }),
    revokeCertificate: (token: string, id: number, reason: string, key: string) => request<AdminCertificate>(token,
      `/admin/certificates/${id}/revoke`, json({ reason }, key)),
    adminOrders: (token: string, offset = 0) => request<{ items: AdminInboundOrder[]; total: number }>(token, `/admin/orders?status=SHIPPING_TO_CENTER&limit=20&offset=${offset}`),
    assignCourier: (token: string, orderId: number, courierId: number, key: string) => request<{ shipment_id: number; courier_id: number }>(token, `/admin/orders/${orderId}/assign-courier`, json({ courier_id: courierId }, key)),
    courierShipments: async (token: string, scope: CourierShipmentScope = 'pending'): Promise<CourierShipmentsPage> => {
      const items: CourierShipment[] = [];
      const seen = new Set<number>();
      let offset = 0;
      for (;;) {
        const page = await request<CourierShipmentsPage>(token,
          `/courier/shipments?scope=${scope}&offset=${offset}&limit=100`);
        if (page.scope !== scope || page.offset !== offset || !Array.isArray(page.items) || !Number.isInteger(page.limit) || page.limit < 1) {
          throw new InspectionServiceError(502, 'invalid_pagination');
        }
        for (const item of page.items) if (!seen.has(item.id)) { items.push(item); seen.add(item.id); }
        if (page.next_offset === null) return { ...page, items, offset: 0, has_more: false, next_offset: null };
        if (!page.has_more || !Number.isInteger(page.next_offset) || page.next_offset <= offset) {
          throw new InspectionServiceError(502, 'invalid_pagination');
        }
        offset = page.next_offset;
      }
    },
    confirmDelivery: (token: string, id: number, key: string, proofIds: number[]) => request<{ shipment_id: number; courier_delivered_at: string }>(token, `/courier/shipments/${id}/confirm-delivery`, json({ proof_ids: [...proofIds].sort((a, b) => a - b) }, key)),
    uploadProof: (token: string, id: number, file: EvidenceFile, key: string) => {
      const form = new FormData();
      form.append('file', (file.file ?? { uri: file.uri, name: file.name, type: file.type }) as Blob);
      return request<{ proof: Evidence }>(token, `/courier/shipments/${id}/proofs`, { method: 'POST', headers: { 'Idempotency-Key': key }, body: form }, 60_000);
    },
    getProgress: (token: string, orderId: number) => request<Progress>(token, `/orders/${orderId}/inspection-progress`),
    ship: (token: string, orderId: number, input: { carrier: string; tracking_number: string }, key: string) =>
      request<Progress>(token, `/orders/${orderId}/ship-to-center`, json(input, key)),
    getBuyerResult: (token: string, orderId: number) => request<BuyerResult>(token, `/orders/${orderId}/inspection`),
    decideBuyerInspection: (token: string, orderId: number, payload: { decision: BuyerDecision; reason?: string | null }) =>
      request<{ decision: BuyerDecisionRecord; next_action: 'SHIP_TO_BUYER' | 'RETURN_TO_SELLER' }>(token,
        `/orders/${orderId}/inspection/decision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
    list: (token: string, offset = 0, status?: OrderStatus) => request<{ items: WorkDetail[]; total: number; limit: number; offset: number }>(
      token, `/inspections?limit=20&offset=${offset}${status ? `&status=${encodeURIComponent(status)}` : ''}`),
    detail: (token: string, id: number) => request<WorkDetail>(token, `/inspections/${id}`),
    receive: (token: string, id: number, note: string | null, key: string) =>
      request<WorkDetail>(token, `/inspections/${id}/receive`, json(note?.trim() ? { note: note.trim() } : {}, key)),
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
      if (!origin || !/^\/(inspection-evidence|shipment-delivery-proofs)\/\d+$/.test(evidence.url)) throw new InspectionServiceError(500, 'invalid_evidence_url');
      return { uri: `${origin}${evidence.url}`, headers: { Authorization: `Bearer ${token}` } };
    },
  };
}

export type InspectionService = ReturnType<typeof createInspectionService>;
