import { notImplemented } from "../../errors.js";
import type { Ctx } from "../../context.js";
import type { AssetsDTO } from "./dto.js";

export async function listAssets(_ctx: Ctx): Promise<AssetsDTO[]> {
  return notImplemented("modules.assets.queries.list");
}
