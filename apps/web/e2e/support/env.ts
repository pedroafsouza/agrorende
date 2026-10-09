import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The isolated E2E stack (ARCHITECTURE §15, DELIVERY-PLAN T11): web on 3100, realtime on 4101 and the
 * navikt mock OIDC provider on 4103, against `agrorende_e2e` and `.data/media-e2e`. These ports and
 * names never collide with `pnpm dev` (3000/4001/4002, `agrorende`) or the T18 container check
 * (3200/4201/4202, `agrorende_t18`).
 */
export const WEB_PORT = 3100;
export const REALTIME_PORT = 4101;
export const OIDC_PORT = 4103;
export const E2E_DB = "agrorende_e2e";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
export const MEDIA_ROOT_ABS = path.join(REPO_ROOT, ".data/media-e2e");
/** Screenshots for the `ui-reviewer` gate (T11.11). */
export const REVIEW_DIR = path.join(REPO_ROOT, ".data/reviews/T11");

export const WEB_URL = `http://localhost:${WEB_PORT}`;
export const REALTIME_URL = `http://localhost:${REALTIME_PORT}`;
export const OIDC_URL = `http://localhost:${OIDC_PORT}`;
export const GOOGLE_ISSUER = `${OIDC_URL}/google`;
export const APPLE_ISSUER = `${OIDC_URL}/apple`;
export const OIDC_CONTAINER = "agrorende-e2e-oidc";

/** Same mock configuration as the root compose `oidc-mock` service, on its own port. */
export const OIDC_JSON_CONFIG = JSON.stringify({
  interactiveLogin: true,
  httpServer: "NettyWrapper",
  tokenCallbacks: [
    { issuerId: "google", tokenExpiry: 3600, requestMappings: [] },
    { issuerId: "apple", tokenExpiry: 3600, requestMappings: [] },
  ],
});

/** Environment shared by the web server, the realtime service, global setup and the specs. */
export const E2E_ENV: Readonly<Record<string, string>> = {
  APP_ENV: "local",
  MONGODB_DB: E2E_DB,
  MEDIA_DRIVER: "local",
  MEDIA_ROOT: MEDIA_ROOT_ABS,
  APP_URL: WEB_URL,
  REALTIME_PORT: String(REALTIME_PORT),
  REALTIME_CORS_ORIGINS: WEB_URL,
  NEXT_PUBLIC_REALTIME_URL: REALTIME_URL,
  NEXT_DIST_DIR: ".next/e2e",
  GOOGLE_OIDC_ISSUER: GOOGLE_ISSUER,
  APPLE_OIDC_ISSUER: APPLE_ISSUER,
  // The mock provider accepts any client; these are the public local values from `.env.example`.
  GOOGLE_CLIENT_ID: "agrorende-local",
  PLATFORM_ADMIN_EMAILS: "staff@agrorende.dev",
  GOOGLE_CLIENT_SECRET: "agrorende-local-secret",
  NEXT_TELEMETRY_DISABLED: "1",
  REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
};

/** Seed logins (ARCHITECTURE §17). */
export const SEED_PASSWORD = "agrorende123";
export const SEED = {
  admin: "admin@agrorende.dev",
  manager: "gerente@agrorende.dev",
  dispatcher: "despacho@agrorende.dev",
  inspector: "inspetor@agrorende.dev",
  tech1: "tecnico1@agrorende.dev",
  tech2: "tecnico2@agrorende.dev",
  rental: "locacao@agrorende.dev",
  invited: "convite@agrorende.dev",
  orgBAdmin: "admin@boavista.dev",
  staff: "staff@agrorende.dev",
} as const;
export const SEED_INVITE_CODE = "K7QM2XPA9F";
