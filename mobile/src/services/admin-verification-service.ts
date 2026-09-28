import type { VerificationStatus } from './verification-service';

/** สถานะที่มีคำขอเก็บอยู่จริง จึงขอดูเป็นรายการได้ */
export type ReviewQueueStatus = Exclude<VerificationStatus, 'NOT_SUBMITTED'>;

export type ReviewDecision = 'APPROVED' | 'REJECTED';

export type ReviewRequest = {
  id: number;
  status: VerificationStatus;
  sellerId: number | null;
  sellerName: string;
  sellerEmail: string;
  shopName: string | null;
  bankName: string;
  bankAccountName: string;
  bankAccountLast4: string;
  submittedAt: string | null;
  rejectReason: string | null;
  reviewedAt: string | null;
  verifiedAt: string | null;
  reviewedByName: string | null;
  hasIdCardImage: boolean;
};

export type ReviewQueuePage = {
  items: ReviewRequest[];
  total: number;
  limit: number;
  offset: number;
};

export type IdCardEvidence = {
  url: string;
  /** อายุของลิงก์เป็นวินาที ใช้บอกผู้ดูแลว่าต้องเปิดดูภายในเวลาเท่าไร */
  expiresIn: number;
};

export type AdminVerificationErrorKind = 'unauthorized' | 'forbidden' | 'not-found' | 'conflict'
  | 'validation-error' | 'network-error' | 'server-error' | 'unavailable';

/** รายละเอียดของคำขอที่ถูกผู้ดูแลคนอื่นตรวจไปแล้ว */
export type AlreadyReviewed = {
  status: VerificationStatus | null;
  reviewedByName: string | null;
};

export class AdminVerificationServiceError extends Error {
  readonly kind: AdminVerificationErrorKind;
  readonly fields: Record<string, string>;
  readonly alreadyReviewed: AlreadyReviewed | null;

  constructor(
    kind: AdminVerificationErrorKind,
    options: { fields?: Record<string, string>; alreadyReviewed?: AlreadyReviewed | null } = {},
  ) {
    super(kind);
    this.name = 'AdminVerificationServiceError';
    this.kind = kind;
    this.fields = options.fields ?? {};
    this.alreadyReviewed = options.alreadyReviewed ?? null;
  }
}

const STATUSES: VerificationStatus[] = ['NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED'];

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readStatus(value: unknown): VerificationStatus | null {
  return STATUSES.find(known => known === value) ?? null;
}

function toRequest(payload: unknown): ReviewRequest {
  if (typeof payload !== 'object' || payload === null) throw new AdminVerificationServiceError('server-error');
  const data = payload as Record<string, unknown>;
  const status = readStatus(data.status);
  if (typeof data.id !== 'number' || !status) throw new AdminVerificationServiceError('server-error');
  return {
    id: data.id,
    status,
    sellerId: typeof data.seller_id === 'number' ? data.seller_id : null,
    sellerName: readString(data.seller_name) ?? '',
    sellerEmail: readString(data.seller_email) ?? '',
    shopName: readString(data.shop_name),
    bankName: readString(data.bank_name) ?? '',
    bankAccountName: readString(data.bank_account_name) ?? '',
    bankAccountLast4: readString(data.bank_account_last4) ?? '',
    submittedAt: readString(data.submitted_at),
    rejectReason: status === 'REJECTED' ? readString(data.reject_reason) : null,
    reviewedAt: readString(data.reviewed_at),
    verifiedAt: readString(data.verified_at),
    reviewedByName: readString(data.reviewed_by_name),
    hasIdCardImage: data.has_id_card_image === true,
  };
}

function toPage(payload: unknown): ReviewQueuePage {
  if (typeof payload !== 'object' || payload === null) throw new AdminVerificationServiceError('server-error');
  const data = payload as Record<string, unknown>;
  if (!Array.isArray(data.items)) throw new AdminVerificationServiceError('server-error');
  const items = data.items.map(toRequest);
  return {
    items,
    total: typeof data.total === 'number' ? data.total : items.length,
    limit: typeof data.limit === 'number' ? data.limit : items.length,
    offset: typeof data.offset === 'number' ? data.offset : 0,
  };
}

function toEvidence(payload: unknown): IdCardEvidence {
  if (typeof payload !== 'object' || payload === null) throw new AdminVerificationServiceError('server-error');
  const data = payload as Record<string, unknown>;
  const url = readString(data.url);
  // ลิงก์หลักฐานต้องมาจาก backend เป็น https เท่านั้น ไม่เปิดทางให้ scheme อื่น
  if (!url || !/^https:\/\//i.test(url)) throw new AdminVerificationServiceError('server-error');
  return {
    url,
    expiresIn: typeof data.expires_in === 'number' && data.expires_in > 0 ? data.expires_in : 0,
  };
}

function toFieldErrors(detail: unknown): Record<string, string> {
  if (typeof detail !== 'object' || detail === null) return {};
  const fields = (detail as Record<string, unknown>).fields;
  if (typeof fields !== 'object' || fields === null) return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields as Record<string, unknown>)) {
    if (typeof value === 'string' && value.length > 0 && value.length <= 200) result[key] = value;
  }
  return result;
}

function toAlreadyReviewed(detail: unknown): AlreadyReviewed | null {
  if (typeof detail !== 'object' || detail === null) return null;
  const data = detail as Record<string, unknown>;
  if (data.code !== 'already_reviewed') return null;
  return {
    status: readStatus(data.status),
    reviewedByName: readString(data.reviewed_by_name),
  };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function createAdminVerificationService(options: { baseUrl?: string; fetch?: FetchLike }) {
  let baseUrl: string | undefined;
  if (options.baseUrl) {
    const parsed = new URL(options.baseUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Invalid API origin');
    baseUrl = parsed.origin;
  }
  const fetcher = options.fetch ?? fetch;

  const request = async (path: string, init: RequestInit, signal?: AbortSignal): Promise<Response> => {
    if (!baseUrl) throw new AdminVerificationServiceError('unavailable');
    let response: Response;
    try {
      response = await fetcher(`${baseUrl}${path}`, { ...init, signal });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new AdminVerificationServiceError('network-error');
    }
    if (response.ok) return response;
    if (response.status === 401) throw new AdminVerificationServiceError('unauthorized');
    if (response.status === 403) throw new AdminVerificationServiceError('forbidden');
    if (response.status === 404) throw new AdminVerificationServiceError('not-found');
    if (response.status === 409) {
      const body = await readJson(response) as { detail?: unknown } | null;
      throw new AdminVerificationServiceError('conflict', {
        alreadyReviewed: toAlreadyReviewed(body?.detail),
      });
    }
    if (response.status === 422) {
      const body = await readJson(response) as { detail?: unknown } | null;
      throw new AdminVerificationServiceError('validation-error', { fields: toFieldErrors(body?.detail) });
    }
    if (response.status === 503) throw new AdminVerificationServiceError('unavailable');
    // ไม่ส่งข้อความดิบจาก backend ออกทาง UI
    throw new AdminVerificationServiceError('server-error');
  };

  return {
    async list(
      accessToken: string,
      query: { status: ReviewQueueStatus; limit?: number; offset?: number },
      signal?: AbortSignal,
    ): Promise<ReviewQueuePage> {
      const params = new URLSearchParams({ status: query.status });
      if (query.limit !== undefined) params.set('limit', String(query.limit));
      if (query.offset !== undefined) params.set('offset', String(query.offset));
      const response = await request(`/admin/verifications?${params.toString()}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      }, signal);
      return toPage(await readJson(response));
    },

    /** ขอลิงก์ชั่วคราวของรูปบัตร ซึ่ง backend จะออกให้เฉพาะบัญชีที่มีสิทธิ์ */
    async getIdCard(accessToken: string, id: number, signal?: AbortSignal): Promise<IdCardEvidence> {
      const response = await request(`/admin/verifications/${id}/id-card`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      }, signal);
      return toEvidence(await readJson(response));
    },

    async decide(
      accessToken: string,
      id: number,
      decision: ReviewDecision,
      rejectReason: string | null,
      signal?: AbortSignal,
    ): Promise<ReviewRequest> {
      const response = await request(`/admin/verifications/${id}/decision`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(
          decision === 'REJECTED' ? { decision, reject_reason: rejectReason } : { decision },
        ),
      }, signal);
      return toRequest(await readJson(response));
    },
  };
}

export type AdminVerificationService = ReturnType<typeof createAdminVerificationService>;
