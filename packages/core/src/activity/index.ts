import type { EntityRef } from "@agrorende/contracts/dto";

import { notImplemented } from "../errors.js";
import type { SyncTx } from "../sync/types.js";

export interface ActivityInput {
  readonly actorId: string;
  readonly entity: EntityRef;
  readonly action: string;
  readonly at: Date;
  readonly params?: Readonly<Record<string, string | number | boolean | null>>;
}

export async function recordActivity(_tx: SyncTx, _input: ActivityInput): Promise<void> {
  return notImplemented("activity.recordActivity");
}
