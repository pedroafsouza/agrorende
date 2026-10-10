import { NotificationTypeEnum } from "@agrorende/contracts/enums";
import { serverMessage } from "@agrorende/i18n/server";
import { describe, expect, it } from "vitest";

import { NOTIFICATION_TEMPLATES, renderIcu, renderNotification, resolveNotificationLocale } from "./templates.js";

describe("notification templates", () => {
  it("has a title and body in the notifications catalogue for every notification type in every locale", () => {
    for (const locale of ["pt-BR", "en"] as const) {
      for (const type of NotificationTypeEnum.options) {
        for (const field of ["title", "body"] as const) {
          const message = serverMessage(locale, "notifications", `${type}.${field}`);
          expect(message?.length ?? 0, `${locale} ${type}.${field}`).toBeGreaterThan(0);
          expect(NOTIFICATION_TEMPLATES[locale][type][field], `${locale} ${type}.${field}`).toBe(message);
        }
      }
    }
  });

  it("renders every notification type in every locale without leftover ICU syntax", () => {
    for (const locale of ["pt-BR", "en"] as const) {
      for (const type of NotificationTypeEnum.options) {
        const rendered = renderNotification(type, { title: "Plantio", name: "Ana" }, locale);
        expect(rendered.title).not.toMatch(/[{}]/);
        expect(rendered.body).not.toMatch(/[{}]/);
        expect(rendered.title).not.toBe(type);
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
    expect(renderNotification("WO_ASSIGNED", { title: "Plantio" }, "en")).toEqual({ title: "New job assigned", body: "Plantio. Open the job to see the next step." });
    expect(renderNotification("COMMENT_ADDED", { name: "Ana", title: "Trator 3" }, "pt-BR")).toEqual({ title: "Novo comentário", body: "Ana comentou em Trator 3." });
    expect(renderNotification("DEVICE_STALE_SYNC", { name: "Ana" }, "en").body).toBe("Ana's phone has data that has not been sent yet.");
  });
});
