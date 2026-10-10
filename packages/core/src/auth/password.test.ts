import { createHash, randomBytes, scryptSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { hashPassword, needsRehash, verifyPassword } from "./password";

describe("password hashing", () => {
  it("hashes with Argon2id and verifies", async () => {
    const stored = await hashPassword("correct horse battery");
    expect(stored.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword("correct horse battery", stored)).toBe(true);
    expect(await verifyPassword("wrong password", stored)).toBe(false);
    expect(needsRehash(stored)).toBe(false);
  });

  it("still verifies legacy scrypt and seed sha256 hashes and asks for a rehash", async () => {
    const salt = randomBytes(16);
    const key = scryptSync("legacy-pass", salt, 64, { N: 16_384, r: 8, p: 1 });
    const scryptHash = `scrypt$16384$8$1$${salt.toString("base64url")}$${key.toString("base64url")}`;
    const seedHash = `sha256:${createHash("sha256").update("agrorende123").digest("hex")}`;
    expect(await verifyPassword("legacy-pass", scryptHash)).toBe(true);
    expect(await verifyPassword("agrorende123", seedHash)).toBe(true);
    expect(needsRehash(scryptHash)).toBe(true);
    expect(needsRehash(seedHash)).toBe(true);
    expect(await verifyPassword("x", "$argon2id$garbage")).toBe(false);
  });
});
