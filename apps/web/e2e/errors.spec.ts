import { expect, test, type Page } from "@playwright/test";

import { Api, unique } from "./support/api";
import { setLocale, signIn } from "./support/auth";
import { SEED, SEED_PASSWORD, WEB_URL } from "./support/env";
import { clearLoginLimits } from "./support/limits";
import { msg, REVIEW_LOCALES, reviewShot, uiLocale, type ReviewLocale } from "./support/review";

/** Signs the manager in on a fresh customer and opens its edit dialog. */
async function openCustomerEdit(page: Page, admin: Api, locale: ReviewLocale) {
  const customer = await admin.createCustomer({ name: unique("Errors customer") });
  await signIn(page, SEED.manager, `/customers/${String(customer.id)}`, SEED_PASSWORD, uiLocale(locale));
  await page.getByRole("button", { name: msg(locale, "common", "actions.edit") }).click();
  const edit = page.getByRole("dialog", { name: msg(locale, "assets", "customers.edit.title") });
  await expect(edit).toBeVisible();
  const name = edit.getByRole("textbox", { name: msg(locale, "assets", "customers.fields.name"), exact: true });
  await expect(name).toHaveValue(String(customer.name));
  return { id: String(customer.id), edit, name, save: edit.getByRole("button", { name: msg(locale, "common", "actions.save"), exact: true }) };
}

/**
 * Web error journeys (ERRORS.md EC-OPS-02, -05, -14, -17, EC-PLT-35, -36). Every recovery journey runs
 * in pt-BR, en and en-XA and saves a screenshot of the error state to `.data/reviews/T11/`.
 */
test.describe("error journeys", () => {
  for (const locale of REVIEW_LOCALES) {
    test(`EC-OPS-02 session expiry keeps the unsaved form (${locale})`, async ({ page, request }) => {
      const admin = await Api.login(request, SEED.admin);
      const { id, edit, name, save } = await openCustomerEdit(page, admin, locale);
      const typed = unique("Typed before expiry");
      await name.fill(typed);

      // Both session cookies disappear, so the silent refresh fails too and the re-login dialog opens.
      await page.context().clearCookies();
      await setLocale(page, uiLocale(locale));
      await save.click();
      const reauth = page.getByRole("dialog", { name: msg(locale, "common", "reauth.title") });
      await expect(reauth).toBeVisible();
      await expect(name).toHaveValue(typed);
      await reviewShot(page, "EC-OPS-02-reauth", locale);

      await clearLoginLimits(SEED.manager, "::1");
      await clearLoginLimits(SEED.manager, "127.0.0.1");
      await reauth.getByRole("textbox", { name: msg(locale, "common", "reauth.email") }).fill(SEED.manager);
      await reauth.getByRole("textbox", { name: msg(locale, "common", "reauth.password") }).fill(SEED_PASSWORD);
      await reauth.getByRole("button", { name: msg(locale, "common", "reauth.submit"), exact: true }).click();

      await expect(reauth).toBeHidden();
      await expect(edit).toBeHidden();
      await expect(page.getByText(msg(locale, "common", "toast.saved"), { exact: true })).toBeVisible();
      expect((await admin.get(`/customers/${id}`)).name).toBe(typed);
    });

    test(`EC-OPS-05 conflict keeps my edits (${locale})`, async ({ page, request }) => {
      const admin = await Api.login(request, SEED.admin);
      const { id, edit, name, save } = await openCustomerEdit(page, admin, locale);
      const mine = unique("Mine");
      await name.fill(mine);
      await admin.send("PATCH", `/customers/${id}`, { city: "Franca" });

      await save.click();
      await expect(edit.getByText(msg(locale, "errors", "CONFLICT.title"))).toBeVisible();
      await expect(name).toHaveValue(mine);
      await reviewShot(page, "EC-OPS-05-conflict", locale);

      await edit.getByRole("button", { name: msg(locale, "common", "conflict.keepMine") }).click();
      await expect(edit).toBeHidden();
      const saved = await admin.get(`/customers/${id}`);
      expect(saved).toMatchObject({ name: mine, city: "Franca" });
    });

    test(`EC-OPS-14 offline save keeps the form and succeeds once back online (${locale})`, async ({ page, request }) => {
      const admin = await Api.login(request, SEED.admin);
      const { id, edit, name, save } = await openCustomerEdit(page, admin, locale);
      await page.context().setOffline(true);
      const typed = unique("Typed offline");
      try {
        await name.fill(typed);
        await save.click();
        await expect(edit.getByText(msg(locale, "common", "offline.title"))).toBeVisible();
        await expect(name).toHaveValue(typed);
        await reviewShot(page, "EC-OPS-14-offline", locale);
      } finally {
        await page.context().setOffline(false);
      }
      await save.click();
      await expect(edit).toBeHidden();
      expect((await admin.get(`/customers/${id}`)).name).toBe(typed);
    });

    test(`EC-OPS-17 realtime loss shows the paused banner and recovers (${locale})`, async ({ page }) => {
      let blocked = false;
      // Only sockets that are still open count: a handshake from the page before a locale reload is not this page's connection.
      const live = new Map<{ close: (options?: { code?: number; reason?: string }) => Promise<void> }, { ready: boolean }>();
      await page.routeWebSocket(/localhost:4101/u, (ws) => {
        if (blocked) {
          void ws.close({ code: 4000, reason: "e2e realtime loss" });
          return;
        }
        const entry = { ready: false };
        live.set(ws, entry);
        const server = ws.connectToServer();
        server.onMessage((message) => {
          // Socket.IO's CONNECT packet ("40…") means the namespace handshake completed.
          if (typeof message === "string" && message.startsWith("40")) entry.ready = true;
          ws.send(message);
        });
        // Setting onClose disables Playwright's automatic close forwarding, so forward it here.
        ws.onClose((code, reason) => {
          live.delete(ws);
          void server.close({ code, reason });
        });
        server.onClose((code, reason) => {
          live.delete(ws);
          void ws.close({ code, reason });
        });
      });

      await signIn(page, SEED.manager, "/ops", SEED_PASSWORD, uiLocale(locale));
      await expect(page.getByRole("heading", { name: msg(locale, "ops", "title"), level: 1 })).toBeVisible();
      // Cut the link only after a real connection; a handshake that never finished is not a lost connection.
      await expect.poll(() => [...live.values()].some((entry) => entry.ready), { timeout: 30_000 }).toBe(true);
      const banner = page.getByTestId("realtime-paused");
      await expect(banner).toHaveCount(0);

      blocked = true;
      const open = [...live.keys()];
      live.clear();
      await Promise.all(open.map((ws) => ws.close({ code: 4000, reason: "e2e realtime loss" })));
      await expect(banner).toBeVisible({ timeout: 30_000 });
      await expect(banner).toContainText(msg(locale, "ops", "errors.REALTIME_DISCONNECTED.title"));
      await reviewShot(page, "EC-OPS-17-realtime-paused", locale);

      blocked = false;
      await expect(banner).toBeHidden({ timeout: 60_000 });
    });
  }

  test("EC-OPS-05 conflict can take the saved version", async ({ page, request }) => {
    const admin = await Api.login(request, SEED.admin);
    const { id, edit, name, save } = await openCustomerEdit(page, admin, "en");
    await name.fill(unique("Mine"));
    const theirs = unique("Theirs");
    await admin.send("PATCH", `/customers/${id}`, { name: theirs });

    await save.click();
    await expect(edit.getByText("This record changed")).toBeVisible();
    await edit.getByRole("button", { name: "Use the saved version" }).click();
    await expect(edit).toBeHidden();
    await expect(page.getByRole("heading", { name: theirs })).toBeVisible();
  });

  test("EC-PLT-35 an unknown or used invite offers a way forward", async ({ page }) => {
    await setLocale(page, "en");
    await page.goto("/i/ZZZZZZZZZZ");
    await expect(page.getByText("This invitation expired or was already used. Ask your administrator for a new one.")).toBeVisible();
  });

  test("EC-PLT-36 an office invite rejects a different Google email and stays available", async ({ page, request }) => {
    const admin = await Api.login(request, SEED.admin);
    const stamp = Date.now().toString(36);
    const created = await admin.send("POST", "/users", { name: unique("Office invitee"), role: "MANAGER", email: `office-${stamp}@e2e.example.com` });
    const code = String((created.invite as { code: string }).code);

    await setLocale(page, "en");
    await page.goto(`/i/${code}`);
    await page.getByRole("link", { name: "Continue with Google" }).click();
    await page.locator('input[name="username"]').fill(`other-${stamp}`);
    await page.locator('textarea[name="claims"]').fill(JSON.stringify({ email: `other-${stamp}@e2e.example.com`, email_verified: true, name: "Someone Else" }));
    await page.locator('input[type="submit"], button[type="submit"]').first().click();

    await expect(page.getByText("Use the invited email")).toBeVisible();
    await expect(page.getByText(`This manager invite is for o***@e2e.example.com.`, { exact: false })).toBeVisible();
    const lookup = await request.get(`${WEB_URL}/api/v1/auth/invites/${code}`);
    expect(lookup.status()).toBe(200);
  });
});
