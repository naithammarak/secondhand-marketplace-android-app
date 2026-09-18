import type {
  AdminVerificationErrorKind,
  AdminVerificationService,
  AlreadyReviewed,
  IdCardEvidence,
  ReviewDecision,
  ReviewQueueStatus,
  ReviewRequest,
} from '../services/admin-verification-service';
import { reasonErrorFromApi, validateRejectReason } from './review-form.ts';

export const PAGE_SIZE = 20;

export type ReviewState = {
  /** บัญชีเจ้าของข้อมูลชุดนี้ ใช้ทิ้งข้อมูลเมื่อออกจากระบบหรือเปลี่ยนบัญชี */
  owner: string | null;
  status: ReviewQueueStatus;
  loading: boolean;
  refreshing: boolean;
  loaded: boolean;
  items: ReviewRequest[];
  total: number;
  loadError: AdminVerificationErrorKind | null;
  selectedId: number | null;
  evidence: IdCardEvidence | null;
  evidenceLoading: boolean;
  evidenceError: AdminVerificationErrorKind | null;
  rejectReason: string;
  reasonError: string | null;
  /** ผลที่กำลังบันทึกอยู่ ใช้ปิดปุ่มทั้งคู่กันกดซ้ำ */
  deciding: ReviewDecision | null;
  decisionError: AdminVerificationErrorKind | null;
  /** คำขอถูกผู้ดูแลคนอื่นตรวจไปก่อนแล้ว */
  alreadyReviewed: AlreadyReviewed | null;
  /** ผลที่เพิ่งบันทึกสำเร็จ ใช้แจ้งผู้ดูแลหลังรายการถูกรีเฟรช */
  lastDecision: { id: number; decision: ReviewDecision } | null;
};

export const initialReviewState: ReviewState = {
  owner: null,
  status: 'PENDING',
  loading: false,
  refreshing: false,
  loaded: false,
  items: [],
  total: 0,
  loadError: null,
  selectedId: null,
  evidence: null,
  evidenceLoading: false,
  evidenceError: null,
  rejectReason: '',
  reasonError: null,
  deciding: null,
  decisionError: null,
  alreadyReviewed: null,
  lastDecision: null,
};

export type ReviewStoreDeps = {
  service: AdminVerificationService;
  /** token ปัจจุบันของผู้ใช้ คืน null เมื่อไม่มีเซสชัน */
  getAccessToken(): Promise<string | null>;
  /** ต่ออายุ token หนึ่งครั้งเมื่อ backend ตอบ 401 */
  refreshAccessToken(): Promise<string | null>;
};

const ERROR_KINDS: AdminVerificationErrorKind[] = ['unauthorized', 'forbidden', 'not-found',
  'conflict', 'validation-error', 'network-error', 'server-error', 'unavailable'];

type KindedError = { kind?: unknown; fields?: unknown; alreadyReviewed?: unknown };

/** อ่านชนิดข้อผิดพลาดจาก service โดยไม่ผูกกับคลาส เพื่อให้โมดูลนี้ทดสอบแยกได้ */
function errorKind(error: unknown): AdminVerificationErrorKind {
  const kind = (error as KindedError | null)?.kind;
  return ERROR_KINDS.find(known => known === kind) ?? 'server-error';
}

function errorFields(error: unknown): Record<string, string> {
  const fields = (error as KindedError | null)?.fields;
  if (typeof fields !== 'object' || fields === null) return {};
  return fields as Record<string, string>;
}

function errorAlreadyReviewed(error: unknown): AlreadyReviewed | null {
  const detail = (error as KindedError | null)?.alreadyReviewed;
  if (typeof detail !== 'object' || detail === null) return null;
  return detail as AlreadyReviewed;
}

function unauthorizedError(): Error {
  return Object.assign(new Error('unauthorized'), { kind: 'unauthorized' as const });
}

export function createReviewStore(deps: ReviewStoreDeps) {
  let state: ReviewState = initialReviewState;
  let listInFlight: AbortController | undefined;
  let evidenceInFlight: AbortController | undefined;
  let decisionInFlight: AbortController | undefined;
  const listeners = new Set<() => void>();

  const emit = () => listeners.forEach(listener => listener());
  const set = (patch: Partial<ReviewState>) => {
    state = { ...state, ...patch };
    emit();
  };

  const abortAll = () => {
    listInFlight?.abort();
    evidenceInFlight?.abort();
    decisionInFlight?.abort();
    listInFlight = undefined;
    evidenceInFlight = undefined;
    decisionInFlight = undefined;
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

  const load = async (owner: string, status: ReviewQueueStatus, mode: 'load' | 'refresh') => {
    if (state.owner !== owner) return;
    listInFlight?.abort();
    const attempt = new AbortController();
    listInFlight = attempt;
    // คำตอบของบัญชีหรือตัวกรองก่อนหน้าต้องไม่ถูกนำมาแสดงทับของปัจจุบัน
    const isCurrent = () => !attempt.signal.aborted && state.owner === owner
      && state.status === status && listInFlight === attempt;
    set(mode === 'refresh'
      ? { refreshing: true, loadError: null }
      : { loading: true, loadError: null });
    try {
      const page = await authorized(
        (token, signal) => deps.service.list(token, { status, limit: PAGE_SIZE }, signal),
        attempt.signal,
      );
      if (!isCurrent()) return;
      // คำขอที่เลือกไว้อาจหายจากรายการหลังถูกตรวจ จึงคืนหน้าจอกลับไปที่รายการ
      const keepSelected = page.items.some(item => item.id === state.selectedId);
      set({
        items: page.items,
        total: page.total,
        loading: false,
        refreshing: false,
        loaded: true,
        loadError: null,
        selectedId: keepSelected ? state.selectedId : null,
        evidence: keepSelected ? state.evidence : null,
        evidenceError: keepSelected ? state.evidenceError : null,
      });
    } catch (error) {
      if (isCurrent()) set({ loading: false, refreshing: false, loadError: errorKind(error) });
    } finally {
      if (listInFlight === attempt) listInFlight = undefined;
    }
  };

  const clearSelection = (): Partial<ReviewState> => ({
    selectedId: null,
    evidence: null,
    evidenceLoading: false,
    evidenceError: null,
    rejectReason: '',
    reasonError: null,
    decisionError: null,
    alreadyReviewed: null,
  });

  return {
    getSnapshot: () => state,

    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },

    /** ผูกข้อมูลกับบัญชีปัจจุบัน ล้างทุกอย่างเมื่อบัญชีเปลี่ยนหรือออกจากระบบ */
    setOwner(owner: string | null) {
      if (state.owner === owner) return;
      abortAll();
      state = { ...initialReviewState, owner };
      emit();
    },

    load() {
      if (!state.owner || state.loading || state.refreshing) return Promise.resolve();
      return load(state.owner, state.status, 'load');
    },

    refresh() {
      if (!state.owner || state.loading || state.refreshing) return Promise.resolve();
      return load(state.owner, state.status, 'refresh');
    },

    /** ใช้ทั้งปุ่มลองใหม่เมื่อโหลดล้มเหลว และการโหลดครั้งแรก */
    retry() {
      if (!state.owner || state.loading || state.refreshing) return Promise.resolve();
      return load(state.owner, state.status, state.loaded ? 'refresh' : 'load');
    },

    setStatus(status: ReviewQueueStatus) {
      if (state.status === status) return Promise.resolve();
      abortAll();
      set({
        ...clearSelection(),
        status,
        items: [],
        total: 0,
        loaded: false,
        loading: false,
        refreshing: false,
        loadError: null,
        lastDecision: null,
      });
      if (!state.owner) return Promise.resolve();
      return load(state.owner, status, 'load');
    },

    select(id: number | null) {
      if (state.deciding) return;
      evidenceInFlight?.abort();
      evidenceInFlight = undefined;
      set({ ...clearSelection(), selectedId: id, lastDecision: null });
    },

    /** ขอลิงก์รูปบัตรเฉพาะตอนผู้ดูแลกดดู เพื่อไม่ดึงหลักฐานมาไว้ล่วงหน้าทั้งรายการ */
    async loadEvidence() {
      const owner = state.owner;
      const id = state.selectedId;
      if (!owner || id === null || state.evidenceLoading) return;
      evidenceInFlight?.abort();
      const attempt = new AbortController();
      evidenceInFlight = attempt;
      const isCurrent = () => !attempt.signal.aborted && state.owner === owner
        && state.selectedId === id && evidenceInFlight === attempt;
      set({ evidenceLoading: true, evidenceError: null });
      try {
        const evidence = await authorized(
          (token, signal) => deps.service.getIdCard(token, id, signal),
          attempt.signal,
        );
        if (isCurrent()) set({ evidence, evidenceLoading: false, evidenceError: null });
      } catch (error) {
        if (isCurrent()) set({ evidence: null, evidenceLoading: false, evidenceError: errorKind(error) });
      } finally {
        if (evidenceInFlight === attempt) evidenceInFlight = undefined;
      }
    },

    setRejectReason(reason: string) {
      set({ rejectReason: reason, reasonError: null, decisionError: null });
    },

    async decide(decision: ReviewDecision) {
      const owner = state.owner;
      const id = state.selectedId;
      if (!owner || id === null) return;
      // กันกดบันทึกซ้ำระหว่างรอผลจาก backend ทั้งปุ่มอนุมัติและปุ่มปฏิเสธ
      if (state.deciding) return;

      let reason: string | null = null;
      if (decision === 'REJECTED') {
        const reasonError = validateRejectReason(state.rejectReason);
        if (reasonError) {
          set({ reasonError, decisionError: 'validation-error', alreadyReviewed: null });
          return;
        }
        reason = state.rejectReason.trim();
      }

      const attempt = new AbortController();
      decisionInFlight = attempt;
      const isCurrent = () => !attempt.signal.aborted && state.owner === owner
        && decisionInFlight === attempt;
      set({ deciding: decision, decisionError: null, reasonError: null, alreadyReviewed: null,
        lastDecision: null });
      try {
        await authorized(
          (token, signal) => deps.service.decide(token, id, decision, reason, signal),
          attempt.signal,
        );
        if (!isCurrent()) return;
        decisionInFlight = undefined;
        set({ ...clearSelection(), deciding: null, lastDecision: { id, decision } });
        // อ่านรายการใหม่จาก backend เสมอ ไม่เดาผลจากฝั่งเครื่อง
        await load(owner, state.status, 'refresh');
      } catch (error) {
        if (!isCurrent()) return;
        const kind = errorKind(error);
        decisionInFlight = undefined;
        set({
          deciding: null,
          decisionError: kind,
          reasonError: kind === 'validation-error'
            ? reasonErrorFromApi(errorFields(error)) ?? null
            : null,
          alreadyReviewed: kind === 'conflict' ? errorAlreadyReviewed(error) : null,
        });
        // คำขอถูกตรวจไปแล้วหรือถูกลบ จึงดึงรายการล่าสุดมาแสดงแทน
        if (kind === 'conflict' || kind === 'not-found') await load(owner, state.status, 'refresh');
      } finally {
        if (decisionInFlight === attempt) decisionInFlight = undefined;
      }
    },
  };
}

export type ReviewStore = ReturnType<typeof createReviewStore>;
