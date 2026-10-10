import { ALL_ERROR_CODES } from "@agrorende/contracts/errors";
import { helpUrl } from "@agrorende/i18n/helpUrl";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { appLocale, SITE_LOCALES } from "./locales";
import {
  allRoutes,
  codeFromSlug,
  codeToSlug,
  helpErrorPath,
  isIndexable,
  PAGE_KEYS,
  pagePath,
  pathFor,
  resolveRoute,
  routeSegments,
  staticParams,
} from "./routes";

describe("routes", () => {
  it("has a help page for every ErrorCode and ClientErrorCode in both locales", () => {
    for (const code of ALL_ERROR_CODES) {
      expect(helpErrorPath(code, "pt-br")).toBe(`/pt-br/ajuda/erros/${codeToSlug(code)}/`);
      expect(helpErrorPath(code, "en")).toBe(`/en/help/errors/${codeToSlug(code)}/`);
    }
  });

  it("agrees with helpUrl(code, locale) from @agrorende/i18n", () => {
    for (const locale of SITE_LOCALES) {
      for (const code of ALL_ERROR_CODES) {
        expect(`${helpUrl(code, appLocale(locale))}/`).toBe(helpErrorPath(code, locale));
      }
    }
  });

  it("resolves every route back from its segments", () => {
    for (const locale of SITE_LOCALES) {
      for (const route of allRoutes()) {
        expect(resolveRoute(locale, routeSegments(route, locale))).toEqual(route);
      }
    }
  });

  it("produces unique paths and static params for every page", () => {
    const paths = SITE_LOCALES.flatMap((locale) => allRoutes().map((route) => pathFor(route, locale)));
    expect(new Set(paths).size).toBe(paths.length);
    expect(staticParams()).toHaveLength(paths.length);
    expect(allRoutes()).toHaveLength(PAGE_KEYS.length + ALL_ERROR_CODES.length);
  });

  it("uses the SITE-10 and SITE-11 paths", () => {
    expect(pagePath("deleteAccount", "pt-br")).toBe("/pt-br/excluir-conta/");
    expect(pagePath("deleteAccount", "en")).toBe("/en/delete-account/");
    expect(pagePath("privacy", "pt-br")).toBe("/pt-br/privacidade/");
    expect(pagePath("terms", "en")).toBe("/en/terms/");
    expect(pagePath("dpa", "pt-br")).toBe("/pt-br/dpa/");
  });

  it("matches the legal links the web signup page builds (apps/web/src/features/signup/legal.ts)", () => {
    const source = readFileSync(new URL("../../../web/src/features/signup/legal.ts", import.meta.url), "utf8");
    for (const key of ["privacy", "terms", "dpa"] as const) {
      for (const locale of SITE_LOCALES) {
        expect(source).toContain(`\${base}${pagePath(key, locale).replace(/\/$/u, "")}\``);
      }
    }
  });

  it("does not resolve unknown paths or codes", () => {
    expect(resolveRoute("pt-br", ["nao-existe"])).toBeUndefined();
    expect(resolveRoute("pt-br", ["ajuda", "erros", "nao-existe"])).toBeUndefined();
    expect(resolveRoute("en", ["ajuda"])).toBeUndefined();
    expect(codeFromSlug("FIRST_SYNC_LARGE")).toBe("FIRST_SYNC_LARGE");
    expect(codeFromSlug("nope")).toBeUndefined();
  });

  it("keeps 404 and the unknown-code page out of the index", () => {
    expect(isIndexable({ kind: "page", key: "notFound" })).toBe(false);
    expect(isIndexable({ kind: "page", key: "helpUnknown" })).toBe(false);
    expect(isIndexable({ kind: "page", key: "home" })).toBe(true);
  });
});
