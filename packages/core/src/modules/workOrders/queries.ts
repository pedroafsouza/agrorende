import { notImplemented } from "../../errors.js";
import type { Ctx } from "../../context.js";
import type { WorkordersDTO } from "./dto.js";

export async function listWorkorders(_ctx: Ctx): Promise<WorkordersDTO[]> {
  return notImplemented("modules.workOrders.queries.list");
}
