import { notImplemented } from "../../errors.js";
import type { Ctx } from "../../context.js";
import type { DevicesDTO } from "./dto.js";

export async function listDevices(_ctx: Ctx): Promise<DevicesDTO[]> {
  return notImplemented("modules.devices.queries.list");
}
