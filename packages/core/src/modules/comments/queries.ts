import { notImplemented } from "../../errors.js";
import type { Ctx } from "../../context.js";
import type { CommentsDTO } from "./dto.js";

export async function listComments(_ctx: Ctx): Promise<CommentsDTO[]> {
  return notImplemented("modules.comments.queries.list");
}
