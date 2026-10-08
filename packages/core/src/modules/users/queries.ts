import { notImplemented } from "../../errors.js";
import type { Ctx } from "../../context.js";
import type { UsersDTO } from "./dto.js";

export async function listUsers(_ctx: Ctx): Promise<UsersDTO[]> {
  return notImplemented("modules.users.queries.list");
}
