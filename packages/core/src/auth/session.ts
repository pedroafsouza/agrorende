import type { Ctx } from "../context.js";
import { notImplemented } from "../errors.js";

export interface SessionPrincipal {
  readonly userId: string;
  readonly organizationId: string;
  readonly role: Ctx["role"];
  readonly deviceId?: string | null;
}

export async function getSessionContext(_token: string): Promise<Ctx> {
  return notImplemented("auth.getSessionContext");
}

export async function issueDrainToken(_principal: SessionPrincipal): Promise<string> {
  return notImplemented("auth.issueDrainToken");
}
