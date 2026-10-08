import { notImplemented } from "../../errors.js";
import type { Ctx } from "../../context.js";
import type { LocationsDTO } from "./dto.js";

export async function listLocations(_ctx: Ctx): Promise<LocationsDTO[]> {
  return notImplemented("modules.locations.queries.list");
}
