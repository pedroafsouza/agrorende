import { notImplemented } from "../../errors.js";
import type { Ctx } from "../../context.js";
import type { PartsDTO } from "./dto.js";

export async function listParts(_ctx: Ctx): Promise<PartsDTO[]> {
  return notImplemented("modules.parts.queries.list");
}
