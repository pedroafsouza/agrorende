export interface AuthConfig {
  readonly jwtSecret: string;
  readonly mediaUrlSecret: string;
  readonly appUrl: string;
  readonly redisUrl: string | null;
  readonly secureCookies: boolean;
  readonly appVersion: string;
}

export const ACCESS_TOKEN_TTL_S = 15 * 60;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const REFRESH_REUSE_GRACE_MS = 30 * 1000;
export const DRAIN_TOKEN_TTL_MS = 72 * 60 * 60 * 1000;
export const SOCKET_TOKEN_TTL_S = 5 * 60;
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const RESET_LINK_TTL_MS = 24 * 60 * 60 * 1000;
export const DRAIN_SCOPE = "sync:drain";
export const ACCESS_COOKIE = "ar_access";
export const REFRESH_COOKIE = "ar_refresh";
export const REFRESH_COOKIE_PATH = "/api/v1/auth";

let override: Partial<AuthConfig> | null = null;

/** Test seam: replaces selected configuration values until reset with `null`. */
export function setAuthConfigForTests(value: Partial<AuthConfig> | null): void {
  override = value;
}

export function authConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const appUrl = override?.appUrl ?? env.APP_URL ?? "http://localhost:3000";
  return {
    jwtSecret: override?.jwtSecret ?? env.JWT_SECRET ?? "",
    mediaUrlSecret: override?.mediaUrlSecret ?? env.MEDIA_URL_SECRET ?? env.JWT_SECRET ?? "",
    appUrl,
    redisUrl: override?.redisUrl === undefined ? (env.REDIS_URL ?? null) : override.redisUrl,
    secureCookies: override?.secureCookies ?? appUrl.startsWith("https://"),
    appVersion: override?.appVersion ?? env.APP_VERSION ?? env.npm_package_version ?? "0.0.0",
  };
}
