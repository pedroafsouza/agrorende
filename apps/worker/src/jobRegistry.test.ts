import { describe, expect, it } from "vitest";

import { JOB_NAMES, JOB_REGISTRY } from "./jobRegistry.js";
import { JOB_PROCESSORS } from "./processors.js";

const documentedJobNames = [
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

describe("job registry", () => {
  it("covers every documented worker job name", () => {
    expect(JOB_NAMES).toEqual([...documentedJobNames]);
    expect(Object.keys(JOB_REGISTRY)).toEqual([...documentedJobNames]);
    expect(Object.keys(JOB_PROCESSORS)).toEqual([...documentedJobNames]);
  });
});
