import { describe, expect, it } from "vitest";

import { assertProductionEnv, productionEnvProblems } from "./productionEnv.js";

const VALID = {
  APP_ENV: "production",
  GOOGLE_OIDC_ISSUER: "https://accounts.google.com",
  APPLE_OIDC_ISSUER: "https://appleid.apple.com",
  MONGODB_URI: "mongodb+srv://cluster.example.mongodb.net",
  APPLE_TEAM_ID: "team",
  APPLE_KEY_ID: "key",
  APPLE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----",
  AUTH_ENCRYPTION_KEY: "a".repeat(64),
  JWT_SECRET: "b".repeat(64),
  MEDIA_URL_SECRET: "c".repeat(32),
};

describe("assertProductionEnv", () => {
  it("does nothing outside production, even with the local mock issuer", () => {
    expect(() => assertProductionEnv("web", { APP_ENV: "staging", GOOGLE_OIDC_ISSUER: "http://localhost:4003/google" })).not.toThrow();
    expect(productionEnvProblems({})).toEqual([]);
  });

  it("accepts a complete production environment", () => {
    expect(() => assertProductionEnv("worker", VALID)).not.toThrow();
  });

  it("lists every broken rule without echoing secret values", () => {
    const env = { ...VALID, GOOGLE_OIDC_ISSUER: "http://localhost:4003/google", MONGODB_URI: "mongodb://mongo:27017", JWT_SECRET: "", APPLE_PRIVATE_KEY: undefined };
    expect(() => assertProductionEnv("realtime", env)).toThrow(
      "realtime refuses to start with APP_ENV=production: GOOGLE_OIDC_ISSUER must be https://accounts.google.com; MONGODB_URI must be a MongoDB Atlas mongodb+srv:// address; missing APPLE_PRIVATE_KEY, JWT_SECRET",
    );
    expect(productionEnvProblems({ ...VALID, APPLE_OIDC_ISSUER: "http://localhost:4003/apple" })).toEqual(["APPLE_OIDC_ISSUER must be https://appleid.apple.com"]);
  });
});
