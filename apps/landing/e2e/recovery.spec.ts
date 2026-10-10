import { expect, test } from "@playwright/test";

test.describe("root", () => {
  test("redirects / to Portuguese by default", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/pt-br\/$/u);
  });

  test.describe("English browser", () => {
    test.use({ locale: "en-US" });
    test("redirects / to English", async ({ page }) => {
      await page.goto("/");
      await expect(page).toHaveURL(/\/en\/$/u);
    });
  });

  test("the static index.html works without the server redirect and without JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/index.html");
    await expect(page).toHaveURL(/\/pt-br\/$/u);
    await context.close();
  });
});

test.describe("EC-SITE-01 unsupported locale", () => {
  test.use({ locale: "es-AR" });
  test("/es/ lands on Portuguese with the banner, which can be dismissed", async ({ page }) => {
    await page.goto("/es/");
    await expect(page).toHaveURL(/\/pt-br\/\?unsupported=es$/u);
    const banner = page.locator("#locale-banner");
    await expect(banner).toBeVisible();
    await banner.locator("[data-dismiss]").click();
    await expect(banner).toBeHidden();
  });

  test("wrong-case locale prefixes are corrected", async ({ page }) => {
    await page.goto("/PT-BR/planos/");
    await expect(page).toHaveURL(/\/pt-br\/planos\/$/u);
  });
});

test.describe("EC-SITE-02 page not found", () => {
  test("unknown Portuguese paths answer 404 with the localized page and a way back", async ({ page }) => {
    const response = await page.goto("/pt-br/nao-existe/");
    expect(response?.status()).toBe(404);
    await expect(page.locator('[data-page="not-found"]')).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
    await expect(page.locator('main a[href="/pt-br/"]').first()).toBeVisible();
    await expect(page.locator("main a[data-help-search]")).toHaveAttribute("href", "/pt-br/ajuda/");
  });

  test("unknown English paths answer 404 in English", async ({ page }) => {
    const response = await page.goto("/en/missing/");
    expect(response?.status()).toBe(404);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator('[data-page="not-found"]')).toBeVisible();
  });
});

test.describe("EC-SITE-07 unknown help code", () => {
  test("an unknown code shows the help-unknown page with the code as text and a search link", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto("/pt-br/ajuda/erros/NAO_EXISTE_123/");
    await expect(page).toHaveURL(/codigo-desconhecido\/\?code=NAO_EXISTE_123$/u);
    await expect(page.locator('[data-page="help-unknown"]')).toBeVisible();
    await expect(page.locator("[data-unknown-code]")).toHaveText("NAO_EXISTE_123");
    await expect(page.locator("a[data-help-search]").first()).toHaveAttribute("href", /\?q=NAO_EXISTE_123/u);
    expect(pageErrors).toEqual([]);
  });

  test("an upper-case known code goes to its canonical page", async ({ page }) => {
    await page.goto("/en/help/errors/FIRST_SYNC_LARGE/");
    await expect(page).toHaveURL(/\/en\/help\/errors\/first-sync-large\/$/u);
    await expect(page.locator("h1")).toBeVisible();
  });

  test("the help search filters the codes and reads ?q", async ({ page }) => {
    await page.goto("/pt-br/ajuda/?q=first%20sync");
    const input = page.locator("[data-help-search-input]");
    await expect(input).toHaveValue("first sync");
    await expect(page.locator('a[data-code="FIRST_SYNC_LARGE"]')).toBeVisible();
    await input.fill("zzzz-nada");
    await expect(page.locator("a[data-code]:visible")).toHaveCount(0);
    await expect(page.locator("main [role=status]")).not.toBeEmpty();
  });
});

test.describe("EC-SITE-05 JavaScript disabled", () => {
  test.use({ javaScriptEnabled: false });
  test("content, navigation, CTAs and help pages work without JavaScript", async ({ page }) => {
    await page.goto("/pt-br/");
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator('[data-cta="signup"]').first()).toBeVisible();
    await expect(page.locator('[data-contact="whatsapp"]').first()).toHaveAttribute("href", /^https:\/\/wa\.me\//u);
    await page.locator('a[href="/pt-br/planos/"]').first().click();
    await expect(page).toHaveURL(/\/pt-br\/planos\/$/u);
    await page.goto("/pt-br/ajuda/");
    await page.locator("details#codigos > summary").click();
    await expect(page.locator('a[href="/pt-br/ajuda/erros/first-sync-large/"]')).toBeVisible();
  });
});

test.describe("EC-SITE-06 slow network", () => {
  test("?lite=1 switches to lite mode with a retry", async ({ page }) => {
    await page.goto("/pt-br/?lite=1");
    await expect(page.locator("html")).toHaveAttribute("data-lite", "on");
    const notice = page.locator("[data-lite-notice]");
    await expect(notice).toBeVisible();
    await notice.locator("[data-lite-retry]").click();
    await expect(page.locator("html")).toHaveAttribute("data-lite", "off");
    await expect(notice).toBeHidden();
  });

  test("a failed image switches to lite mode", async ({ page }) => {
    await page.route("**/brand/**", (route) => route.abort());
    await page.goto("/pt-br/");
    await expect(page.locator("html")).toHaveAttribute("data-lite", "on");
  });
});
