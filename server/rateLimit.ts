/** Simple token bucket. `take()` returns false when the caller should be throttled. */
export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(private readonly capacity: number, private readonly refillPerSec: number, private readonly clock = Date.now) {
    this.tokens = capacity;
    this.last = clock();
  }

  take(cost = 1): boolean {
    const now = this.clock();
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / 1000) * this.refillPerSec);
    this.last = now;
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }
}

/** Keyed buckets (e.g. per IP) with periodic cleanup of idle keys. */
export class KeyedLimiter {
  private readonly buckets = new Map<string, { bucket: TokenBucket; seen: number }>();

  constructor(private readonly capacity: number, private readonly refillPerSec: number) {}

  take(key: string, cost = 1): boolean {
    let entry = this.buckets.get(key);
    if (!entry) {
      entry = { bucket: new TokenBucket(this.capacity, this.refillPerSec), seen: Date.now() };
      this.buckets.set(key, entry);
    }
    entry.seen = Date.now();
    return entry.bucket.take(cost);
  }

  prune(maxIdleMs: number): void {
    const cutoff = Date.now() - maxIdleMs;
    for (const [key, entry] of this.buckets) if (entry.seen < cutoff) this.buckets.delete(key);
  }
}
