import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { setAuthConfigForTests } from "../../auth/config.js";
import { signMediaUrlToken } from "../../auth/jwt.js";
import { resolveReadVariant, verifyBlobToken } from "./upload.js";

const SECRET = "media-token-test-secret-0123456789abcdef";
const MEDIA = "0b9a2f3e-6a51-4f6e-8d0c-2f6f5f2c9a11";
const OTHER = "6c1d7a52-3b0e-4f4d-9a0b-7e2d1c5b8f22";

async function token(overrides: Partial<{ sub: string; v: "original" | "thumb" | "poster"; op: "put" | "part" | "get" }> = {}, expiresIn = "300s", secret = SECRET): Promise<string> {
  return signMediaUrlToken({ tokenUse: "media-url", sub: MEDIA, v: "thumb", op: "get", ...overrides }, { secret, expiresIn });
}

async function codeOf(promise: Promise<unknown>): Promise<{ code: string; reason?: unknown }> {
  try {
    await promise;
  } catch (error) {
    const appError = error as { code: string; details?: { reason?: unknown } };
    return { code: appError.code, reason: appError.details?.reason };
  }
  throw new Error("expected a rejection");
}

beforeAll(() => {
  setAuthConfigForTests({ mediaUrlSecret: SECRET, jwtSecret: "unused-jwt-secret-0123456789abcdef" });
});

afterAll(() => {
  setAuthConfigForTests(null);
});

describe("media URL tokens", () => {
  it("verifies a token signed for the same media, operation and variant", async () => {
    const claims = await verifyBlobToken(await token(), MEDIA, "get", "thumb");
    expect(claims).toMatchObject({ sub: MEDIA, v: "thumb", op: "get", tokenUse: "media-url" });
  });

  it("accepts a read without a variant query and returns the signed variant", async () => {
    const claims = await verifyBlobToken(await token({ v: "original" }), MEDIA, "get");
    expect(claims.v).toBe("original");
  });

  it("rejects a missing token with the media_token reason", async () => {
    expect(await codeOf(verifyBlobToken(null, MEDIA, "get", "thumb"))).toEqual({ code: "FORBIDDEN", reason: "media_token" });
    expect(await codeOf(verifyBlobToken("", MEDIA, "get", "thumb"))).toEqual({ code: "FORBIDDEN", reason: "media_token" });
  });

  it("rejects a token for another media id, operation or variant", async () => {
    expect(await codeOf(verifyBlobToken(await token({ sub: OTHER }), MEDIA, "get", "thumb"))).toEqual({ code: "FORBIDDEN", reason: "media_token" });
    expect(await codeOf(verifyBlobToken(await token({ op: "put" }), MEDIA, "get", "thumb"))).toEqual({ code: "FORBIDDEN", reason: "media_token" });
    expect(await codeOf(verifyBlobToken(await token({ v: "original" }), MEDIA, "get", "thumb"))).toEqual({ code: "FORBIDDEN", reason: "media_token" });
  });

  it("rejects a token signed with another secret", async () => {
    const forged = await token({}, "300s", "another-secret-0123456789abcdef-xyz");
    expect(await codeOf(verifyBlobToken(forged, MEDIA, "get", "thumb"))).toEqual({ code: "FORBIDDEN", reason: "media_token" });
  });

  it("reports an expired read token as media_token_expired and an expired upload token as UPLOAD_URL_EXPIRED", async () => {
    const expiredRead = await signMediaUrlToken({ tokenUse: "media-url", sub: MEDIA, v: "thumb", op: "get" }, { secret: SECRET, expiresIn: "-10s" });
    expect(await codeOf(verifyBlobToken(expiredRead, MEDIA, "get", "thumb"))).toEqual({ code: "FORBIDDEN", reason: "media_token_expired" });
    const expiredPut = await signMediaUrlToken({ tokenUse: "media-url", sub: MEDIA, v: "original", op: "put" }, { secret: SECRET, expiresIn: "-10s" });
    expect((await codeOf(verifyBlobToken(expiredPut, MEDIA, "put", "original"))).code).toBe("UPLOAD_URL_EXPIRED");
  });
});

describe("resolveReadVariant", () => {
  const originalOnly = { variants: { original: { status: "UPLOADED" as const } } };
  const both = { variants: { original: { status: "UPLOADED" as const }, thumb: { status: "UPLOADED" as const } } };
  const pending = { variants: { original: { status: "PENDING" as const } } };

  it("returns the requested variant when it is stored", () => {
    expect(resolveReadVariant(both, "thumb", null)).toBe("thumb");
    expect(resolveReadVariant(both, "thumb", "original")).toBe("thumb");
  });

  it("keeps MEDIA_NOT_IN_STORAGE semantics without the fallback opt-in", () => {
    expect(resolveReadVariant(originalOnly, "thumb", null)).toBeNull();
  });

  it("falls back to the stored original when the thumbnail was never uploaded", () => {
    expect(resolveReadVariant(originalOnly, "thumb", "original")).toBe("original");
    expect(resolveReadVariant(originalOnly, "poster", "original")).toBe("original");
  });

  it("does not fall back when the original is not stored either", () => {
    expect(resolveReadVariant(pending, "thumb", "original")).toBeNull();
  });
});
