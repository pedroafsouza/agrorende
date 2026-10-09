import { withSyncTx, type SyncTx } from "@agrorende/db";

import { seedCtx } from "../../../../../packages/core/src/auth/testing/seeded";
import { assign, cancel, createManual } from "../../../../../packages/core/src/modules/workOrders/service";
import { SEED, type ChaosServer } from "./harness";

/** Office actions run directly against core services, as the admin web app would. */
export const office = seedCtx(SEED.manager, "MANAGER");

export function officeTx<T>(server: ChaosServer, fn: (tx: SyncTx) => Promise<T>): Promise<T> {
  return withSyncTx({ orgId: SEED.orgA }, fn, server.seeded.handle.db);
}

/** A corrective job assigned to the field technician, with no asset (no hour-meter rules). */
export async function createAssignedJob(server: ChaosServer, title = "Trocar mangueira", assigneeId: string = SEED.field): Promise<string> {
  const created = await officeTx(server, (tx) => createManual(tx, office, { type: "CORRECTIVE", priority: "HIGH", title }));
  await officeTx(server, (tx) => assign(tx, office, created.id, { assigneeId, confirmOffDuty: true }));
  return created.id;
}

export async function cancelJob(server: ChaosServer, id: string, reason = "Cliente desistiu"): Promise<void> {
  await officeTx(server, (tx) => cancel(tx, office, id, { reason }));
}
