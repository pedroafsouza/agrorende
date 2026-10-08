import type { RepeatOptions } from "bullmq";

export const JOB_NAMES = [
  "usage.daily",
  "orgs.lifecycle",
  "orgs.purge",
  "auth.appleRevoke",
  "events.dispatch",
  "notifications.push",
  "rentals.overdueScan",
  "workOrders.slaScan",
  "devices.staleSync",
  "media.cleanupPending",
  "locations.prune",
  "mutations.prune",
  "diagnostics.prune",
  "exports.build",
  "tombstones.prune",
  "pdf.render",
  "maintenance.dueScan",
  "stock.lowScan",
] as const;

export type JobName = (typeof JOB_NAMES)[number];
export type QueueName = "default" | "events" | "notifications" | "maintenance" | "exports" | "media";

export interface JobDefinition {
  readonly name: JobName;
  readonly queueName: QueueName;
  readonly attempts: 5;
  readonly backoff: {
    readonly type: "exponential";
    readonly delay: number;
  };
  readonly repeat?: Omit<RepeatOptions, "key">;
}

const DEFAULT_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: "exponential", delay: 1_000 },
} as const;

export const JOB_REGISTRY = {
  "usage.daily": { name: "usage.daily", queueName: "default", repeat: { pattern: "0 3 * * *" }, ...DEFAULT_JOB_OPTIONS },
  "orgs.lifecycle": { name: "orgs.lifecycle", queueName: "default", repeat: { pattern: "10 3 * * *" }, ...DEFAULT_JOB_OPTIONS },
  "orgs.purge": { name: "orgs.purge", queueName: "default", repeat: { pattern: "20 3 * * *" }, ...DEFAULT_JOB_OPTIONS },
  "auth.appleRevoke": { name: "auth.appleRevoke", queueName: "default", ...DEFAULT_JOB_OPTIONS },
  "events.dispatch": { name: "events.dispatch", queueName: "events", repeat: { every: 5_000 }, ...DEFAULT_JOB_OPTIONS },
  "notifications.push": { name: "notifications.push", queueName: "notifications", ...DEFAULT_JOB_OPTIONS },
  "rentals.overdueScan": { name: "rentals.overdueScan", queueName: "default", repeat: { every: 5 * 60_000 }, ...DEFAULT_JOB_OPTIONS },
  "workOrders.slaScan": { name: "workOrders.slaScan", queueName: "default", repeat: { every: 5 * 60_000 }, ...DEFAULT_JOB_OPTIONS },
  "devices.staleSync": { name: "devices.staleSync", queueName: "default", repeat: { every: 30 * 60_000 }, ...DEFAULT_JOB_OPTIONS },
  "media.cleanupPending": { name: "media.cleanupPending", queueName: "media", repeat: { pattern: "0 3 * * *" }, ...DEFAULT_JOB_OPTIONS },
  "locations.prune": { name: "locations.prune", queueName: "default", repeat: { pattern: "15 3 * * *" }, ...DEFAULT_JOB_OPTIONS },
  "mutations.prune": { name: "mutations.prune", queueName: "default", repeat: { pattern: "30 3 * * *" }, ...DEFAULT_JOB_OPTIONS },
  "diagnostics.prune": { name: "diagnostics.prune", queueName: "default", repeat: { pattern: "25 3 * * *" }, ...DEFAULT_JOB_OPTIONS },
  "exports.build": { name: "exports.build", queueName: "exports", ...DEFAULT_JOB_OPTIONS },
  "tombstones.prune": { name: "tombstones.prune", queueName: "default", repeat: { pattern: "45 3 * * *" }, ...DEFAULT_JOB_OPTIONS },
  "pdf.render": { name: "pdf.render", queueName: "exports", ...DEFAULT_JOB_OPTIONS },
  "maintenance.dueScan": { name: "maintenance.dueScan", queueName: "maintenance", repeat: { pattern: "0 * * * *" }, ...DEFAULT_JOB_OPTIONS },
  "stock.lowScan": { name: "stock.lowScan", queueName: "maintenance", repeat: { pattern: "0 * * * *" }, ...DEFAULT_JOB_OPTIONS },
} as const satisfies Record<JobName, JobDefinition>;

export const QUEUE_NAMES = ["default", "events", "notifications", "maintenance", "exports", "media"] as const satisfies readonly QueueName[];
