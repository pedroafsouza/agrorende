import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

import { AppError } from "@agrorende/contracts/errors";

/*
 * ARCHITECTURE §11 asks for Argon2id, which is not a workspace dependency (R4 freezes
 * dependencies). Passwords use scrypt from `node:crypto` until change request T02-001 lands.
 * The seed's `sha256:<hex>` hashes are verified and upgraded to scrypt on the next login.
 */

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
export const PASSWORD_MIN_LENGTH = 8;

const COMMON_PASSWORDS = new Set([
  "12345678",
  "123456789",
  "1234567890",
  "password",
  "password1",
  "qwertyui",
  "qwerty123",
  "11111111",
  "00000000",
  "abcdefgh",
  "senha123",
  "senha1234",
  "mudar123",
  "agrorende",
  "iloveyou",
  "admin123",
]);

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, rejectPromise) => {
    scrypt(password, salt, KEY_LENGTH, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error === null) resolve(key);
      else rejectPromise(error);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (stored === null || stored === undefined || stored.length === 0) return false;
  if (stored.startsWith("sha256:")) {
    const expected = Buffer.from(stored.slice(7), "hex");
    return safeEqual(createHash("sha256").update(password).digest(), expected);
  }
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, key] = parts;
  if (n === undefined || r === undefined || p === undefined || salt === undefined || key === undefined) return false;
  const derived = await derive(password, Buffer.from(salt, "base64url"), Number(n), Number(r), Number(p));
  return safeEqual(derived, Buffer.from(key, "base64url"));
}

export function needsRehash(stored: string | null | undefined): boolean {
  return stored !== null && stored !== undefined && !stored.startsWith(`scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$`);
}

/** Throws `VALIDATION_FAILED` with a field error when the password is too short or too common. */
export function assertPasswordPolicy(password: unknown, path = "password"): string {
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
    throw new AppError("VALIDATION_FAILED", { fieldErrors: [{ path, code: "too_short", params: { min: PASSWORD_MIN_LENGTH } }] });
  }
  if (password.length > 256) {
    throw new AppError("VALIDATION_FAILED", { fieldErrors: [{ path, code: "too_long", params: { max: 256 } }] });
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase()) || /^(.)\1+$/.test(password)) {
    throw new AppError("VALIDATION_FAILED", { fieldErrors: [{ path, code: "too_common" }] });
  }
  return password;
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Human-friendly share code (no 0/O/1/I), used for invite and reset links. */
export function randomCode(length = 10): string {
  const bytes = randomBytes(length);
  let code = "";
  for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return code;
}
