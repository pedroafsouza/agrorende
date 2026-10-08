import type { EntityRef } from "@agrorende/contracts/dto";
import type { ScopedDb, SyncTx as DbSyncTx } from "@agrorende/db";

import type { SyncTx } from "./types.js";

/** The kernel `SyncTx` keeps `db` and `session` opaque; every T02 module reads them through this view. */
export function dbTx(tx: SyncTx): DbSyncTx {
  return tx as unknown as DbSyncTx;
}

export function txDb(tx: SyncTx): ScopedDb {
  return dbTx(tx).db;
}

async function touchWorkOrder(tx: SyncTx, workOrderId: string): Promise<void> {
  const db = txDb(tx);
  const bump = { $set: { syncVersion: tx.syncVersion } };
  const workOrder = await db.work_orders.findOne({ _id: workOrderId }, { projection: { fieldReportId: 1 } });
  if (workOrder === null) {
    return;
  }
  await db.work_order_parts.updateMany({ workOrderId }, bump);
  await db.media.updateMany({ "parent.type": "WORK_ORDER", "parent.id": workOrderId }, bump);
  await db.activity_events.updateMany({ entityType: "WORK_ORDER", entityId: workOrderId }, bump);
  const reportId = workOrder.fieldReportId ?? null;
  if (reportId !== null) {
    await db.field_reports.updateOne({ _id: reportId }, bump);
    await db.media.updateMany({ "parent.type": "FIELD_REPORT", "parent.id": reportId }, bump);
    await db.activity_events.updateMany({ entityType: "FIELD_REPORT", entityId: reportId }, bump);
  }
}

async function touchRental(tx: SyncTx, rentalId: string): Promise<void> {
  const db = txDb(tx);
  const bump = { $set: { syncVersion: tx.syncVersion } };
  const rental = await db.rentals.findOne({ _id: rentalId }, { projection: { assetId: 1 } });
  if (rental === null) {
    return;
  }
  const damages = await db.damages
    .find({ assetId: rental.assetId, repairedAt: null, deletedAt: null }, { projection: { _id: 1 } })
    .toArray();
  const damageIds = damages.map((damage) => damage._id);
  if (damageIds.length === 0) {
    return;
  }
  await db.damages.updateMany({ _id: { $in: damageIds } }, bump);
  await db.media.updateMany({ damageId: { $in: damageIds } }, bump);
}

/**
 * Bumps `syncVersion` on the dependents of an entity that just entered a user's pull scope
 * (ARCHITECTURE §7.5), inside the caller's transaction.
 */
export async function touchDependents(tx: SyncTx, entity: EntityRef): Promise<void> {
  switch (entity.entityType) {
    case "WORK_ORDER":
      await touchWorkOrder(tx, entity.entityId);
      return;
    case "RENTAL":
      await touchRental(tx, entity.entityId);
      return;
    default:
      return;
  }
}
