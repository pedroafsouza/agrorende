import { notImplemented } from "../../errors.js";
import type { Ctx } from "../../context.js";
import type { SitesDTO } from "./dto.js";

export async function listSites(_ctx: Ctx): Promise<SitesDTO[]> {
  return notImplemented("modules.sites.queries.list");
}
