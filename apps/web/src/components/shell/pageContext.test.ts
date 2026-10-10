import { describe, expect, it } from "vitest";

import en from "../../../messages/en/admin.json";
import { allNavHrefs, NAV_ITEMS, type NavItem } from "./nav";
import { RELATED_PAGES, resolvePageContext } from "./pageContext";

function keys(items: readonly NavItem[]): string[] {
  return items.flatMap((item) => [item.key, ...keys(item.children ?? [])]);
}

describe("resolvePageContext", () => {
  it("resolves a top-level list page", () => {
    expect(resolvePageContext("/work-orders")).toEqual({ key: "workOrders", trail: [{ key: "workOrders", href: "/work-orders" }], leaf: null });
  });

  it("marks detail and new pages", () => {
    expect(resolvePageContext("/work-orders/abc123")?.leaf).toBe("detail");
    expect(resolvePageContext("/assets/new")?.leaf).toBe("new");
  });

  it("prefers the deepest nav entry and keeps its parents", () => {
    expect(resolvePageContext("/team/devices")).toEqual({
      key: "devices",
      trail: [
        { key: "team", href: "/team" },
        { key: "devices", href: "/team/devices" },
      ],
      leaf: null,
    });
    expect(resolvePageContext("/team/u1")?.key).toBe("team");
  });

  it("ignores pages outside the sidebar and look-alike prefixes", () => {
    expect(resolvePageContext("/office-role-required")).toBeNull();
    expect(resolvePageContext("/opsx")).toBeNull();
  });

  it("covers every sidebar page with an explanation and valid related pages", () => {
    const all = keys(NAV_ITEMS);
    const pages = en.context.pages as Record<string, { body: string; tasks: string } | undefined>;
    for (const key of all) {
      expect(pages[key]?.body, key).toBeTruthy();
      expect(pages[key]?.tasks, key).toBeTruthy();
      for (const related of RELATED_PAGES[key] ?? []) {
        expect(all, `${key} -> ${related}`).toContain(related);
      }
    }
    expect(allNavHrefs().every((href) => resolvePageContext(href) !== null)).toBe(true);
  });
});
