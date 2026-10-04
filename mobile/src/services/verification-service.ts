import { readLocalUploadFile } from './upload-file-part.ts';

export type VerificationStatus = 'NOT_SUBMITTED' | 'PENDING' | 'APPROVED' | 'REJECTED';

export type VerificationRecord = {
  status: VerificationStatus;
  id: number | null;
  shopName: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountLast4: string | null;
  rejectReason: string | null;
  reviewedAt: string | null;
  verifiedAt: string | null;
  canSubmit: boolean;
};

export type VerificationErrorKind = 'unauthorized' | 'forbidden' | 'conflict'
  | 'validation-error' | 'network-error' | 'server-error' | 'unavailable';

export type IdCardFile = {
  uri: string;
  name: string;
  type: string;
  /** ขนาดไฟล์จาก picker ถ้ามี ใช้กันไฟล์ใหญ่เกินก่อนส่งขึ้น backend */
  size?: number;
  /** Web only: the File object from the picker, appended to FormData directly. */
  file?: unknown;
};

export type VerificationInput = {
  shopName: string;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  idCard: IdCardFile;
};

export class VerificationServiceError extends Error {
  readonly kind: VerificationErrorKind;
  readonly fields: Record<string, string>;

  constructor(kind: VerificationErrorKind, fields: Record<string, string> = {}) {
    super(kind);
    this.name = 'VerificationServiceError';
    this.kind = kind;
    this.fields = fields;
  }
}

const STATUSES: VerificationStatus[] = ['NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED'];

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function toRecord(payload: unknown): VerificationRecord {
  if (typeof payload !== 'object' || payload === null) throw new VerificationServiceError('server-error');
  const data = payload as Record<string, unknown>;
  const status = STATUSES.find(known => known === data.status);
  if (!status) throw new VerificationServiceError('server-error');
  return {
    status,
    id: typeof data.id === 'number' ? data.id : null,
    shopName: readString(data.shop_name),
    bankName: readString(data.bank_name),
    bankAccountName: readString(data.bank_account_name),
    bankAccountLast4: readString(data.bank_account_last4),
    rejectReason: status === 'REJECTED' ? readString(data.reject_reason) : null,
    reviewedAt: readString(data.reviewed_at),
    verifiedAt: readString(data.verified_at),
    canSubmit: data.can_submit === true,
  };
}

/** แปลงรายละเอียดข้อผิดพลาดรายช่องจาก backend โดยรับเฉพาะคู่ค่าที่เป็นข้อความ */
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

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw signal.reason ?? Object.assign(new Error('Aborted'), { name: 'AbortError' });
  }
}

export function createVerificationService(options: { baseUrl?: string; fetch?: FetchLike }) {
  let baseUrl: string | undefined;
  if (options.baseUrl) {
    const parsed = new URL(options.baseUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Invalid API origin');
    baseUrl = parsed.origin;
  }
  const fetcher = options.fetch ?? fetch;

  const request = async (path: string, init: RequestInit, signal?: AbortSignal): Promise<Response> => {
    if (!baseUrl) throw new VerificationServiceError('unavailable');
    throwIfAborted(signal);
    let response: Response;
    try {
      response = await fetcher(`${baseUrl}${path}`, { ...init, signal });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new VerificationServiceError('network-error');
    }
    if (response.ok) return response;
    if (response.status === 401) throw new VerificationServiceError('unauthorized');
    if (response.status === 403) throw new VerificationServiceError('forbidden');
    if (response.status === 409) throw new VerificationServiceError('conflict');
    if (response.status === 422) {
      const body = await readJson(response) as { detail?: unknown } | null;
      throw new VerificationServiceError('validation-error', toFieldErrors(body?.detail));
    }
    if (response.status === 503) throw new VerificationServiceError('unavailable');
    // ไม่ส่งข้อความดิบจาก backend ออกทาง UI
    throw new VerificationServiceError('server-error');
  };

  return {
    async getMine(accessToken: string, signal?: AbortSignal): Promise<VerificationRecord> {
      const response = await request('/verifications/me', {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      }, signal);
      return toRecord(await readJson(response));
    },

    async submit(
      accessToken: string,
      input: VerificationInput,
      signal?: AbortSignal,
    ): Promise<VerificationRecord> {
      if (!baseUrl) throw new VerificationServiceError('unavailable');
      throwIfAborted(signal);
      const body = new FormData();
      body.append('shop_name', input.shopName);
      body.append('bank_name', input.bankName);
      body.append('bank_account_name', input.bankAccountName);
      body.append('bank_account_number', input.bankAccountNumber);
      if (input.idCard.file) {
        body.append('id_card_image', input.idCard.file as Blob, input.idCard.name);
      } else {
        let localFile: Blob;
        try {
          localFile = readLocalUploadFile(input.idCard.uri);
        } catch {
          throw new VerificationServiceError('validation-error', {
            id_card_image: 'อ่านรูปบัตรไม่สำเร็จ กรุณาเลือกรูปใหม่',
          });
        }
        body.append('id_card_image', localFile);
      }

      const response = await request('/verifications', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body,
      }, signal);
      return toRecord(await readJson(response));
    },
  };
}

export type VerificationService = ReturnType<typeof createVerificationService>;
