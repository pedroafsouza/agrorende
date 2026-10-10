import { randomUUID } from "node:crypto";

import { AppError } from "@agrorende/contracts/errors";
import { Redis } from "ioredis";

import { authConfig } from "./config";

export interface RateLimitRule {
  readonly name: string;
  readonly limit: number;
  readonly windowMs: number;
}

export interface RateLimiter {
  /** Records one hit and returns the milliseconds to wait when the limit is exceeded, else null. */
  hit(key: string, rule: RateLimitRule, now?: number): Promise<number | null>;
}

/** ARCHITECTURE §11 rate limits. */
export const RATE_LIMITS = {
  loginIp: { name: "login-ip", limit: 10, windowMs: 60_000 },
  loginEmail: { name: "login-email", limit: 5, windowMs: 60_000 },
  push: { name: "push", limit: 60, windowMs: 60_000 },
  media: { name: "media", limit: 600, windowMs: 60_000 },
  telemetry: { name: "telemetry", limit: 60, windowMs: 60_000 },
  default: { name: "default", limit: 300, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitRule>;

export function memoryRateLimiter(): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    async hit(key, rule, now = Date.now()) {
      const id = `${rule.name}:${key}`;
      const recent = (hits.get(id) ?? []).filter((at) => at > now - rule.windowMs);
      recent.push(now);
      hits.set(id, recent);
      if (recent.length <= rule.limit) return null;
      const oldest = recent[recent.length - rule.limit - 1] ?? now;
      return Math.max(1, oldest + rule.windowMs - now);
    },
  };
}

/** Sliding window on a Redis sorted set; fails open when Redis is unavailable. */
export function redisRateLimiter(redis: Redis): RateLimiter {
  return {
    async hit(key, rule, now = Date.now()) {
      const id = `rl:${rule.name}:${key}`;
      try {
        const result = await redis
          .multi()
          .zremrangebyscore(id, 0, now - rule.windowMs)
          .zadd(id, now, `${now}:${randomUUID()}`)
          .zcard(id)
          .pexpire(id, rule.windowMs)
          .zrange(id, "0", "0", "WITHSCORES")
          .exec();
        const count = Number(result?.[2]?.[1] ?? 0);
        if (count <= rule.limit) return null;
        const oldestEntry = result?.[4]?.[1];
        const oldest = Array.isArray(oldestEntry) ? Number(oldestEntry[1]) : now;
        return Math.max(1, oldest + rule.windowMs - now);
      } catch {
        return null;
      }
    },
  };
}

let shared: RateLimiter | null = null;

export function setRateLimiter(limiter: RateLimiter | null): void {
  shared = limiter;
}

export function rateLimiter(): RateLimiter {
  if (shared !== null) return shared;
  const url = authConfig().redisUrl;
  shared = url === null ? memoryRateLimiter() : redisRateLimiter(new Redis(url, { maxRetriesPerRequest: 1 }));
  return shared;
}

/** Throws `RATE_LIMITED` (429) with `retryAfterMs` when the key is over its limit. */
export async function enforceRateLimit(key: string, rule: RateLimitRule, limiter: RateLimiter = rateLimiter()): Promise<void> {
  const wait = await limiter.hit(key, rule);
  if (wait !== null) {
    throw new AppError("RATE_LIMITED", { details: { retryAfterMs: wait, rule: rule.name } });
  }
}
