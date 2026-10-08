import { DAY_MS, HOUR_MS, readNumber, readString, type Doc, type JobContext, type JobHandler } from "./index.js";

/**
 * `devices.staleSync` (ARCHITECTURE §10, EC-SYN-29): every 30 minutes, flags devices whose
 * oldest pending mutation is older than the organisation's `staleSyncAlertHours`, or that have
 * not synced for that long while their user is ON_DUTY. Each stale device alerts the
 * organisation's admins once per day (Redis `SET NX` per device and UTC day). The same rows are
 * the "devices unsynced" source of `GET /attention`.
 */

export const DEFAULT_STALE_SYNC_HOURS = 24;

export interface StaleDevice {
  readonly orgId: string;
  readonly deviceId: string;
  readonly userId: string;
  readonly reason: "PENDING_MUTATIONS" | "NO_SYNC_ON_DUTY";
}

function staleHours(org: Doc): number {
  const settings = org.settings;
  if (settings !== null && typeof settings === "object") {
    const hours = readNumber(settings as Doc, "staleSyncAlertHours");
    if (hours !== undefined && hours > 0) {
      return hours;
    }
  }
  return DEFAULT_STALE_SYNC_HOURS;
}

/** Stale devices of one organisation, without any side effect. */
export async function findStaleDevices(ctx: JobContext, org: Doc): Promise<StaleDevice[]> {
  const orgId = String(org._id);
  const cutoff = new Date(ctx.now.getTime() - staleHours(org) * HOUR_MS);
  const onDuty = (
    await ctx.platform
      .collection("users")
      .find({ organizationId: orgId, dutyStatus: "ON_DUTY", isActive: true, deletedAt: null }, { projection: { _id: 1 } })
      .toArray()
  ).map((row) => String(row._id));
  const devices = await ctx.platform
    .collection("devices")
    .find(
      {
        organizationId: orgId,
        $or: [
          { pendingMutations: { $gt: 0 }, oldestPendingAt: { $lt: cutoff } },
          { userId: { $in: onDuty }, $or: [{ lastSyncAt: { $lt: cutoff } }, { lastSyncAt: null, createdAt: { $lt: cutoff } }] },
        ],
      },
      { projection: { _id: 1, userId: 1, pendingMutations: 1, oldestPendingAt: 1 } },
    )
    .toArray();
  return devices.map((device) => {
    const oldest = device.oldestPendingAt;
    const pending = (readNumber(device, "pendingMutations") ?? 0) > 0 && oldest instanceof Date && oldest < cutoff;
    return { orgId, deviceId: String(device._id), userId: readString(device, "userId") ?? "", reason: pending ? "PENDING_MUTATIONS" : "NO_SYNC_ON_DUTY" };
  });
}

function dedupeKey(ctx: JobContext, deviceId: string): string {
  return `${ctx.platform.keyPrefix}:stale-device:${deviceId}:${ctx.now.toISOString().slice(0, 10)}`;
}

async function admins(ctx: JobContext, orgId: string): Promise<string[]> {
  const rows = await ctx.platform
    .collection("users")
    .find({ organizationId: orgId, role: "ADMIN", isActive: true, deletedAt: null }, { projection: { _id: 1 } })
    .toArray();
  return rows.map((row) => String(row._id));
}

export const handler: JobHandler = async (ctx) => {
  const orgs = await ctx.platform
    .collection("organizations")
    .find({ status: { $nin: ["SUSPENDED", "CANCELLED"] }, deletedAt: null }, { projection: { _id: 1, settings: 1 } })
    .toArray();
  let stale = 0;
  let alerted = 0;
  for (const org of orgs) {
    const devices = await findStaleDevices(ctx, org);
    stale += devices.length;
    if (devices.length === 0) {
      continue;
    }
    const recipients = await admins(ctx, String(org._id));
    for (const device of devices) {
      const key = dedupeKey(ctx, device.deviceId);
      if ((await ctx.platform.redis.set(key, "1", "PX", 2 * DAY_MS, "NX")) !== "OK") {
        continue;
      }
      if (recipients.length === 0) {
        continue;
      }
      const user = await ctx.platform.collection("users").findOne({ _id: device.userId, organizationId: device.orgId }, { projection: { name: 1 } });
      try {
        await ctx.platform.notify(device.orgId, {
          type: "DEVICE_STALE_SYNC",
          userIds: recipients,
          entity: { entityType: "DEVICE", entityId: device.deviceId },
          params: { name: user === null ? "" : (readString(user, "name") ?? "") },
        });
        alerted += 1;
      } catch (error) {
        await ctx.platform.redis.del(key);
        throw error;
      }
    }
  }
  ctx.logger.info("attention.device_stale", { stale, alerted });
  return { stale, alerted };
};
