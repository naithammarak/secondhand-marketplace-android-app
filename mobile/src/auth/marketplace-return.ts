export type MarketplaceDestination = { kind: 'orders' } | { kind: 'sell' } | { kind: 'checkout'; productId: number };
type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void> };
const KEY = 'marketplace.return.v1';
const TTL = 30 * 60 * 1000;

export function validDestination(value: unknown): value is MarketplaceDestination {
  if (!value || typeof value !== 'object' || !('kind' in value)) return false;
  return value.kind === 'orders' || value.kind === 'sell' || (value.kind === 'checkout'
    && 'productId' in value && Number.isSafeInteger(value.productId) && Number(value.productId) > 0);
}

export function createMarketplaceReturn(storage: Storage, now = Date.now) {
  let queue: Promise<unknown> = Promise.resolve();
  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation, operation);
    queue = result.catch(() => undefined);
    return result;
  }
  async function read(): Promise<MarketplaceDestination | null> {
    const raw = await storage.getItem(KEY);
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      return validDestination(data.destination) && typeof data.expiresAt === 'number'
        && data.expiresAt > now() && data.expiresAt <= now() + TTL ? data.destination : null;
    } catch { return null; }
  }
  return {
    save(destination: MarketplaceDestination) {
      if (!validDestination(destination)) return Promise.reject(new Error('Invalid destination'));
      return enqueue(() => storage.setItem(KEY, JSON.stringify({ destination, expiresAt: now() + TTL })));
    },
    clear: () => enqueue(() => storage.removeItem(KEY)),
    peek: () => enqueue(read),
    consume: () => enqueue(async (): Promise<MarketplaceDestination | null> => {
      const destination = await read();
      await storage.removeItem(KEY);
      return destination;
    }),
  };
}
