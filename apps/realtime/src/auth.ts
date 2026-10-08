import { jwtVerify } from "jose";
import { RoleEnum, type Role } from "@agrorende/contracts/enums";
import { AppError } from "@agrorende/contracts/errors";

export const REALTIME_AUDIENCE = "realtime";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidClaim(value: unknown): string | undefined {
  return typeof value === "string" && UUID.test(value) ? value : undefined;
}

export interface SocketAuthPayload {
  readonly userId: string;
  readonly orgId: string;
  readonly role: Role;
  readonly deviceId: string | null;
}

/** Verifies a `POST /auth/socket-token` JWT (`aud: "realtime"`, same `JWT_SECRET`). */
export async function verifySocketToken(token: string, jwtSecret: string): Promise<SocketAuthPayload> {
  try {
    const result = await jwtVerify(token, new TextEncoder().encode(jwtSecret), { audience: REALTIME_AUDIENCE, algorithms: ["HS256"] });
    const claims = result.payload;
    const userId = uuidClaim(claims.userId) ?? uuidClaim(claims.sub);
    const orgId = uuidClaim(claims.orgId);
    const role = RoleEnum.safeParse(claims.role);
    if (userId === undefined || orgId === undefined || !role.success) throw new Error("invalid claims");
    const deviceId = typeof claims.deviceId === "string" && claims.deviceId.length > 0 && claims.deviceId.length <= 200 ? claims.deviceId : null;
    return { userId, orgId, role: role.data, deviceId };
  } catch {
    throw new AppError("UNAUTHENTICATED", { message: "Invalid realtime socket token" });
  }
}

export function isOfficeRole(role: string): boolean {
  return role === "ADMIN" || role === "MANAGER";
}
