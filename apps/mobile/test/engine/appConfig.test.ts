import appConfig, { androidVersionCode, resolveAppVersion, resolveEasProjectId } from "../../app.config";

const PROJECT_ID = "0b6a3c1e-2f4d-4a5b-9c8d-7e6f5a4b3c2d";

describe("EAS project id (change request T18-004)", () => {
  it("is optional locally and required in EAS cloud builds", () => {
    expect(resolveEasProjectId({})).toBeUndefined();
    expect(() => resolveEasProjectId({ EAS_BUILD: "true" })).toThrow("EAS_PROJECT_ID is not set");
  });

  it("rejects values that are not a project UUID", () => {
    expect(() => resolveEasProjectId({ EAS_PROJECT_ID: "agrorende" })).toThrow("EAS_PROJECT_ID must be the project UUID");
  });

  it("writes extra.eas.projectId into the Expo config", () => {
    const previous = process.env.EAS_PROJECT_ID;
    process.env.EAS_PROJECT_ID = PROJECT_ID;
    try {
      const config = appConfig({ config: { name: "x", slug: "x", extra: { keep: true } } } as never);
      expect(config.extra).toEqual({ keep: true, eas: { projectId: PROJECT_ID } });
    } finally {
      if (previous === undefined) delete process.env.EAS_PROJECT_ID;
      else process.env.EAS_PROJECT_ID = previous;
    }
  });
});

describe("app version from the release tag", () => {
  it("accepts semver from APP_VERSION and falls back to the development default", () => {
    expect(resolveAppVersion("1.4.2")).toBe("1.4.2");
    expect(resolveAppVersion(undefined)).toBe("0.1.0");
    expect(resolveAppVersion("v1.4.2")).toBe("0.1.0");
    expect(resolveAppVersion("1.4")).toBe("0.1.0");
  });

  it("derives an increasing Android versionCode", () => {
    expect(androidVersionCode("0.1.0")).toBe(100);
    expect(androidVersionCode("1.4.2")).toBe(10_402);
    expect(androidVersionCode("1.10.0")).toBeGreaterThan(androidVersionCode("1.9.99"));
  });

  it("writes version and versionCode into the Expo config", () => {
    const previous = process.env.APP_VERSION;
    process.env.APP_VERSION = "2.3.4";
    try {
      const config = appConfig({ config: { name: "x", slug: "x" } } as never);
      expect(config.version).toBe("2.3.4");
      expect(config.android?.versionCode).toBe(20_304);
    } finally {
      if (previous === undefined) delete process.env.APP_VERSION;
      else process.env.APP_VERSION = previous;
    }
  });
});
