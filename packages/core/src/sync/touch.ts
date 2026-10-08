import type { EntityRef } from "@agrorende/contracts/dto";

import { notImplemented } from "../errors.js";
import type { SyncTx } from "./types.js";

export async function touchDependents(_tx: SyncTx, _entity: EntityRef): Promise<void> {
  return notImplemented("sync.touchDependents");
}
