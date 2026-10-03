/**
 * UI2-00 single shipping/delivery/recipient/Admin client (PR130 accepted API).
 * Same conventions as inspection-service: Bearer token per call, `{detail:{code,fields}}`
 * errors, timeout vs network distinction. Mutations require a caller-held
 * Idempotency-Key that stays the same while retrying the same canonical body.
 */
import {
  CARRIER_MAX, DELIVERY_CASE_REF, EVENT_ID, IDEMPOTENCY_KEY, REASON_MAX, REASON_MIN, RETURN_CASE_REF,
  type AddressDto, type AdminConfirmReturnInput, type AdminOrderShipments, type AdminOrdersPage, type CarrierInput, type CommandResult, type DeliveryCasesPage,
  type DeliveryReviewResult, type DeliveryView, type FulfillmentResult, type HistoryPage, type ReceiptResult,
  type ReportResult, type ResolveDeliveryInput, type ResolveDeliveryResult, type ReturnAddressView, type ReturnReceiptResult,
  type ReturnReviewResult, type SaveReturnAddressResult, type ShippingEventInput, type ShippingEventResult,
} from '../fulfillment/contract.ts';

export class FulfillmentServiceError extends Error {
  /** HTTP status; 0 means no committed answer was received (network/timeout). */
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string>;
  constructor(status: number, code: string, fields: Record<string, string> = {}) {
    super(code);
    this.name = 'FulfillmentServiceError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
  /** True when the outcome is unknown and the same key must be retried after a refetch. */
  get uncertain() { return this.status === 0 || this.status >= 500; }
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

const invalid = (fields: Record<string, string>) => new FulfillmentServiceError(422, 'validation_error', fields);
const length = (value: string) => [...value].length;

function cleanText(value: string, field: string, min: number, max: number, fields: Record<string, string>) {
  const text = value.trim();
  if (length(text) < min || length(text) > max || text.includes('\u0000')) fields[field] = `${min}–${max} characters required`;
  return text;
}
function reason(value: string) {
  const fields: Record<string, string> = {};
  const text = cleanText(value, 'reason', REASON_MIN, REASON_MAX, fields);
  if (Object.keys(fields).length) throw invalid(fields);
  return text;
}
function refs(values: string[], pattern: RegExp, min: number) {
  const unique = [...new Set(values.map(value => value.trim()))].sort();
  if (unique.length !== values.length || unique.length < min || unique.length > 10 || unique.some(ref => !pattern.test(ref))) {
    throw invalid({ evidence_refs: `${min}–10 distinct references issued by the server` });
  }
  return unique;
}
function key(value: string) {
  if (!IDEMPOTENCY_KEY.test(value)) throw invalid({ 'Idempotency-Key': '8–100 characters A-Z a-z 0-9 - _' });
  return value;
}

/** Canonical carrier body: trimmed 1–100, otherwise unchanged (no case or format normalization). */
export function carrierBody(input: CarrierInput): CarrierInput {
  const fields: Record<string, string> = {};
  const carrier = cleanText(input.carrier, 'carrier', 1, CARRIER_MAX, fields);
  const tracking = cleanText(input.tracking_number, 'tracking_number', 1, CARRIER_MAX, fields);
  if (Object.keys(fields).length) throw invalid(fields);
  return { carrier, tracking_number: tracking };
}

export function createFulfillmentService(options: { baseUrl?: string; fetch?: FetchLike; timeoutMs?: number }) {
  let origin: string | null = null;
  if (options.baseUrl) {
    const parsed = new URL(options.baseUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Invalid API origin');
    origin = parsed.origin;
  }
  const fetcher = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 20_000;

  async function send<T>(token: string, path: string, init: RequestInit & { idempotencyKey?: string } = {}, signal?: AbortSignal): Promise<CommandResult<T>> {
    if (!origin) throw new FulfillmentServiceError(503, 'api_unavailable');
    if (!token) throw new FulfillmentServiceError(401, 'unauthorized');
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort);
    const aborted = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
    aborted.catch(() => {});
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, ...(init.headers as Record<string, string> | undefined) };
    if (init.body !== undefined) headers['Content-Type'] = 'application/json';
    if (init.idempotencyKey) headers['Idempotency-Key'] = init.idempotencyKey;
    let response: Response;
    let body: unknown = null;
    try {
      response = await Promise.race([fetcher(`${origin}${path}`, { method: init.method ?? 'GET', headers, body: init.body, cache: 'no-store', signal: controller.signal }), aborted]);
      body = await Promise.race([response.json().catch(() => null), aborted]);
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new FulfillmentServiceError(0, timedOut ? 'timeout' : 'network_error');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
    if (timedOut) throw new FulfillmentServiceError(0, 'timeout');
    if (!response.ok) {
      const detail = typeof body === 'object' && body !== null ? (body as { detail?: unknown }).detail : null;
      const data = typeof detail === 'object' && detail !== null && !Array.isArray(detail) ? detail as Record<string, unknown> : {};
      const fields = typeof data.fields === 'object' && data.fields !== null ? data.fields as Record<string, string> : {};
      throw new FulfillmentServiceError(response.status, typeof data.code === 'string' ? data.code : Array.isArray(detail) ? 'validation_error' : 'request_failed', fields);
    }
    if (typeof body !== 'object' || body === null) throw new FulfillmentServiceError(502, 'invalid_response');
    return { result: body as T, replayed: response.headers.get('Idempotent-Replayed') === 'true' };
  }
  const read = async <T>(token: string, path: string, signal?: AbortSignal) => (await send<T>(token, path, {}, signal)).result;
  const post = <T>(token: string, path: string, payload: unknown, idempotencyKey: string, method = 'POST') =>
    send<T>(token, path, { method, body: JSON.stringify(payload), idempotencyKey: key(idempotencyKey) });
  const id = (value: number) => encodeURIComponent(String(value));

  return {
    // ---- Owning Buyer / Seller reads ----
    getDelivery: async (token: string, orderId: number, signal?: AbortSignal) => read<DeliveryView>(token, `/orders/${id(orderId)}/delivery`, signal),
    getHistory: async (token: string, orderId: number, page: { limit?: number; offset?: number } = {}, signal?: AbortSignal) =>
      read<HistoryPage>(token, `/orders/${id(orderId)}/history?limit=${page.limit ?? 100}&offset=${page.offset ?? 0}`, signal),
    // ---- Seller ----
    getReturnAddress: async (token: string, orderId: number, signal?: AbortSignal) => read<ReturnAddressView>(token, `/orders/${id(orderId)}/return-address`, signal),
    saveReturnAddress: async (token: string, orderId: number, address: AddressDto, idempotencyKey: string) =>
      post<SaveReturnAddressResult>(token, `/orders/${id(orderId)}/return-address`, address, idempotencyKey, 'PUT'),
    confirmReturn: async (token: string, orderId: number, idempotencyKey: string) =>
      post<ReturnReceiptResult>(token, `/orders/${id(orderId)}/confirm-return`, {}, idempotencyKey),
    // ---- Buyer ----
    confirmReceipt: async (token: string, orderId: number, idempotencyKey: string) =>
      post<ReceiptResult>(token, `/orders/${id(orderId)}/confirm-receipt`, {}, idempotencyKey),
    reportNotReceived: async (token: string, orderId: number, text: string, idempotencyKey: string) =>
      post<ReportResult>(token, `/orders/${id(orderId)}/report-not-received`, { reason: reason(text) }, idempotencyKey),
    // ---- Inspector ----
    createFulfillment: async (token: string, orderId: number, input: CarrierInput, idempotencyKey: string) =>
      post<FulfillmentResult>(token, `/orders/${id(orderId)}/fulfillment`, carrierBody(input), idempotencyKey),
    // ---- Admin (config-gated demo transport event; never a recipient receipt) ----
    recordShippingEvent: async (token: string, shipmentId: number, input: ShippingEventInput, idempotencyKey: string) => {
      if (!EVENT_ID.test(input.event_id)) throw invalid({ event_id: '8–100 characters A-Z a-z 0-9 - _' });
      return post<ShippingEventResult>(token, `/admin/shipments/${id(shipmentId)}/shipping-events`, { leg: input.leg, event: 'DELIVERED', event_id: input.event_id }, idempotencyKey);
    },
    reviewReturn: async (token: string, orderId: number, text: string, idempotencyKey: string) =>
      post<ReturnReviewResult>(token, `/admin/orders/${id(orderId)}/return-review`, { reason: reason(text) }, idempotencyKey),
    confirmAdminReturn: async (token: string, orderId: number, input: AdminConfirmReturnInput, idempotencyKey: string) =>
      post<ReturnReceiptResult>(token, `/admin/orders/${id(orderId)}/confirm-return`,
        { reason: reason(input.reason), evidence_refs: refs(input.evidence_refs, RETURN_CASE_REF, 2) }, idempotencyKey),
    listAdminOrders: async (token: string, status: string, offset = 0, signal?: AbortSignal) =>
      read<AdminOrdersPage>(token, `/admin/orders?status=${encodeURIComponent(status)}&limit=20&offset=${offset}`, signal),
    getAdminOrder: async (token: string, orderId: number, signal?: AbortSignal) => read<AdminOrderShipments>(token, `/admin/orders/${id(orderId)}`, signal),
    listDeliveryCases: async (token: string, page: { limit?: number; offset?: number } = {}, signal?: AbortSignal) =>
      read<DeliveryCasesPage>(token, `/admin/delivery-cases?limit=${page.limit ?? 20}&offset=${page.offset ?? 0}`, signal),
    reviewDelivery: async (token: string, orderId: number, text: string, idempotencyKey: string) =>
      post<DeliveryReviewResult>(token, `/admin/orders/${id(orderId)}/delivery-review`, { reason: reason(text) }, idempotencyKey),
    resolveDelivery: async (token: string, orderId: number, input: ResolveDeliveryInput, idempotencyKey: string) => {
      if (input.resolution !== 'RELEASE' && input.resolution !== 'REFUND') throw invalid({ resolution: 'RELEASE or REFUND' });
      return post<ResolveDeliveryResult>(token, `/admin/orders/${id(orderId)}/resolve-delivery`,
        { resolution: input.resolution, reason: reason(input.reason), evidence_refs: refs(input.evidence_refs, DELIVERY_CASE_REF, 1) }, idempotencyKey);
    },
  };
}

export type FulfillmentService = ReturnType<typeof createFulfillmentService>;
