import type { z } from "zod";
import type { ErrorCode } from "@agrorende/contracts/errors";
import type { MutationName } from "@agrorende/contracts/sync";
import type { Role } from "@agrorende/contracts/enums";

import type { Ctx } from "../context.js";
import type { DomainEvent } from "../events/index.js";

export interface SyncTx {
  readonly session: unknown;
  readonly syncVersion: number;
  readonly orgId: string;
  readonly db: unknown;
}

export interface MutationMeta {
  readonly mutationId: string;
  readonly deviceId: string;
  readonly occurredAt: Date;
  readonly receivedAt: Date;
  readonly lat?: number;
  readonly lng?: number;
  readonly clockSkewed: boolean;
}

export interface MutationOutcome {
  readonly assigned?: Record<string, string>;
  readonly events?: readonly DomainEvent[];
}

export type AccessGate = "any" | "anyoneWithParentAccess" | "reporter" | "capturer" | "assignee" | "assigneeOrPrevious" | "self";

export interface MutationHandler<P> {
  readonly schema: z.ZodType<P>;
  readonly allowedRoles: readonly Role[] | "ANY";
  readonly access: AccessGate;
  readonly rejectionCodes: readonly ErrorCode[];
  apply(tx: SyncTx, ctx: Ctx, payload: P, meta: MutationMeta): Promise<MutationOutcome>;
}

export type MutationRegistry = Record<MutationName, MutationHandler<unknown>>;
