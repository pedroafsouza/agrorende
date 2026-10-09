import { expect, type Page } from "@playwright/test";

import { SEED_PASSWORD, WEB_URL } from "./env";
import { clearLoginLimits, testIp } from "./limits";

/**
 * Signs in through the web cookie session (`POST /api/v1/auth/login` without a `deviceId` sets the
 * `ar_access` and refresh cookies on the browser context) and opens `path`.
 */
export async function signIn(page: Page, email: string, path = "/ops", password = SEED_PASSWORD, locale: "en" | "pt-BR" = "en"): Promise<void> {
  await setLocale(page, locale);
  const ip = testIp();
  await clearLoginLimits(email, ip);
  const response = await page.request.post("/api/v1/auth/login", { data: { email, password }, headers: { "x-forwarded-for": ip } });
  expect(response.status(), `web login ${email}: ${await response.text()}`).toBe(200);
  await page.goto(path);
}

/**
 * Pins the UI language with the `NEXT_LOCALE` cookie. API requests made through `page.request` carry no
 * `Accept-Language`, so without the cookie the proxy would fall back to pt-BR.
 */
export async function setLocale(page: Page, locale: "en" | "pt-BR"): Promise<void> {
  await page.context().addCookies([{ name: "NEXT_LOCALE", value: locale, url: WEB_URL, sameSite: "Lax" }]);
}

/** Signs in through the real login form. */
export async function signInWithForm(page: Page, email: string, password = SEED_PASSWORD): Promise<void> {
  await clearLoginLimits(email);
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/** Forces the dark theme (next-themes stores the choice in `localStorage.theme`). */
export async function useTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.addInitScript((value) => {
    window.localStorage.setItem("theme", value);
  }, theme);
}
