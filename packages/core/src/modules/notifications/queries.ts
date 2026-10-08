import { notImplemented } from "../../errors.js";
import type { Ctx } from "../../context.js";
import type { NotificationsDTO } from "./dto.js";

export async function listNotifications(_ctx: Ctx): Promise<NotificationsDTO[]> {
  return notImplemented("modules.notifications.queries.list");
}
