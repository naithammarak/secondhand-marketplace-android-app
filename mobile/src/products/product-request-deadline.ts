export const DEFAULT_PRODUCT_TIMEOUT_MS = 15_000;

export class ProductRequestTimeoutError extends Error {
  constructor() {
    super('หมดเวลารอการตอบกลับจากเซิร์ฟเวอร์');
    this.name = 'ProductRequestTimeoutError';
  }
}

export class ProductRequestCancelledError extends Error {
  constructor() {
    super('คำขอถูกยกเลิก');
    this.name = 'AbortError';
  }
}

/** Covers token lookup, response headers, and response body with one deadline. */
export async function withProductRequestDeadline<T>(
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMs = DEFAULT_PRODUCT_TIMEOUT_MS,
  callerSignal?: AbortSignal,
): Promise<T> {
  if (callerSignal?.aborted) throw new ProductRequestCancelledError();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;
  const deadline = new Promise<never>((_, reject) => {
    cancel = () => {
      reject(new ProductRequestCancelledError());
      controller.abort();
    };
    callerSignal?.addEventListener('abort', cancel, { once: true });
    timer = setTimeout(() => {
      reject(new ProductRequestTimeoutError());
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([Promise.resolve().then(() => work(controller.signal)), deadline]);
  } finally {
    if (timer) clearTimeout(timer);
    if (cancel) callerSignal?.removeEventListener('abort', cancel);
  }
}
