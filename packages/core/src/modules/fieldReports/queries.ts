import { notImplemented } from "../../errors.js";
import type { Ctx } from "../../context.js";
import type { FieldreportsDTO } from "./dto.js";

export async function listFieldreports(_ctx: Ctx): Promise<FieldreportsDTO[]> {
  return notImplemented("modules.fieldReports.queries.list");
}
