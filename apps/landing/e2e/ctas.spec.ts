import { expect, test } from "@playwright/test";

test("CTAs point at the web app, WhatsApp and e-mail", async ({ page }) => {
  await page.goto("/pt-br/?lite=0");
  await expect(page.locator('[data-cta="signup"]').first()).toHaveAttribute("href", /\/signup$/u);
  const signin = page.locator('[data-cta="signin"]').first();
  if (await signin.isVisible()) await expect(signin).toHaveAttribute("href", /\/login$/u);
  await expect(page.locator('[data-contact="whatsapp"]').first()).toHaveAttribute("href", /^https:\/\/wa\.me\/\d+\?text=/u);
  await expect(page.locator('[data-contact="email"]').first()).toHaveAttribute("href", /^mailto:[^?]+@[^?]+\?subject=/u);
});

test("store badges stay hidden while the store URLs are not configured", async ({ page }) => {
  await page.goto("/pt-br/");
  await expect(page.locator("[data-stores]")).toHaveCount(0);
});

test("EC-SITE-03: a blocked WhatsApp popup opens the copy panel", async ({ page }) => {
  await page.goto("/pt-br/?lite=0");
  await page.waitForLoadState("load");
  await page.evaluate(() => {
    window.open = () => null;
  });
  await page.locator('[data-contact="whatsapp"]').first().click();
  const panel = page.locator('[data-fallback="whatsapp"]').first();
  await expect(panel).toBeVisible();
  await expect(panel.locator("input").first()).toHaveValue(/\+55/u);
});

test("EC-SITE-04: a mailto link nobody handles opens the copy panel", async ({ page }) => {
  await page.goto("/en/?lite=0");
  await page.waitForLoadState("load");
  await page.evaluate(() => {
    document.addEventListener("click", (event) => {
      if ((event.target as Element).closest('a[href^="mailto:"]')) event.preventDefault();
    });
  });
  await page.locator('[data-contact="email"]').first().click();
  const panel = page.locator('[data-fallback="email"]').first();
  await expect(panel).toBeVisible({ timeout: 6000 });
  await expect(panel.locator("input").first()).toHaveValue(/@/u);
});

test("pricing hides prices by default and offers contact instead", async ({ page }) => {
  await page.goto("/pt-br/planos/");
  await expect(page.locator('[data-prices="hidden"]')).toBeVisible();
  await expect(page.locator("main")).not.toContainText("R$");
});

test("legal pages show the terms version and the pending legal review marker", async ({ page }) => {
  for (const path of ["/pt-br/privacidade/", "/pt-br/termos/", "/en/dpa/"]) {
    await page.goto(path);
    await expect(page.locator("[data-legal]")).toBeVisible();
    await expect(page.locator("[data-terms-version]")).toHaveAttribute("data-terms-version", /\S+/u);
    await expect(page.locator('[data-legal-review="pending"]')).toHaveCount(1);
  }
});

test("the language switch keeps the page", async ({ page }) => {
  await page.goto("/pt-br/planos/");
  const visible = page.locator("[data-language-switch]:visible");
  if ((await visible.count()) === 0) await page.locator("details.menu > summary").click();
  await page.locator("[data-language-switch]:visible").first().click();
  await expect(page).toHaveURL(/\/en\/pricing\/$/u);
});
