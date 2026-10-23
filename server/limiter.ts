// Token-bucket rate limiter keyed by any string (socket id, user id, IP).

export class RateLimiter {
  readonly capacity: number;
  readonly refillPerMs: number;
  private buckets = new Map<string, { tokens: number; at: number }>();

  /** `capacity` events at once, refilled at `perSecond` events per second. */
  constructor(capacity: number, perSecond: number) {
    this.capacity = capacity;
    this.refillPerMs = perSecond / 1000;
  }

  take(key: string, now = Date.now()): boolean {
    const b = this.buckets.get(key) ?? { tokens: this.capacity, at: now };
    b.tokens = Math.min(this.capacity, b.tokens + (now - b.at) * this.refillPerMs);
    b.at = now;
    if (b.tokens < 1) {
      this.buckets.set(key, b);
      return false;
    }
    b.tokens -= 1;
    this.buckets.set(key, b);
    if (this.buckets.size > 10_000) this.prune(now);
    return true;
  }

  private prune(now: number): void {
    for (const [k, b] of this.buckets) {
      if (b.tokens + (now - b.at) * this.refillPerMs >= this.capacity) this.buckets.delete(k);
    }
  }
}
