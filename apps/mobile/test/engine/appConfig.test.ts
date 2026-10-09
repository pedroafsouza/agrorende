import appConfig, { resolveEasProjectId } from "../../app.config";

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
