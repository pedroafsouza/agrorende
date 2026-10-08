import { notImplemented } from "../../errors.js";
import type { Ctx } from "../../context.js";
import type { SyncTx } from "../../sync/types.js";

export async function ensureExportsService(_tx: SyncTx, _ctx: Ctx): Promise<void> {
  return notImplemented("modules.exports.service.ensure");
}
