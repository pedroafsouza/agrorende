import { notImplemented } from "../../errors.js";
import type { Ctx } from "../../context.js";
import type { ExportsDTO } from "./dto.js";

export async function listExports(_ctx: Ctx): Promise<ExportsDTO[]> {
  return notImplemented("modules.exports.queries.list");
}
