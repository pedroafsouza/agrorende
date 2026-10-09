import { expect, test, type Page } from "@playwright/test";

import { Api, unique } from "./support/api";
import { signIn } from "./support/auth";
import { SEED } from "./support/env";

function kpiTile(page: Page, key: string) {
  return page.locator(`button[data-kpi="${key}"]`);
}

async function kpiValue(page: Page, key: string): Promise<number> {
  const text = (await kpiTile(page, key).locator("span").last().textContent()) ?? "";
  return Number.parseInt(text.replace(/\D/gu, ""), 10);
}

/**
 * Ops Center live updates (OPS-01 … OPS-04): changes made elsewhere reach the KPI strip, the live
 * feed and the team list through the realtime socket, without reloading the page. Runs on the
 * desktop and the 1024 × 768 tablet projects.
 */
test.describe("ops center", () => {
  test("a new field report updates the KPI strip and the live feed without a reload", async ({ page, request }) => {
    const admin = await Api.login(request, SEED.admin);
    const carlos = await Api.login(request, SEED.tech1);
    const asset = await admin.createAsset({ name: unique("Ops tractor") });

    await signIn(page, SEED.manager, "/ops");
    await expect(page.getByRole("heading", { name: "Operations Center" })).toBeVisible();
    await expect(kpiTile(page, "open_reports").locator("span").last()).toHaveText(/\d/u);
    const before = await kpiValue(page, "open_reports");
    let navigations = 0;
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navigations += 1;
    });

    await carlos.createReport({ assetId: String(asset.id), title: unique("Ops live report"), priority: "HIGH" });

    await expect.poll(() => kpiValue(page, "open_reports"), { timeout: 30_000 }).toBe(before + 1);
    const feed = page.getByRole("region", { name: "Live feed" });
    await expect(feed.getByRole("listitem").first()).toContainText("field report", { timeout: 30_000 });
    expect(navigations).toBe(0);
  });

  test("an operator going on duty with a location appears live in the team list", async ({ page, request }) => {
    const tech = await Api.login(request, SEED.tech2);
    const me = await tech.get("/auth/me");
    const name = String((me.user as { name?: unknown }).name);
    await tech.apply([{ name: "user.setDuty", payload: { status: "OFF_DUTY" } }]);

    await signIn(page, SEED.manager, "/ops");
    const team = page.getByRole("region", { name: /Team on the map/u });
    await expect(team).toBeVisible();
    const operator = team.getByRole("button", { name: new RegExp(name, "u") });

    try {
      await tech.apply([{ name: "user.setDuty", payload: { status: "ON_DUTY", consent: true } }]);
      await tech.send("POST", "/locations/batch", {
        fixes: [{ recordedAt: new Date().toISOString(), lat: -21.1775, lng: -47.8103, accuracyM: 12, batteryLevel: 0.8 }],
      });
      // The seeded fixes are days old ("Out of date"); a fresh fix turns the operator live.
      await expect(operator).toContainText("Available", { timeout: 30_000 });
    } finally {
      await tech.apply([{ name: "user.setDuty", payload: { status: "OFF_DUTY" } }]);
    }
  });
});
