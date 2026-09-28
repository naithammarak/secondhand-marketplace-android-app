import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/auth/auth-provider';
import { getSupabaseClient } from '@/auth/supabase-client';
import { createInspectionService, InspectionServiceError } from '@/services/inspection-service';

const messages: Record<string, string> = {
  unauthorized: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง',
  courier_delivery_required: 'รอ Courier แนบหลักฐานและยืนยันส่งถึงศูนย์ก่อนรับสินค้า',
  certificate_unavailable: 'บริการออกใบรับรองยังไม่พร้อม ผลตรวจยังไม่ถูกบันทึก กรุณาลองใหม่',
  storage_unavailable: 'โหลดหรือบันทึกรูปหลักฐานไม่ได้ กรุณาลองใหม่',
  invalid_courier: 'ไม่พบบัญชี Courier ที่ใช้งานได้ กรุณาตรวจรหัสผู้ขนส่ง',
  assignment_locked: 'รายการนี้ยืนยันการส่งหรือมีหลักฐานแล้ว จึงเปลี่ยนผู้ขนส่งไม่ได้',
  proof_required: 'กรุณาแนบรูปส่งถึงศูนย์ 1–3 รูปก่อนยืนยัน',
  timeout: 'ยังไม่ได้รับคำตอบจากระบบ กดลองใหม่เพื่อส่งคำขอเดิมอย่างปลอดภัย',
  network_error: 'เชื่อมต่อระบบไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่',
};
export function inspectionError(error: unknown): string {
  if (!(error instanceof InspectionServiceError)) return 'โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่';
  return messages[error.code] ?? (error.status === 401 ? 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง'
    : error.status === 404 ? 'ไม่พบรายการ หรือบัญชีนี้ไม่มีสิทธิ์เข้าถึง'
    : error.status === 403 ? 'บัญชีนี้ไม่มีสิทธิ์ทำรายการ'
    : error.status === 409 ? 'สถานะรายการเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุด'
    : error.status === 413 ? 'รูปต้องมีขนาดไม่เกิน 5 MB'
    : error.status === 415 ? 'กรุณาเลือกไฟล์ภาพที่ระบบรองรับ'
    : error.status === 422 ? 'กรุณาตรวจสอบข้อมูลที่กรอก'
    : 'บริการยังไม่พร้อม กรุณาลองใหม่');
}

/** Always read the current token; never carry an old account into a retry. */
export function useInspectionApi() {
  const auth = useAuth();
  const owner = auth.session?.user.id;
  const client = useMemo(() => getSupabaseClient(), []);
  const service = useMemo(() => createInspectionService({ baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL }), []);
  const call = useCallback(async <T,>(request: (token: string) => Promise<T>): Promise<T> => {
    const session = (await client?.auth.getSession())?.data.session;
    if (!session || session.user.id !== owner) throw new InspectionServiceError(401, 'unauthorized');
    try { return await request(session.access_token); } catch (error) {
      if (!(error instanceof InspectionServiceError) || error.status !== 401) throw error;
      const refreshed = (await client?.auth.refreshSession())?.data.session;
      if (!refreshed || refreshed.user.id !== owner) throw new InspectionServiceError(401, 'unauthorized');
      return request(refreshed.access_token);
    }
  }, [client, owner]);
  const token = auth.session?.access_token ?? '';
  return useMemo(() => ({ service, call, token }), [service, call, token]);
}

/** Retain a mutation's key across uncertain network/server responses. */
export function useInspectionMutation() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const lock = useRef(false);
  const alive = useRef(true);
  const keys = useRef(new Map<string, string>());
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const mutate = useCallback(async (identity: string, operation: (key: string) => Promise<unknown>, onDefinitiveFailure?: () => void) => {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true); setError(undefined);
    const key = keys.current.get(identity) ?? Crypto.randomUUID();
    keys.current.set(identity, key);
    try {
      await operation(key);
      keys.current.delete(identity);
      return alive.current;
    } catch (failure) {
      if (failure instanceof InspectionServiceError && failure.status >= 400 && failure.status < 500 && failure.status !== 408) {
        keys.current.delete(identity);
        if (alive.current) onDefinitiveFailure?.();
      }
      if (alive.current) setError(inspectionError(failure));
      return false;
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }, []);
  return { busy, error, mutate };
}
