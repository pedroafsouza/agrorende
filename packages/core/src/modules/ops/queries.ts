import { notImplemented } from "../../errors.js";
import type { Ctx } from "../../context.js";
import type { OpsDTO } from "./dto.js";

export async function listOps(_ctx: Ctx): Promise<OpsDTO[]> {
  return notImplemented("modules.ops.queries.list");
}
