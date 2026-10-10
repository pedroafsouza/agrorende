import type { Ctx as ContractCtx } from "@agrorende/contracts/seams";
import type { Role } from "@agrorende/contracts/enums";
import { AppError } from "@agrorende/contracts/errors";

import { reject } from "./errors";

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

/** Marks a seam owned by a later task (rule R11). Only W6 placeholders may still call it. */
export function notImplemented(feature: string): never {
  throw new AppError("INTERNAL", { message: "NOT_IMPLEMENTED", details: { feature } });
}
