import type { TechnicianSummary } from "@agrorende/contracts/seams";
import type { UserSetDutyPayload } from "@agrorende/contracts/mutations";
import { RealtimeServerEvents, opsRoom } from "@agrorende/contracts/realtime";

import type { Ctx } from "../../context.js";
import { reject } from "../../errors.js";
import { writeOutbox } from "../../notify/index.js";
import { txDb } from "../../sync/touch.js";
import type { SyncTx } from "../../sync/types.js";

/** Active (not disabled, archived or deleted) FIELD users of the organisation (seam `UserSeams.listActiveTechnicians`). */
export async function listActiveTechnicians(tx: SyncTx, _orgId: string): Promise<TechnicianSummary[]> {
  const docs = await txDb(tx)
    .users.find(
      { role: "FIELD", isActive: true, disabledAt: null, archivedAt: null, deletedAt: null },
      { projection: { name: 1, dutyStatus: 1, homeSiteId: 1 }, sort: { name: 1, _id: 1 } },
    )
    .toArray();
  return docs.map((doc) => ({
    id: doc._id,
    name: doc.name,
    dutyStatus: doc.dutyStatus,
    homeSiteId: doc.homeSiteId ?? null,
  }));
}

/**
 * `user.setDuty`: going ON_DUTY needs a recorded location consent or `consent: true` in the
 * payload (PLT-04); otherwise LOCATION_CONSENT_REQUIRED. Emits `operator:presence` to the ops room.
 */
export async function setDuty(tx: SyncTx, ctx: Ctx, payload: UserSetDutyPayload): Promise<void> {
  const db = txDb(tx);
  const user = await db.users.findOne({ _id: ctx.userId, deletedAt: null });
  if (user === null) reject("NOT_FOUND", { entityType: "USER", id: ctx.userId });
  const now = new Date();
  const hasConsent = user.locationConsentAt !== null && user.locationConsentAt !== undefined;
  if (payload.status === "ON_DUTY" && !hasConsent && payload.consent !== true) {
    reject("LOCATION_CONSENT_REQUIRED", {});
  }
  if (user.dutyStatus === payload.status && (hasConsent || payload.consent !== true)) return;
  await db.users.updateOne(
    { _id: ctx.userId },
    {
      $set: {
        dutyStatus: payload.status,
        dutyChangedAt: now,
        ...(payload.consent === true && !hasConsent ? { locationConsentAt: now } : {}),
        syncVersion: tx.syncVersion,
        updatedAt: now,
      },
    },
  );
  await writeOutbox(tx, RealtimeServerEvents.operatorPresence, {
    rooms: [opsRoom(tx.orgId)],
    data: { userId: ctx.userId, online: true, dutyStatus: payload.status, lastSeenAt: now.toISOString() },
  });
}
