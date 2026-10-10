import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";

import { Api } from "./support/api";
import { E2E_DB, GOOGLE_ISSUER, MEDIA_ROOT_ABS, OIDC_PORT, REALTIME_PORT, REALTIME_URL, SEED, WEB_PORT, WEB_URL } from "./support/env";

/**
 * T11.1: proves the suite runs on its own isolated stack before any other spec touches data.
 * Every other project depends on this one.
 */
test("the E2E stack is isolated and seeded", async ({ request }) => {
  expect(process.env.MONGODB_DB).toBe(E2E_DB);
  expect(process.env.MEDIA_ROOT).toBe(MEDIA_ROOT_ABS);
  expect(process.env.MEDIA_ROOT?.endsWith("/.data/media-e2e")).toBe(true);
  expect(existsSync(MEDIA_ROOT_ABS)).toBe(true);
  expect(process.env.APP_URL).toBe(`http://localhost:${WEB_PORT}`);
  expect(process.env.REALTIME_PORT).toBe(String(REALTIME_PORT));
  expect(process.env.NEXT_PUBLIC_REALTIME_URL).toBe(`http://localhost:${REALTIME_PORT}`);
  expect(process.env.REALTIME_CORS_ORIGINS).toBe(`http://localhost:${WEB_PORT}`);
  expect(process.env.GOOGLE_OIDC_ISSUER).toBe(`http://localhost:${OIDC_PORT}/google`);

  const health = await request.get(`${WEB_URL}/api/v1/health`);
  expect(health.status()).toBe(200);
  const body = (await health.json()) as Record<string, unknown>;
  expect(body).toMatchObject({ ok: true, app: "agrorende", db: true, redis: true, media: true });

  expect((await request.get(`${REALTIME_URL}/health`)).status()).toBe(200);

  const discovery = await request.get(`${GOOGLE_ISSUER}/.well-known/openid-configuration`);
  expect(discovery.status()).toBe(200);
  expect(((await discovery.json()) as { issuer: string }).issuer).toBe(GOOGLE_ISSUER);

  // The seeded organisation answers on this stack (ARCHITECTURE §17).
  const admin = await Api.login(request, SEED.admin);
  expect(admin.session.role).toBe("ADMIN");
  const asset = await admin.assetByCode("AGR-000012");
  expect(asset.name).toBe("Trator JD 6110J #12");
});

test("warms the dev server routes used by the suite", async ({ page }) => {
  test.setTimeout(600_000);
  const response = await page.request.post("/api/v1/auth/login", { data: { email: SEED.admin, password: "agrorende123" } });
  expect(response.status()).toBe(200);
  // Detail routes too: a create flow that `router.push`es into an uncompiled `[id]` route can wait on the dev compiler for longer than an assertion.
  const anyId = "00000000-0000-7000-8000-000000000000";
  const details = ["/assets", "/sites", "/rentals", "/customers", "/work-orders", "/team", "/templates"].map((base) => `${base}/${anyId}`);
  for (const path of ["/login", "/ops", "/reports", "/work-orders", "/rentals", "/rentals/new", "/assets", "/assets/new", "/sites", "/customers", "/templates", "/team", "/settings", "/account", "/attention", "/analytics", ...details]) {
    const visit = await page.goto(path, { timeout: 300_000 });
    expect(visit?.status(), path).toBeLessThan(500);
  }
});
