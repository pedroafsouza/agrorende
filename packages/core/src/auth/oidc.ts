import { AppError } from "@agrorende/contracts/errors";
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";
import { z } from "zod";

/** Production Apple issuer; any other `APPLE_OIDC_ISSUER` is treated as the local mock. */
export const APPLE_PRODUCTION_ISSUER = "https://appleid.apple.com";

export interface OAuthConfig {
  readonly google: { readonly issuer: string; readonly clientId: string; readonly clientSecret: string };
  readonly apple: {
    readonly issuer: string;
    /** Web Services ID used by the browser flow. */
    readonly servicesId: string;
    /** Client id used for revocation when the stored token does not carry its own. */
    readonly clientId: string;
    readonly bundleIds: readonly string[];
    readonly teamId: string;
    readonly keyId: string;
    readonly privateKey: string;
  };
  /** 64 hex characters (AES-256-GCM key for provider refresh tokens). */
  readonly encryptionKey: string;
  /** Allowed custom schemes for the mobile redirect (`OAUTH_MOBILE_SCHEMES`). */
  readonly mobileSchemes: readonly string[];
}

let override: Partial<OAuthConfig> | null = null;

/** Test seam: replaces selected OAuth configuration values until reset with `null`. */
export function setOAuthConfigForTests(value: Partial<OAuthConfig> | null): void {
  override = value;
  discoveries.clear();
}

function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function trimIssuer(value: string): string {
  return value.trim().replace(/\/$/, "");
}

export function oauthConfig(env: NodeJS.ProcessEnv = process.env): OAuthConfig {
  const appleClientId = env.APPLE_CLIENT_ID ?? env.APPLE_SERVICES_ID ?? "";
  return {
    google: override?.google ?? {
      issuer: trimIssuer(env.GOOGLE_OIDC_ISSUER ?? "https://accounts.google.com"),
      clientId: env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: env.GOOGLE_CLIENT_SECRET ?? "",
    },
    apple: override?.apple ?? {
      issuer: trimIssuer(env.APPLE_OIDC_ISSUER ?? APPLE_PRODUCTION_ISSUER),
      servicesId: env.APPLE_SERVICES_ID ?? appleClientId,
      clientId: appleClientId,
      bundleIds: list(env.APPLE_BUNDLE_IDS),
      teamId: env.APPLE_TEAM_ID ?? "",
      keyId: env.APPLE_KEY_ID ?? "",
      privateKey: env.APPLE_PRIVATE_KEY ?? "",
    },
    encryptionKey: override?.encryptionKey ?? env.AUTH_ENCRYPTION_KEY ?? "",
    mobileSchemes: override?.mobileSchemes ?? list(env.OAUTH_MOBILE_SCHEMES ?? "agrorende,agrorende-dev,agrorende-preview"),
  };
}

export interface Discovery {
  readonly issuer: string;
  readonly authorization_endpoint: string;
  readonly token_endpoint: string;
  readonly jwks_uri: string;
  readonly revocation_endpoint?: string | undefined;
}

const DiscoverySchema = z.object({
  issuer: z.string().url(),
  authorization_endpoint: z.string().url(),
  token_endpoint: z.string().url(),
  jwks_uri: z.string().url(),
  revocation_endpoint: z.string().url().optional(),
});

const discoveries = new Map<string, Promise<Discovery>>();
const keySets = new Map<string, JWTVerifyGetKey>();

/** OIDC discovery (`<issuer>/.well-known/openid-configuration`), cached per issuer on success. */
export async function discover(issuer: string): Promise<Discovery> {
  const key = trimIssuer(issuer);
  const cached = discoveries.get(key);
  if (cached !== undefined) return cached;
  const pending = (async () => {
    try {
      const response = await fetch(`${key}/.well-known/openid-configuration`, { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(`discovery ${response.status}`);
      return DiscoverySchema.parse(await response.json());
    } catch {
      throw new AppError("OAUTH_PROVIDER_ERROR", { details: { reason: "discovery_failed" } });
    }
  })();
  discoveries.set(key, pending);
  pending.catch(() => discoveries.delete(key));
  return pending;
}

function keySet(jwksUri: string): JWTVerifyGetKey {
  let keys = keySets.get(jwksUri);
  if (keys === undefined) {
    keys = createRemoteJWKSet(new URL(jwksUri));
    keySets.set(jwksUri, keys);
  }
  return keys;
}

export const ID_TOKEN_CLOCK_TOLERANCE_S = 60;

/** Verifies an ID token against the issuer's JWKS: signature, issuer, audience and expiry. */
export async function verifyIdToken(issuer: string, idToken: string, audience: string | readonly string[], now: Date = new Date()): Promise<JWTPayload> {
  const discovery = await discover(issuer);
  try {
    const { payload } = await jwtVerify(idToken, keySet(discovery.jwks_uri), {
      issuer: discovery.issuer,
      audience: typeof audience === "string" ? audience : [...audience],
      currentDate: now,
      // Provider clocks can run slightly ahead, and nbf/iat are whole seconds.
      clockTolerance: ID_TOKEN_CLOCK_TOLERANCE_S,
    });
    return payload;
  } catch {
    throw new AppError("OAUTH_PROVIDER_ERROR", { details: { reason: "id_token_invalid" } });
  }
}

export function claimBoolean(value: unknown): boolean {
  return value === true || value === "true";
}

export function claimString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
