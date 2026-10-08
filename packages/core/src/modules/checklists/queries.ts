import { notImplemented } from "../../errors.js";
import type { Ctx } from "../../context.js";
import type { ChecklistsDTO } from "./dto.js";

export async function listChecklists(_ctx: Ctx): Promise<ChecklistsDTO[]> {
  return notImplemented("modules.checklists.queries.list");
}
