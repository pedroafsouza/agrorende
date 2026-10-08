import { getMirrorRow, patchMirrorRow, upsertMirrorRow } from "../../db/mirror";
import { defineMutator, writeOptimisticMedia } from "../mutator";

export type { LocalMutationResult } from "../mutator";

/**
 * `fieldReport.create` (F1, §7.2): the report shows up in My reports immediately as SUBMITTED
 * with its evidence; the server assigns the number and the asset flags on push.
 */
export const createReport = defineMutator({
  name: "fieldReport.create",
  entityType: "FIELD_REPORT",
  entityId: (payload) => payload.id,
  apply: async (tx, payload, ctx) => {
    const existing = await getMirrorRow(tx, "fieldReports", payload.id);
    await upsertMirrorRow(
      tx,
      "fieldReports",
      {
        id: payload.id,
        organizationId: existing?.organizationId ?? "",
        syncVersion: existing?.syncVersion ?? 0,
        createdAt: existing?.createdAt ?? ctx.now,
        updatedAt: ctx.now,
        deletedAt: null,
        number: existing?.number ?? null,
        reporterId: ctx.runtime.userId,
        assetId: payload.assetId ?? null,
        unregisteredAssetDesc: payload.unregisteredAssetDesc ?? null,
        siteId: payload.siteId ?? null,
        plotId: payload.plotId ?? null,
        seasonId: existing?.seasonId ?? null,
        rentalId: existing?.rentalId ?? null,
        damageId: null,
        category: payload.category,
        priority: payload.priority,
        machineOperable: payload.machineOperable,
        suggestedAction: payload.suggestedAction,
        title: payload.title,
        description: payload.description ?? null,
        status: existing?.status ?? "SUBMITTED",
        statusReason: existing?.statusReason ?? null,
        lat: payload.lat ?? null,
        lng: payload.lng ?? null,
        accuracyM: payload.accuracyM ?? null,
        occurredAt: existing?.occurredAt ?? ctx.now,
        receivedAt: existing?.receivedAt ?? null,
        reviewedById: existing?.reviewedById ?? null,
        reviewedAt: existing?.reviewedAt ?? null,
        workOrderId: existing?.workOrderId ?? null,
        flags: existing?.flags ?? (payload.locationAdjusted === true ? { locationAdjusted: true } : {}),
      },
      1,
    );
    await writeOptimisticMedia(tx, payload.media, ctx);
  },
});

/** `fieldReport.update` (P1, FR-11): reporter edits while the report is still SUBMITTED. */
export const updateReport = defineMutator({
  name: "fieldReport.update",
  entityType: "FIELD_REPORT",
  entityId: (payload) => payload.id,
  apply: async (tx, payload, ctx) => {
    const patch: Record<string, unknown> = { updatedAt: ctx.now };
    for (const [key, value] of Object.entries(payload.patch)) if (value !== undefined) patch[key] = value;
    await patchMirrorRow(tx, "fieldReports", payload.id, patch);
  },
});

/** `fieldReport.withdraw`: SUBMITTED → DISMISSED with `WITHDRAWN: <reason>`, as the server does. */
export const withdrawReport = defineMutator({
  name: "fieldReport.withdraw",
  entityType: "FIELD_REPORT",
  entityId: (payload) => payload.id,
  apply: async (tx, payload, ctx) => {
    const existing = await getMirrorRow(tx, "fieldReports", payload.id);
    const flags = typeof existing?.flags === "object" && existing.flags !== null ? (existing.flags as Record<string, unknown>) : {};
    await patchMirrorRow(tx, "fieldReports", payload.id, {
      status: "DISMISSED",
      statusReason: `WITHDRAWN: ${payload.reason}`,
      flags: { ...flags, withdrawn: true },
      updatedAt: ctx.now,
    });
  },
});
