import { randomInt } from "node:crypto";
import net from "node:net";

/**
 * The login rate limits of ARCHITECTURE §11 (10 per minute per IP, 5 per minute per e-mail) are real
 * in the E2E stack. Specs sign in far more often than a person would, so before each login the harness
 * removes the sliding-window keys of that e-mail from Redis and sends a fresh `X-Forwarded-For`.
 * The rate limits themselves stay covered by the unit tests in `packages/core`.
 */
export const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

function resp(args: readonly string[]): string {
  return `*${args.length}\r\n${args.map((arg) => `$${Buffer.byteLength(arg)}\r\n${arg}\r\n`).join("")}`;
}

async function redisCommand(args: readonly string[]): Promise<void> {
  const url = new URL(REDIS_URL);
  await new Promise<void>((resolve) => {
    const socket = net.connect({ host: url.hostname, port: Number(url.port || 6379) });
    const done = (): void => {
      socket.destroy();
      resolve();
    };
    socket.setTimeout(2_000, done);
    socket.once("error", done);
    socket.once("data", done);
    socket.once("connect", () => socket.write(resp(args)));
  });
}

export async function clearLoginLimits(email: string, ip?: string): Promise<void> {
  const keys = [`rl:login-email:${email.trim().toLowerCase()}`, "rl:login-ip:unknown", "rl:login-ip:::1", "rl:login-ip:127.0.0.1"];
  if (ip !== undefined) keys.push(`rl:login-ip:${ip}`);
  await redisCommand(["DEL", ...keys]);
}

/**
 * Company sign-up allows five per IP per day (TEN-01). Every E2E run signs up from localhost, so the
 * IP bucket is cleared first; the identity bucket never fills because each run uses a new subject.
 */
export async function clearSignupLimits(): Promise<void> {
  await redisCommand(["DEL", "rl:signup-ip:ip:::1", "rl:signup-ip:ip:127.0.0.1", "rl:signup-ip:ip:unknown", "rl:signup-ip:ip:::ffff:127.0.0.1"]);
}

/** A documentation-range address (RFC 5737) so each login has its own IP bucket. */
export function testIp(): string {
  return `203.0.113.${randomInt(1, 255)}`;
}
