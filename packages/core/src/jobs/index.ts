import { notImplemented } from "../errors.js";

export const JOB_NAMES = ["events.dispatch", "media.cleanupPending", "locations.prune"] as const;
export type JobName = (typeof JOB_NAMES)[number];

export async function enqueueJob(_name: JobName, _payload: Readonly<Record<string, unknown>>): Promise<void> {
  return notImplemented("jobs.enqueueJob");
}
