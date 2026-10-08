import type { Role } from "@agrorende/contracts/enums";

import type { Ctx } from "./context.js";

export const ANY_ROLE: readonly Role[] = ["ADMIN", "MANAGER", "FIELD"] as const;
export const OFFICE_ROLES: readonly Role[] = ["ADMIN", "MANAGER"] as const;

export function hasRole(ctx: Pick<Ctx, "role">, roles: readonly Role[] | "ANY"): boolean {
  return roles === "ANY" || roles.includes(ctx.role);
}
