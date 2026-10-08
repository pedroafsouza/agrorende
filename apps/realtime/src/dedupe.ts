/** Bounded set of recently relayed outbox event ids; dispatcher retries are delivered once. */
export class EventIdCache {
  private readonly seen = new Map<string, true>();

  constructor(private readonly capacity = 10_000) {}

  /** Returns true the first time an id is seen. */
  remember(eventId: string): boolean {
    if (this.seen.has(eventId)) return false;
    this.seen.set(eventId, true);
    if (this.seen.size > this.capacity) {
      const oldest = this.seen.keys().next();
      if (!oldest.done) this.seen.delete(oldest.value);
    }
    return true;
  }

  get size(): number {
    return this.seen.size;
  }
}
