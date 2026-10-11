import { expect, test, type Locator, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

import { Api, unique } from "./support/api";
import { setLocale, signIn, signInWithForm } from "./support/auth";
import { SEED, SEED_INVITE_CODE, SEED_PASSWORD, WEB_URL } from "./support/env";
import { clearLoginLimits, clearSignupLimits } from "./support/limits";
import { pickOption, toast } from "./support/ui";

/** Completes the interactive login form of the mock OIDC provider (navikt mock-oauth2-server). */
async function mockProviderLogin(page: Page, subject: string, email: string): Promise<void> {
  await page.locator('input[name="username"]').fill(subject);
  await page.locator('textarea[name="claims"]').fill(JSON.stringify({ email, email_verified: true, name: "E2E Google User" }));
  await page.locator('input[type="submit"], button[type="submit"]').first().click();
}

/** Authentication and account flows (AUTH-01 … AUTH-09, PLT-01 … PLT-03). */
test.describe("authentication", () => {
  test.beforeEach(async ({ page }) => {
    await setLocale(page, "en");
  });

  test("password login, wrong password and sign out", async ({ page }) => {
    await signInWithForm(page, SEED.manager, "not-the-password");
    await expect(page.getByText("Email or password did not match")).toBeVisible();
    await expect(page).toHaveURL(/\/login/u);

    await signInWithForm(page, SEED.manager);
    await expect(page).toHaveURL(/\/ops$/u);
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

    // The account button opens a disclosure panel (not a menu) that holds the sign-out button.
    await page.getByRole("button", { name: "Account and preferences for Paulo Gerente" }).click();
    await page.getByRole("region", { name: "Account and preferences for Paulo Gerente" }).getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/u);
    await page.goto("/ops");
    await expect(page).toHaveURL(/\/login/u);
  });

  test("change password and sign in with the new one", async ({ page, request }) => {
    const email = SEED.dispatcher;
    const fresh = `e2e-${Date.now().toString(36)}-pass`;
    await signIn(page, email, "/change-password");
    try {
      await page.getByRole("textbox", { name: "Current password", exact: true }).fill(SEED_PASSWORD);
      await page.getByRole("textbox", { name: "New password", exact: true }).fill(fresh);
      await page.getByRole("textbox", { name: "Confirm new password", exact: true }).fill(fresh);
      await page.getByRole("button", { name: "Save new password" }).click();
      await expect(page).not.toHaveURL(/\/change-password/u);

      const withNew = await Api.login(request, email, fresh);
      expect(withNew.session.userId).not.toBe("");
    } finally {
      // Restore the seed password so the rest of the suite can sign in as the dispatcher.
      await clearLoginLimits(email);
      const login = await request.post(`${WEB_URL}/api/v1/auth/login`, { data: { email, password: fresh, deviceId: randomUUID(), platform: "ANDROID" } });
      if (login.ok()) {
        const token = String(((await login.json()) as { accessToken: string }).accessToken);
        await request.post(`${WEB_URL}/api/v1/auth/change-password`, { data: { current: fresh, next: SEED_PASSWORD }, headers: { authorization: `Bearer ${token}` } });
      }
    }
    const restored = await Api.login(request, email);
    expect(restored.session.userId).not.toBe("");
  });

  test("switch the language to Portuguese and back", async ({ page }) => {
    await signIn(page, SEED.manager, "/ops");
    // The language switch lives in the account panel of the top bar.
    await page.getByRole("button", { name: "Account and preferences for Paulo Gerente" }).click();
    await pickOption(page.getByRole("combobox", { name: "Language" }), "Português");
    await expect(page.getByRole("link", { name: "Visão geral", exact: true })).toBeVisible();
    const idioma = page.getByRole("combobox", { name: "Idioma" });
    if (!(await idioma.isVisible())) await page.getByRole("button", { name: "Conta e preferências de Paulo Gerente" }).click();
    await pickOption(idioma, "English");
    await expect(page.getByRole("link", { name: "Overview", exact: true })).toBeVisible();
  });

  test("Google login links a seeded member through the mock provider", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Continue with Google" }).click();
    await mockProviderLogin(page, unique("google-sub").replace(/\s/gu, "-"), SEED.manager);
    await expect(page).toHaveURL(/\/ops/u);
    await expect(page.getByRole("button", { name: "Paulo Gerente" })).toBeVisible();
  });

  test("Google sign-up creates a new company", async ({ page }) => {
    const email = `owner-${Date.now().toString(36)}@e2e.example.com`;
    await clearSignupLimits();
    await page.goto("/signup");
    await page.getByRole("link", { name: "Continue with Google" }).click();
    await mockProviderLogin(page, `signup-${Date.now().toString(36)}`, email);

    await expect(page).toHaveURL(/\/signup\/company\?ticket=/u);
    const create = page.getByRole("button", { name: "Create account and start the trial" });
    // The form may still be hydrating on a cold dev compile; refill until React has taken the values.
    await expect(async () => {
      await page.getByRole("textbox", { name: "Company name" }).fill(unique("Fazenda Nova"));
      await page.getByRole("textbox", { name: "Office phone" }).fill("(16) 3333-4444");
      await page.getByRole("checkbox", { name: /I have read and accept/u }).setChecked(false);
      await page.getByRole("checkbox", { name: /I have read and accept/u }).check();
      await expect(create).toBeEnabled({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    await create.click();

    await expect(page).not.toHaveURL(/\/signup/u, { timeout: 60_000 });
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("invite redemption sends a field user to the app page", async ({ page }) => {
    await page.goto(`/i/${SEED_INVITE_CODE}`);
    await expect(page.getByText(SEED.invited)).toBeVisible();
    const password = `e2e-${Date.now().toString(36)}-invite`;
    await page.getByRole("textbox", { name: "New password", exact: true }).fill(password);
    await page.getByRole("button", { name: "Create password and sign in" }).click();
    await expect(page.getByRole("heading", { name: "Use the AgroRende app" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);
  });

  test("a field user signing in on the web sees OFFICE_ROLE_REQUIRED", async ({ page }) => {
    await signInWithForm(page, SEED.tech1);
    await expect(page.getByRole("heading", { name: "Use the AgroRende app" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/u);
  });

  test("the last admin cannot lose the Admin role", async ({ page, request }) => {
    const admin = await Api.login(request, SEED.admin);
    await signIn(page, SEED.admin, `/team/${admin.session.userId}`);
    await page.getByRole("button", { name: "Change role" }).click();
    await pickOption(page.getByRole("dialog").getByRole("combobox", { name: "Role" }), "Manager");
    await page.getByRole("dialog").getByRole("button", { name: "Change role" }).click();
    await expect(page.getByRole("dialog").getByText("The company needs an Admin")).toBeVisible();
    expect(await admin.get("/auth/me")).toMatchObject({ role: "ADMIN" });
  });

  test("platform console suspends and restores a company", async ({ page, browser, request }) => {
    const admin = await Api.login(request, SEED.admin);
    await page.goto("/platform/login");
    await page.getByLabel("Staff e-mail (local)").fill(SEED.staff);
    await page.getByRole("button", { name: "Sign in locally" }).click();
    await mockProviderLogin(page, `staff-${Date.now().toString(36)}`, SEED.staff);
    await expect(page.getByRole("heading", { name: "Companies" })).toBeVisible();
    await page.getByRole("row", { name: /AgroRende Demo Agro/u }).getByRole("button", { name: "Open" }).click();
    await expect(page).toHaveURL(/\/platform\/orgs\/[^/?]+$/u, { timeout: 60_000 });

    const status = page.getByRole("combobox", { name: "Status" });
    const reason = page.getByRole("textbox", { name: "Reason" });
    const save = page.getByRole("button", { name: "Save changes" });
    await expect(save).toBeVisible();
    const initial = await status.inputValue();
    try {
      await pickOption(status, "Paused");
      await reason.fill("E2E: payment overdue for 30 days.");
      await saveAndWait(page, save);
      await expect(toast(page, "Changes saved.")).toBeVisible();

      const context = await browser.newContext({ locale: "en-US" });
      const adminPage = await context.newPage();
      await setLocale(adminPage, "en");
      await signIn(adminPage, SEED.admin, "/ops");
      await expect(adminPage.getByText(/Account suspended|Access paused: read-only/u).first()).toBeVisible();
      await context.close();

      // EC-OPS-29: while suspended the company is read-only, so writes are refused.
      const blocked = await admin.raw("POST", "/customers", { name: unique("While suspended") });
      expect(blocked.ok()).toBe(false);
    } finally {
      await status.selectOption(initial);
      await reason.fill("E2E: payment received.");
      // The first save's toast can still be on screen, so wait for the restore request itself.
      await saveAndWait(page, save);
    }
    const writable = await admin.raw("POST", "/customers", { name: unique("After restore") });
    expect(writable.ok(), await writable.text()).toBe(true);
  });
});

/** Clicks save and waits for the platform PATCH to succeed, so later API calls see the new state. */
async function saveAndWait(page: Page, save: Locator): Promise<void> {
  const response = page.waitForResponse((r) => r.request().method() === "PATCH" && /\/platform\/orgs\/[^/]+$/u.test(new URL(r.url()).pathname));
  await save.click();
  expect((await response).ok()).toBe(true);
}
