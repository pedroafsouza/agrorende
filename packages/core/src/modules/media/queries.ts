import { notImplemented } from "../../errors.js";
import type { Ctx } from "../../context.js";
import type { MediaDTO } from "./dto.js";

export async function listMedia(_ctx: Ctx): Promise<MediaDTO[]> {
  return notImplemented("modules.media.queries.list");
}
