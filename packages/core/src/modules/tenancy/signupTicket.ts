import { createHash, randomUUID } from "node:crypto";

import { AppError } from "@agrorende/contracts/errors";
import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";

import { authConfig } from "../../auth/config.js";
import { SIGNUP_LOGIN_CODE_TTL_S, SIGNUP_TICKET_TTL_S } from "./config.js";

const SIGNUP_AUDIENCE = "signup";
const APP_REDIRECT = /^agrorende:\/\/[\w./-]*$/;

export const SignupIdentitySchema = z.object({
  provider: z.enum(["GOOGLE", "APPLE"]),
  subject: z.string().min(1).max(255),
  email: z.string().email().max(254).nullable(),
  emailVerified: z.boolean(),
  isPrivateRelay: z.boolean().default(false),
  name: z.string().max(120).nullable(),
});
export type SignupIdentity = z.infer<typeof SignupIdentitySchema>;

const TicketClaimsSchema = SignupIdentitySchema.extend({
  tokenUse: z.literal("signup"),
  jti: z.string().min(1),
  client: z.enum(["web", "app"]),
  appRedirectUri: z.string().regex(APP_REDIRECT).optional(),
  codeChallenge: z.string().min(43).max(128).optional(),
});
export type SignupTicketClaims = z.infer<typeof TicketClaimsSchema>;

const LoginCodeClaimsSchema = z.object({
  tokenUse: z.literal("signup_login"),
  jti: z.string().min(1),
  sub: z.string().uuid(),
  org: z.string().uuid(),
  codeChallenge: z.string().min(43).max(128),
});
export type SignupLoginCodeClaims = z.infer<typeof LoginCodeClaimsSchema>;

export interface IssueSignupTicketOptions {
  readonly client?: "web" | "app";
  /** App deep link (`agrorende://…`) that receives the one-time login code after a mobile sign-up. */
  readonly appRedirectUri?: string;
  /** S256 PKCE challenge of the app's verifier; required with `appRedirectUri`. */
  readonly codeChallenge?: string;
  readonly now?: Date;
}

function secret(): Uint8Array {
  const value = authConfig().jwtSecret;
  if (value.length === 0) throw new AppError("INTERNAL", { details: { reason: "jwt_secret_missing" } });
  return new TextEncoder().encode(value);
}

/**
 * Seam for the Google/Apple OAuth callback (T02) when the user started from "Create company":
 * returns a short-lived sign-up ticket bound to the verified provider identity (TEN-01).
 */
export async function issueSignupTicket(identity: SignupIdentity, options: IssueSignupTicketOptions = {}): Promise<{ ticket: string; expiresAt: string }> {
  const parsed = SignupIdentitySchema.parse(identity);
  const client = options.client ?? "web";
  if (client === "app" && (options.appRedirectUri === undefined || !APP_REDIRECT.test(options.appRedirectUri) || options.codeChallenge === undefined)) {
    throw new AppError("VALIDATION_FAILED", { fieldErrors: [{ path: "appRedirectUri", code: "invalid" }] });
  }
  const now = options.now ?? new Date();
  const iat = Math.floor(now.getTime() / 1000);
  const claims: Omit<SignupTicketClaims, "jti"> = {
    ...parsed,
    tokenUse: "signup",
    client,
    ...(client === "app" ? { appRedirectUri: options.appRedirectUri, codeChallenge: options.codeChallenge } : {}),
  };
  const ticket = await new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(SIGNUP_AUDIENCE)
    .setJti(randomUUID())
    .setIssuedAt(iat)
    .setExpirationTime(iat + SIGNUP_TICKET_TTL_S)
    .sign(secret());
  return { ticket, expiresAt: new Date((iat + SIGNUP_TICKET_TTL_S) * 1000).toISOString() };
}

/** Verifies a sign-up ticket. Expired, tampered or foreign tokens get `OAUTH_STATE_EXPIRED` (start sign-up again). */
export async function verifySignupTicket(ticket: string, now: Date = new Date()): Promise<SignupTicketClaims> {
  try {
    const { payload } = await jwtVerify(ticket, secret(), { audience: SIGNUP_AUDIENCE, algorithms: ["HS256"], currentDate: now });
    return TicketClaimsSchema.parse(payload);
  } catch {
    throw new AppError("OAUTH_STATE_EXPIRED", { details: { reason: "signup_ticket" } });
  }
}

export async function issueSignupLoginCode(input: { readonly userId: string; readonly orgId: string; readonly codeChallenge: string; readonly now?: Date }): Promise<string> {
  const iat = Math.floor((input.now ?? new Date()).getTime() / 1000);
  return new SignJWT({ tokenUse: "signup_login", org: input.orgId, codeChallenge: input.codeChallenge })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(SIGNUP_AUDIENCE)
    .setSubject(input.userId)
    .setJti(randomUUID())
    .setIssuedAt(iat)
    .setExpirationTime(iat + SIGNUP_LOGIN_CODE_TTL_S)
    .sign(secret());
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/** Verifies a mobile login code against the app's PKCE verifier. Single use is enforced by the caller. */
export async function verifySignupLoginCode(code: string, verifier: string, now: Date = new Date()): Promise<SignupLoginCodeClaims> {
  let claims: SignupLoginCodeClaims;
  try {
    const { payload } = await jwtVerify(code, secret(), { audience: SIGNUP_AUDIENCE, algorithms: ["HS256"], currentDate: now });
    claims = LoginCodeClaimsSchema.parse(payload);
  } catch {
    throw new AppError("OAUTH_STATE_EXPIRED", { details: { reason: "signup_login_code" } });
  }
  if (pkceChallenge(verifier) !== claims.codeChallenge) throw new AppError("OAUTH_STATE_EXPIRED", { details: { reason: "pkce_mismatch" } });
  return claims;
}
