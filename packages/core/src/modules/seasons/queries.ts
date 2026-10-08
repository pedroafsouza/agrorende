import { notImplemented } from "../../errors.js";
import type { Ctx } from "../../context.js";
import type { SeasonsDTO } from "./dto.js";

export async function listSeasons(_ctx: Ctx): Promise<SeasonsDTO[]> {
  return notImplemented("modules.seasons.queries.list");
}
