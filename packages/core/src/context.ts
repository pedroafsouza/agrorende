import type { Ctx as ContractCtx } from "@agrorende/contracts/seams";
import type { Role } from "@agrorende/contracts/enums";

import { reject } from "./errors.js";

export interface Ctx extends ContractCtx {
  readonly organizationId: string;
  readonly orgId: string;
  readonly userId: string;
  readonly role: Role;
  readonly deviceId?: string | null;
  readonly requestId?: string;
}

export function normalizeCtx(ctx: ContractCtx & { readonly orgId?: string; readonly requestId?: string }): Ctx {
  return {
    ...ctx,
    orgId: ctx.orgId ?? ctx.organizationId,
  };
}

export function requireRole(ctx: Pick<Ctx, "role">, roles: readonly Role[]): void {
  if (!roles.includes(ctx.role)) {
    reject("FORBIDDEN", { role: ctx.role, roles });
  }
}
