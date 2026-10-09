import { dispatchPending, pendingEventIds } from "@agrorende/core/events";

/**
 * After a request commits, try to publish the outbox rows it emitted right away (ARCHITECTURE §6.5,
 * §7.3). Failures are swallowed: the worker's `events.dispatch` sweep retries anything left behind.
 */
export function fastDispatch(): void {
  if (pendingEventIds().length === 0) return;
  void dispatchPending().catch(() => undefined);
}
