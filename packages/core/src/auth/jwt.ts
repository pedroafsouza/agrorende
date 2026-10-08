import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";

import { RoleEnum } from "@agrorende/contracts/enums";

const encoder = new TextEncoder();
const HS256 = "HS256";

export const AccessTokenClaimsSchema = z.object({
  tokenUse: z.literal("access"),
  sub: z.string().min(1),
  orgId: z.string().min(1),
  role: RoleEnum,
  deviceId: z.string().min(1).optional(),
  scope: z.string().optional(),
});
export type AccessTokenClaims = z.infer<typeof AccessTokenClaimsSchema>;

export const RefreshTokenClaimsSchema = z.object({
  tokenUse: z.literal("refresh"),
  sub: z.string().min(1),
  orgId: z.string().min(1),
  familyId: z.string().min(1),
  tokenId: z.string().min(1),
  deviceId: z.string().min(1).optional(),
});
export type RefreshTokenClaims = z.infer<typeof RefreshTokenClaimsSchema>;

export const MediaUrlTokenClaimsSchema = z.object({
  tokenUse: z.literal("media-url"),
  sub: z.string().min(1),
  v: z.enum(["original", "thumb", "poster"]),
  op: z.enum(["put", "part", "get"]),
  uid: z.string().min(1).optional(),
  n: z.number().int().positive().optional(),
  max: z.number().int().nonnegative().optional(),
  ct: z.string().min(1).optional(),
});
export type MediaUrlTokenClaims = z.infer<typeof MediaUrlTokenClaimsSchema>;

export interface JwtOptions {
  readonly secret: string;
  readonly issuer?: string;
  readonly audience?: string;
  readonly expiresIn: string;
}

export interface JwtVerifyOptions {
  readonly secret: string;
  readonly issuer?: string;
  readonly audience?: string;
}

function key(secret: string): Uint8Array {
  if (secret.trim().length === 0) {
    throw new Error("JWT secret is required.");
  }
  return encoder.encode(secret);
}

async function signClaims(claims: Record<string, unknown>, options: JwtOptions): Promise<string> {
  let builder = new SignJWT(claims)
    .setProtectedHeader({ alg: HS256 })
    .setIssuedAt()
    .setExpirationTime(options.expiresIn);

  if (options.issuer !== undefined) {
    builder = builder.setIssuer(options.issuer);
  }
  if (options.audience !== undefined) {
    builder = builder.setAudience(options.audience);
  }

  return builder.sign(key(options.secret));
}

async function verifyClaims<T>(token: string, schema: z.ZodType<T>, options: JwtVerifyOptions): Promise<T> {
  const { payload } = await jwtVerify(token, key(options.secret), {
    algorithms: [HS256],
    ...(options.issuer === undefined ? {} : { issuer: options.issuer }),
    ...(options.audience === undefined ? {} : { audience: options.audience }),
  });
  return schema.parse(payload);
}

export function signAccessToken(claims: AccessTokenClaims, options: JwtOptions): Promise<string> {
  return signClaims(AccessTokenClaimsSchema.parse(claims), options);
}

export function verifyAccessToken(token: string, options: JwtVerifyOptions): Promise<AccessTokenClaims> {
  return verifyClaims(token, AccessTokenClaimsSchema, options);
}

export function signRefreshToken(claims: RefreshTokenClaims, options: JwtOptions): Promise<string> {
  return signClaims(RefreshTokenClaimsSchema.parse(claims), options);
}

export function verifyRefreshToken(token: string, options: JwtVerifyOptions): Promise<RefreshTokenClaims> {
  return verifyClaims(token, RefreshTokenClaimsSchema, options);
}

export function signMediaUrlToken(claims: MediaUrlTokenClaims, options: JwtOptions): Promise<string> {
  return signClaims(MediaUrlTokenClaimsSchema.parse(claims), options);
}

export function verifyMediaUrlToken(token: string, options: JwtVerifyOptions): Promise<MediaUrlTokenClaims> {
  return verifyClaims(token, MediaUrlTokenClaimsSchema, options);
}
