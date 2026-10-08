import { notImplemented } from "../../errors.js";
import type { Ctx } from "../../context.js";
import type { MaintenanceDTO } from "./dto.js";

export async function listMaintenance(_ctx: Ctx): Promise<MaintenanceDTO[]> {
  return notImplemented("modules.maintenance.queries.list");
}
