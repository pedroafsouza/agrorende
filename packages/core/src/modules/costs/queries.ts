import { notImplemented } from "../../errors.js";
import type { Ctx } from "../../context.js";
import type { CostsDTO } from "./dto.js";

export async function listCosts(_ctx: Ctx): Promise<CostsDTO[]> {
  return notImplemented("modules.costs.queries.list");
}
