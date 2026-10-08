import type { Role } from "@agrorende/contracts/enums";

import type { Ctx } from "../context.js";
import { normalizeCtx } from "../context.js";

export interface TestCtxInput {
  readonly organizationId?: string;
  readonly orgId?: string;
  readonly userId?: string;
  readonly role?: Role;
  readonly deviceId?: string | null;
  readonly requestId?: string;
  readonly now?: Date;
}

export interface TestCtx extends Ctx {
  readonly now: Date;
}

export function makeTestCtx(input: TestCtxInput = {}): TestCtx {
  const organizationId = input.organizationId ?? input.orgId ?? "00000000-0000-7000-8000-000000000001";
  return {
    ...normalizeCtx({
      organizationId,
      orgId: input.orgId ?? organizationId,
      userId: input.userId ?? "00000000-0000-7000-8000-000000000002",
      role: input.role ?? "ADMIN",
      deviceId: input.deviceId ?? "00000000-0000-7000-8000-000000000003",
      requestId: input.requestId,
    }),
    now: input.now ?? new Date("2026-10-08T00:00:00.000Z"),
  };
}
