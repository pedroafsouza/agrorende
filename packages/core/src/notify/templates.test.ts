import { NotificationTypeEnum } from "@agrorende/contracts/enums";
import { describe, expect, it } from "vitest";

import { NOTIFICATION_TEMPLATES, renderIcu, renderNotification, resolveNotificationLocale } from "./templates.js";

describe("notification templates", () => {
  it("has a title and body for every notification type in every locale", () => {
    for (const locale of ["pt-BR", "en"] as const) {
      for (const type of NotificationTypeEnum.options) {
        const template = NOTIFICATION_TEMPLATES[locale][type];
        expect(template.title.length, `${locale} ${type}`).toBeGreaterThan(0);
        expect(template.body.length, `${locale} ${type}`).toBeGreaterThan(0);
      }
    }
  });

  it("falls back to pt-BR for unknown locales", () => {
    expect(resolveNotificationLocale("en-US")).toBe("en");
    expect(resolveNotificationLocale("fr")).toBe("pt-BR");
    expect(resolveNotificationLocale(null)).toBe("pt-BR");
  });

  it("renders arguments and plurals", () => {
    expect(renderIcu("{n, plural, one {# item} other {# items}} for {name}", { n: 2, name: "Ana" }, "en")).toBe("2 items for Ana");
    expect(renderNotification("WO_ASSIGNED", { title: "Plantio" }, "en").body).toContain("Plantio");
  });
});
