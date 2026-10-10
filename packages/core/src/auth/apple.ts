import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { AppError } from "@agrorende/contracts/errors";
import { collections, getDb } from "@agrorende/db";
import { importPKCS8, SignJWT } from "jose";
import { z } from "zod";

import { APPLE_PRODUCTION_ISSUER, discover, oauthConfig, type OAuthConfig } from "./oidc";

/**
 * Sign in with Apple helpers (ARCHITECTURE §8, §11): the ES256 client secret, AES-256-GCM
 * encryption of the Apple refresh token kept for account-deletion revocation, the code exchange
 * and `revokeAppleRefreshToken` used by the `auth.appleRevoke` worker job (change request T05-005).
 */

type AppleConfig = OAuthConfig["apple"];

/** Production uses real Apple keys; the local mock (any other issuer without keys) needs no client secret. */
export function isAppleProduction(apple: AppleConfig = oauthConfig().apple): boolean {
  return apple.issuer === APPLE_PRODUCTION_ISSUER || (apple.teamId.length > 0 && apple.keyId.length > 0 && apple.privateKey.length > 0);
}

/** ES256 client secret JWT for Apple's token and revoke endpoints; `null` for the local mock. */
export async function appleClientSecret(clientId: string, now: Date = new Date(), apple: AppleConfig = oauthConfig().apple): Promise<string | null> {
  if (!isAppleProduction(apple)) return null;
  if (apple.teamId.length === 0 || apple.keyId.length === 0 || apple.privateKey.length === 0) {
    throw new AppError("OAUTH_PROVIDER_ERROR", { details: { reason: "apple_not_configured" } });
  }
  const key = await importPKCS8(apple.privateKey.replace(/\\n/g, "\n"), "ES256");
  const iat = Math.floor(now.getTime() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: apple.keyId })
    .setIssuer(apple.teamId)
    .setSubject(clientId)
    .setAudience(APPLE_PRODUCTION_ISSUER)
    .setIssuedAt(iat)
    .setExpirationTime(iat + 300)
    .sign(key);
}

function encryptionKey(): Buffer {
  const hex = oauthConfig().encryptionKey.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new AppError("INTERNAL", { details: { reason: "auth_encryption_key_invalid" } });
  return Buffer.from(hex, "hex");
}

export function encryptionConfigured(): boolean {
  return /^[0-9a-fA-F]{64}$/.test(oauthConfig().encryptionKey.trim());
}

const StoredTokenSchema = z.object({ t: z.string().min(1), c: z.string().min(1) });
export type StoredAppleToken = { readonly token: string; readonly clientId: string };

/** `v1.<iv>.<tag>.<ciphertext>` (base64url). The payload keeps the client id the token was issued to. */
export function encryptAppleRefreshToken(value: StoredAppleToken): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const plain = Buffer.from(JSON.stringify({ t: value.token, c: value.clientId }), "utf8");
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptAppleRefreshToken(value: string): StoredAppleToken {
  const [version, iv, tag, data] = value.split(".");
  if (version !== "v1" || iv === undefined || tag === undefined || data === undefined) throw new Error("apple token: unknown format");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const plain = Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  const parsed = StoredTokenSchema.parse(JSON.parse(plain));
  return { token: parsed.t, clientId: parsed.c };
}

const TokenResponseSchema = z.object({ id_token: z.string().min(1), refresh_token: z.string().min(1).optional() });
export type AppleTokenResponse = z.infer<typeof TokenResponseSchema>;

/** Exchanges an Apple authorization code (`client_secret` only in production; PKCE verifier when the flow used one). */
export async function exchangeAppleCode(input: {
  readonly code: string;
  readonly clientId: string;
  readonly redirectUri?: string | null;
  readonly verifier?: string | null;
  readonly now?: Date;
}): Promise<AppleTokenResponse> {
  const apple = oauthConfig().apple;
  const discovery = await discover(apple.issuer);
  const body = new URLSearchParams({ grant_type: "authorization_code", code: input.code, client_id: input.clientId });
  if (input.redirectUri !== undefined && input.redirectUri !== null) body.set("redirect_uri", input.redirectUri);
  if (input.verifier !== undefined && input.verifier !== null) body.set("code_verifier", input.verifier);
  const secret = await appleClientSecret(input.clientId, input.now, apple);
  if (secret !== null) body.set("client_secret", secret);
  try {
    const response = await fetch(discovery.token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: body.toString(),
    });
    if (!response.ok) throw new Error(`token ${response.status}`);
    return TokenResponseSchema.parse(await response.json());
  } catch {
    throw new AppError("OAUTH_PROVIDER_ERROR", { details: { reason: "token_exchange_failed" } });
  }
}

export interface AppleRevokeInput {
  readonly orgId: string;
  readonly identityId: string;
}

/**
 * Revokes the stored Apple refresh token at Apple (`/auth/revoke`, or the discovery
 * `revocation_endpoint` of the local mock) and deletes the identity once Apple confirms. Missing
 * identities are already done; identities without a stored token are deleted directly. Failures
 * throw so the worker retries. The token is never logged or included in errors.
 */
export async function revokeAppleRefreshToken(input: AppleRevokeInput): Promise<void> {
  const db = await getDb();
  const identities = collections.userIdentities(db);
  const identity = await identities.findOne({ _id: input.identityId, organizationId: input.orgId });
  if (identity === null) return;
  if (identity.provider !== "APPLE") throw new Error("apple revoke: identity is not an Apple identity");
  const stored = identity.providerRefreshTokenEnc;
  if (stored !== null && stored !== undefined && stored.length > 0) {
    let token: StoredAppleToken;
    try {
      token = decryptAppleRefreshToken(stored);
    } catch {
      throw new Error("apple revoke: stored token cannot be decrypted");
    }
    const apple = oauthConfig().apple;
    let endpoint = `${apple.issuer}/auth/revoke`;
    if (apple.issuer !== APPLE_PRODUCTION_ISSUER) endpoint = (await discover(apple.issuer)).revocation_endpoint ?? endpoint;
    const body = new URLSearchParams({ client_id: token.clientId, token: token.token, token_type_hint: "refresh_token" });
    const secret = await appleClientSecret(token.clientId, new Date(), apple);
    if (secret !== null) body.set("client_secret", secret);
    const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: body.toString() });
    if (!response.ok) throw new Error(`apple revoke failed with HTTP ${response.status}`);
  }
  await identities.deleteOne({ _id: identity._id, organizationId: input.orgId });
}
