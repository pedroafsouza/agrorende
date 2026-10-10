import { expect, test } from "@playwright/test";

import { expectNoAxeViolations, MAIN_PAGES, watchPage } from "./support";

for (const [locale, paths] of Object.entries(MAIN_PAGES)) {
  for (const path of paths) {
    test(`${path} renders, is accessible and stays on its own origin`, async ({ page, baseURL, context }) => {
      const watched = watchPage(page, new URL(baseURL ?? "").origin);
      const response = await page.goto(`${path}?lite=0`);
      expect(response?.status()).toBe(200);
      await page.waitForLoadState("load");
      await expect(page.locator("html")).toHaveAttribute("lang", locale === "en" ? "en" : "pt-BR");
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("main#main")).toBeVisible();
      await expectNoAxeViolations(page);
      expect(watched.errors).toEqual([]);
      expect(watched.foreign).toEqual([]);
      expect(await context.cookies()).toEqual([]);
      expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
    });
  }
}

test("dark mode keeps the pages accessible", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  for (const path of ["/pt-br/", "/en/pricing/", "/pt-br/ajuda/erros/first-sync-large/"]) {
    await page.goto(`${path}?lite=0`);
    await expectNoAxeViolations(page);
  }
});

test("touch targets in the header and CTAs are at least 48 px tall", async ({ page }) => {
  await page.goto("/pt-br/?lite=0");
  for (const selector of ['[data-cta="signup"]', '[data-contact="whatsapp"]', '[data-contact="email"]']) {
    const box = await page.locator(`main ${selector}`).first().boundingBox();
    expect(box?.height ?? 0, selector).toBeGreaterThanOrEqual(48);
  }
});
