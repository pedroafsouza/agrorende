import type { EntityRef } from "@agrorende/contracts/dto";

import { notImplemented } from "../errors.js";
import type { SyncTx } from "../sync/types.js";

export interface DomainEvent {
  readonly id: string;
  readonly type: string;
  readonly organizationId: string;
  readonly entity: EntityRef;
  readonly occurredAt: Date;
  readonly payload: Readonly<Record<string, unknown>>;
}

export async function emit(_tx: SyncTx, _event: DomainEvent): Promise<void> {
  return notImplemented("events.emit");
}

export async function dispatchPending(): Promise<void> {
  return notImplemented("events.dispatchPending");
}
