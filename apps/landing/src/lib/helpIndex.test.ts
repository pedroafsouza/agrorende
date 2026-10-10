import { ALL_ERROR_CODES } from "@agrorende/contracts/errors";
import { describe, expect, it } from "vitest";

import { buildHelpIndex, groupOf, HELP_GROUPS } from "./helpIndex";
import { matchesQuery, normalizeQuery } from "./helpMatch";
import { helpErrorPath } from "./routes";

describe("help index", () => {
  it("lists every code exactly once per locale, in known groups", () => {
    for (const locale of ["pt-br", "en"] as const) {
      const groups = buildHelpIndex(locale);
      const codes = groups.flatMap((group) => group.items.map((item) => item.code));
      expect(codes.sort()).toEqual([...ALL_ERROR_CODES].sort());
      for (const group of groups) {
        expect(HELP_GROUPS).toContain(group.group);
        for (const item of group.items) expect(item.href).toBe(helpErrorPath(item.code as never, locale));
      }
    }
  });

  it("groups by the EC prefix of the code's ERRORS.md entry", () => {
    for (const code of ALL_ERROR_CODES) expect(HELP_GROUPS).toContain(groupOf(code));
    expect(groupOf("WHATSAPP_UNAVAILABLE")).toBe("SITE");
  });
});

describe("help search matching", () => {
  const item = { code: "FIRST_SYNC_LARGE", title: "Primeira sincronização é grande", href: "/x/" };

  it("ignores case, accents, underscores and hyphens", () => {
    expect(normalizeQuery("  Sincronização__GRANDE ")).toBe("sincronizacao grande");
    expect(matchesQuery(item, "first sync")).toBe(true);
    expect(matchesQuery(item, "first-sync-large")).toBe(true);
    expect(matchesQuery(item, "SINCRONIZACAO")).toBe(true);
    expect(matchesQuery(item, "")).toBe(true);
    expect(matchesQuery(item, "boleto")).toBe(false);
  });
});
