/** ส่วนที่ store ของงานสั่งซื้อใช้ร่วมกัน: token, การต่ออายุ token และการอ่านชนิดข้อผิดพลาด */
import type { OrderErrorKind } from '../services/order-service';

export type TokenSource = {
  /** token ปัจจุบันของผู้ใช้ คืน null เมื่อไม่มีเซสชัน */
  getAccessToken(): Promise<string | null>;
  /** ต่ออายุ token หนึ่งครั้งเมื่อ backend ตอบ 401 */
  refreshAccessToken(): Promise<string | null>;
};

const ERROR_KINDS: OrderErrorKind[] = ['unauthorized', 'forbidden', 'not-found', 'conflict',
  'validation-error', 'network-error', 'timeout', 'server-error', 'unavailable'];

type ErrorLike = { kind?: unknown; code?: unknown; fields?: unknown; orderId?: unknown };

/** อ่านข้อผิดพลาดโดยไม่ผูกกับคลาส ให้ทดสอบ store แยกจาก service ได้ */
export function errorKind(error: unknown): OrderErrorKind {
  const kind = (error as ErrorLike | null)?.kind;
  return ERROR_KINDS.find(known => known === kind) ?? 'server-error';
}

export function errorCode(error: unknown): string | null {
  const code = (error as ErrorLike | null)?.code;
  return typeof code === 'string' ? code : null;
}

export function errorOrderId(error: unknown): number | null {
  const id = (error as ErrorLike | null)?.orderId;
  return typeof id === 'number' ? id : null;
}

export function errorFields(error: unknown): Record<string, string> {
  const fields = (error as ErrorLike | null)?.fields;
  if (typeof fields !== 'object' || fields === null) return {};
  return fields as Record<string, string>;
}

function unauthorizedError(): Error {
  return Object.assign(new Error('unauthorized'), { kind: 'unauthorized' as const });
}

/** เรียก backend ด้วย token ปัจจุบัน และต่ออายุ token หนึ่งครั้งเมื่อหมดอายุ */
export async function withToken<T>(
  tokens: TokenSource,
  run: (token: string) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const token = await tokens.getAccessToken();
  if (!token) throw unauthorizedError();
  try {
    return await run(token);
  } catch (error) {
    if (signal?.aborted) throw error;
    if (errorKind(error) !== 'unauthorized') throw error;
    const refreshed = await tokens.refreshAccessToken();
    if (!refreshed) throw unauthorizedError();
    return run(refreshed);
  }
}
