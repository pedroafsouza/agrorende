import { serverMessage } from "@agrorende/i18n/server";
import { describe, expect, it } from "vitest";

import { EXPORT_LOCALES } from "./dto.js";
import { BOOLEAN_LABELS, EXPORT_HEADERS } from "./headers.js";

describe("export headers catalogue", () => {
  it("labels every column from exports.headers in pt-BR and en", () => {
    const keys = Object.keys(EXPORT_HEADERS);
    expect(keys.length).toBeGreaterThan(0);
    for (const locale of EXPORT_LOCALES) {
      for (const key of keys) {
        const message = serverMessage(locale, "exports", `headers.${key}`);
        expect(message?.length ?? 0, `${locale} headers.${key}`).toBeGreaterThan(0);
        expect(EXPORT_HEADERS[key as keyof typeof EXPORT_HEADERS][locale]).toBe(message);
      }
    }
  });

  it("reads boolean labels from exports.boolean", () => {
    expect(BOOLEAN_LABELS["pt-BR"]).toEqual({ yes: "Sim", no: "Não" });
    expect(BOOLEAN_LABELS.en).toEqual({ yes: "Yes", no: "No" });
    expect(EXPORT_HEADERS.status).toEqual({ "pt-BR": "Situação", en: "Status" });
  });
});
