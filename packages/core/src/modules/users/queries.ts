import { getDb, scoped } from "@agrorende/db";

import type { Ctx } from "../../context.js";
import { toUserDto, type UserDTO } from "./dto.js";

export interface ListUsersQuery {
  readonly role?: string;
  readonly includeArchived?: boolean;
}

/** Users of the caller's organisation, redacted for the viewer. */
export async function listUsers(ctx: Ctx, query: ListUsersQuery = {}): Promise<UserDTO[]> {
  const db = scoped({ orgId: ctx.orgId }, await getDb());
  const filter: Record<string, unknown> = { deletedAt: null };
  if (query.role !== undefined) filter.role = query.role;
  if (query.includeArchived !== true) filter.archivedAt = null;
  const docs = await db.users.find(filter, { sort: { name: 1, _id: 1 } }).toArray();
  return docs.map((doc) => toUserDto(doc, ctx));
}
