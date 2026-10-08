import { notImplemented } from "@agrorende/core";

import type { JobName } from "./jobRegistry.js";

export interface EventOutboxDispatcher {
  readonly dispatchUndispatched: (input: { readonly olderThan: Date; readonly limit: number }) => Promise<{ readonly dispatched: number }>;
}

export interface ProcessorContext {
  readonly eventOutboxDispatcher: EventOutboxDispatcher;
}

export type JobProcessor = (ctx: ProcessorContext) => Promise<void>;


export function createFoundationProcessorContext(): ProcessorContext {
  return {
    eventOutboxDispatcher: {
      async dispatchUndispatched() {
        return { dispatched: 0 };
      },
    },
  };
}

export const JOB_PROCESSORS = {
  async "usage.daily"() {
    return undefined;
  },
  async "orgs.lifecycle"() {
    return undefined;
  },
  async "orgs.purge"() {
    return undefined;
  },
  async "auth.appleRevoke"() {
    return notImplemented("worker.auth.appleRevoke");
  },
  async "events.dispatch"(ctx) {
    const olderThan = new Date(Date.now() - 10_000);
    await ctx.eventOutboxDispatcher.dispatchUndispatched({ olderThan, limit: 100 });
  },
  async "notifications.push"() {
    return notImplemented("worker.notifications.push");
  },
  async "rentals.overdueScan"() {
    return undefined;
  },
  async "workOrders.slaScan"() {
    return undefined;
  },
  async "devices.staleSync"() {
    return undefined;
  },
  async "media.cleanupPending"() {
    return undefined;
  },
  async "locations.prune"() {
    return undefined;
  },
  async "mutations.prune"() {
    return undefined;
  },
  async "diagnostics.prune"() {
    return undefined;
  },
  async "exports.build"() {
    return notImplemented("worker.exports.build");
  },
  async "tombstones.prune"() {
    return undefined;
  },
  async "pdf.render"() {
    return notImplemented("worker.pdf.render");
  },
  async "maintenance.dueScan"() {
    return undefined;
  },
  async "stock.lowScan"() {
    return undefined;
  },
} as const satisfies Record<JobName, JobProcessor>;
