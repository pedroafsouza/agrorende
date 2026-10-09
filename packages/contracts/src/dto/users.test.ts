import { describe, expect, it } from "vitest";

import { notificationPrefsOf, NotificationPrefsSchema, UpdateMeInputSchema } from "./index.js";

describe("notification prefs (T05-008)", () => {
  it("defaults missing prefs and drops unknown types", () => {
    expect(notificationPrefsOf(undefined)).toEqual({ pushMuted: false, mutedTypes: [] });
    expect(notificationPrefsOf({ pushMuted: true, mutedTypes: ["WO_ASSIGNED", "NOPE", "WO_ASSIGNED"] })).toEqual({ pushMuted: true, mutedTypes: ["WO_ASSIGNED"] });
    expect(NotificationPrefsSchema.safeParse({ pushMuted: false, mutedTypes: ["NOPE"] }).success).toBe(false);
  });

  it("accepts a partial PATCH /me and rejects an empty one", () => {
    expect(UpdateMeInputSchema.safeParse({ locale: "en" }).success).toBe(true);
    expect(UpdateMeInputSchema.safeParse({ notificationPrefs: { pushMuted: true } }).success).toBe(true);
    expect(UpdateMeInputSchema.safeParse({ notificationPrefs: { mutedTypes: ["RENTAL_OVERDUE"] } }).success).toBe(true);
    expect(UpdateMeInputSchema.safeParse({}).success).toBe(false);
    expect(UpdateMeInputSchema.safeParse({ notificationPrefs: { pushMuted: "yes" } }).success).toBe(false);
    expect(UpdateMeInputSchema.safeParse({ locale: "fr" }).success).toBe(false);
  });
});
