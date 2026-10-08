import { notImplemented } from "../../errors.js";
import type { Ctx } from "../../context.js";
import type { FuelDTO } from "./dto.js";

export async function listFuel(_ctx: Ctx): Promise<FuelDTO[]> {
  return notImplemented("modules.fuel.queries.list");
}
