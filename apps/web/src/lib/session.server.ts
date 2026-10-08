import "server-only";

import { cookies } from "next/headers";

import { verifyAccessToken } from "@agrorende/core";
import type { Role } from "@agrorende/contracts/enums";

export interface WebSession {
  readonly userId: string;
  readonly orgId: string;
  readonly role: Role;
}

/** Reads the `ar_access` cookie for server components; null when absent or expired (the client refreshes). */
export async function readSession(): Promise<WebSession | null> {
  const token = (await cookies()).get("ar_access")?.value;
  const secret = process.env.JWT_SECRET;
  if (token === undefined || secret === undefined || secret.length === 0) return null;
  try {
    const claims = await verifyAccessToken(token, { secret });
    return { userId: claims.sub, orgId: claims.orgId, role: claims.role };
  } catch {
    return null;
  }
}
