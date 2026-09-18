import type {
  VerificationErrorKind,
  VerificationRecord,
  VerificationService,
} from '../services/verification-service';
import {
  mapApiFieldErrors,
  toVerificationInput,
  validateVerificationForm,
  type VerificationFieldErrors,
  type VerificationFormValues,
} from './verification-form.ts';

export type VerificationState = {
  /** บัญชีเจ้าของข้อมูลชุดนี้ ใช้ทิ้งข้อมูลเมื่อออกจากระบบหรือเปลี่ยนบัญชี */
  owner: string | null;
  loading: boolean;
  refreshing: boolean;
  record: VerificationRecord | null;
  loadError: VerificationErrorKind | null;
  submitting: boolean;
  submitError: VerificationErrorKind | null;
  fieldErrors: VerificationFieldErrors;
};

export const initialVerificationState: VerificationState = {
  owner: null,
  loading: false,
  refreshing: false,
  record: null,
  loadError: null,
  submitting: false,
  submitError: null,
  fieldErrors: {},
};

export type VerificationStoreDeps = {
  service: VerificationService;
  /** token ปัจจุบันของผู้ใช้ คืน null เมื่อไม่มีเซสชัน */
  getAccessToken(): Promise<string | null>;
  /** ต่ออายุ token หนึ่งครั้งเมื่อ backend ตอบ 401 */
  refreshAccessToken(): Promise<string | null>;
};

const ERROR_KINDS: VerificationErrorKind[] = ['unauthorized', 'forbidden', 'conflict',
  'validation-error', 'network-error', 'server-error', 'unavailable'];

type KindedError = { kind?: unknown; fields?: unknown };

/** อ่านชนิดข้อผิดพลาดจาก service โดยไม่ผูกกับคลาส เพื่อให้โมดูลนี้ทดสอบแยกได้ */
function errorKind(error: unknown): VerificationErrorKind {
  const kind = (error as KindedError | null)?.kind;
  return ERROR_KINDS.find(known => known === kind) ?? 'server-error';
}

function errorFields(error: unknown): Record<string, string> {
  const fields = (error as KindedError | null)?.fields;
  if (typeof fields !== 'object' || fields === null) return {};
  return fields as Record<string, string>;
}

function unauthorizedError(): Error {
  return Object.assign(new Error('unauthorized'), { kind: 'unauthorized' as const });
}

export function createVerificationStore(deps: VerificationStoreDeps) {
  let state: VerificationState = initialVerificationState;
  let inFlight: AbortController | undefined;
  const listeners = new Set<() => void>();

  const emit = () => listeners.forEach(listener => listener());
  const set = (patch: Partial<VerificationState>) => {
    state = { ...state, ...patch };
    emit();
  };

  const abortInFlight = () => {
    inFlight?.abort();
    inFlight = undefined;
  };

  /** เรียก backend พร้อมต่ออายุ token หนึ่งครั้งเมื่อ token หมดอายุ */
  const authorized = async <T>(
    run: (token: string, signal: AbortSignal) => Promise<T>,
    signal: AbortSignal,
  ): Promise<T> => {
    const token = await deps.getAccessToken();
    if (!token) throw unauthorizedError();
    try {
      return await run(token, signal);
    } catch (error) {
      if (signal.aborted) throw error;
      if (errorKind(error) !== 'unauthorized') throw error;
      const refreshed = await deps.refreshAccessToken();
      if (!refreshed) throw unauthorizedError();
      return run(refreshed, signal);
    }
  };

  const load = async (owner: string, mode: 'load' | 'refresh') => {
    if (state.owner !== owner) return;
    abortInFlight();
    const attempt = new AbortController();
    inFlight = attempt;
    // คำตอบของบัญชีก่อนหน้าต้องไม่ถูกนำมาแสดงหลังเปลี่ยนผู้ใช้
    const isCurrent = () => !attempt.signal.aborted && state.owner === owner && inFlight === attempt;
    set(mode === 'refresh' ? { refreshing: true, loadError: null } : { loading: true, loadError: null });
    try {
      const record = await authorized(
        (token, signal) => deps.service.getMine(token, signal),
        attempt.signal,
      );
      if (isCurrent()) set({ record, loading: false, refreshing: false, loadError: null });
    } catch (error) {
      if (isCurrent()) set({ loading: false, refreshing: false, loadError: errorKind(error) });
    } finally {
      if (inFlight === attempt) inFlight = undefined;
    }
  };

  return {
    getSnapshot: () => state,

    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },

    /** ผูกข้อมูลกับบัญชีปัจจุบัน ล้างทุกอย่างเมื่อบัญชีเปลี่ยนหรือออกจากระบบ */
    setOwner(owner: string | null) {
      if (state.owner === owner) return;
      abortInFlight();
      state = { ...initialVerificationState, owner };
      emit();
    },

    load() {
      if (!state.owner || state.loading || state.refreshing) return Promise.resolve();
      return load(state.owner, 'load');
    },

    refresh() {
      if (!state.owner || state.loading || state.refreshing) return Promise.resolve();
      return load(state.owner, 'refresh');
    },

    /** ใช้ทั้งปุ่มลองใหม่เมื่อเครือข่ายผิดพลาด และการโหลดครั้งแรก */
    retry() {
      if (!state.owner || state.loading || state.refreshing) return Promise.resolve();
      return load(state.owner, state.record ? 'refresh' : 'load');
    },

    clearFieldError(field: keyof VerificationFieldErrors) {
      if (!state.fieldErrors[field]) return;
      const { [field]: _removed, ...rest } = state.fieldErrors;
      set({ fieldErrors: rest, submitError: null });
    },

    async submit(values: VerificationFormValues) {
      const owner = state.owner;
      if (!owner) return;
      // กันกดส่งซ้ำระหว่างรอผล ทั้งจากปุ่มรัวและจากคำขอที่ backend รับไว้แล้ว
      if (state.submitting) return;
      if (state.record && !state.record.canSubmit && state.record.status !== 'NOT_SUBMITTED') {
        set({ submitError: 'conflict', fieldErrors: {} });
        return;
      }

      const fieldErrors = validateVerificationForm(values);
      if (Object.keys(fieldErrors).length > 0) {
        set({ fieldErrors, submitError: 'validation-error' });
        return;
      }
      const input = toVerificationInput(values);
      if (!input) return;

      abortInFlight();
      const attempt = new AbortController();
      inFlight = attempt;
      const isCurrent = () => !attempt.signal.aborted && state.owner === owner && inFlight === attempt;
      set({ submitting: true, submitError: null, fieldErrors: {} });
      try {
        const record = await authorized(
          (token, signal) => deps.service.submit(token, input, signal),
          attempt.signal,
        );
        if (isCurrent()) set({ record, submitting: false, submitError: null, fieldErrors: {} });
      } catch (error) {
        if (!isCurrent()) return;
        const kind = errorKind(error);
        const fields = mapApiFieldErrors(errorFields(error));
        set({ submitting: false, submitError: kind, fieldErrors: fields });
        inFlight = undefined;
        // คำขอถูกรับไว้แล้วจากอุปกรณ์อื่น จึงดึงสถานะล่าสุดมาแสดงแทน
        if (kind === 'conflict') await load(owner, 'refresh');
      } finally {
        if (inFlight === attempt) inFlight = undefined;
      }
    },
  };
}

export type VerificationStore = ReturnType<typeof createVerificationStore>;
