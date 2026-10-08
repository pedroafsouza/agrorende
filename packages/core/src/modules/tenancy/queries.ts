import { notImplemented } from "../../errors.js";
import type { Ctx } from "../../context.js";
import type { TenancyDTO } from "./dto.js";

export async function listTenancy(_ctx: Ctx): Promise<TenancyDTO[]> {
  return notImplemented("modules.tenancy.queries.list");
}
