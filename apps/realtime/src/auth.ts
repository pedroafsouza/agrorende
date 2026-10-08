import { jwtVerify } from "jose";
import { z } from "zod";

import { AppError } from "@agrorende/contracts/errors";

const SocketAuthPayloadSchema = z.object({
  userId: z.string().uuid(),
  orgId: z.string().uuid(),
  role: z.string().min(1),
});

export type SocketAuthPayload = z.infer<typeof SocketAuthPayloadSchema>;

export async function verifySocketToken(token: string, jwtSecret: string): Promise<SocketAuthPayload> {
  try {
    const secret = new TextEncoder().encode(jwtSecret);
    const result = await jwtVerify(token, secret, { audience: "realtime" });
    return SocketAuthPayloadSchema.parse(result.payload);
  } catch (error) {
    throw new AppError("UNAUTHENTICATED", {
      message: "Invalid realtime socket token",
      details: error instanceof Error ? { cause: error.message } : undefined,
    });
  }
}

export function isOfficeRole(role: string): boolean {
  return role === "ADMIN" || role === "MANAGER";
}
