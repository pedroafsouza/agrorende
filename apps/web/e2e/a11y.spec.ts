import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { Api } from "./support/api";
import { setLocale, signIn, useTheme } from "./support/auth";
import { SEED } from "./support/env";

const BLOCKING = new Set(["serious", "critical"]);

async function blockingViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return results.violations
    .filter((violation) => BLOCKING.has(violation.impact ?? ""))
    .map((violation) => `${violation.impact ?? ""} ${violation.id}: ${violation.help} — ${violation.nodes.map((node) => `${node.target.join(" ")} (${node.any[0]?.message ?? node.failureSummary ?? ""})`).slice(0, 5).join(" | ")}`);
}

/** P0 office pages (PRD §6); the work-order detail path is resolved from the seed at run time. */
const PAGES = ["/ops", "/reports", "/work-orders", "/rentals", "/assets", "/customers", "/team", "/settings"] as const;

for (const theme of ["light", "dark"] as const) {
  test.describe(`accessibility (${theme})`, () => {
    test.beforeEach(async ({ page }) => {
      await useTheme(page, theme);
    });

    test("sign-in page has no serious or critical violations", async ({ page }) => {
      await setLocale(page, "en");
      await page.goto("/login");
      await expect(page.getByRole("heading", { name: "Sign in", level: 1 })).toBeVisible();
      expect(await blockingViolations(page)).toEqual([]);
    });

    test("P0 office pages have no serious or critical violations", async ({ page, request }) => {
      test.setTimeout(240_000);
      const admin = await Api.login(request, SEED.admin);
      const wo = await admin.byNumber("/work-orders", "WO-000002");
      await signIn(page, SEED.admin, "/ops");
      const found: string[] = [];
      for (const path of [...PAGES, `/work-orders/${String(wo.id)}`]) {
        // A client redirect from the previous page can abort the first navigation, so retry once.
        await page.goto(path).catch(async () => page.goto(path));
        await expect(page.getByRole("main")).toBeVisible();
        await expect(page.getByRole("main").getByRole("heading").first()).toBeVisible();
        await page.waitForLoadState("networkidle").catch(() => undefined);
        for (const violation of await blockingViolations(page)) found.push(`${path}: ${violation}`);
      }
      expect(found).toEqual([]);
    });
  });
}
