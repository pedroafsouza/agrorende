import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

import { Api, unique } from "./support/api";
import { signIn } from "./support/auth";
import { SEED } from "./support/env";
import { dialog, pickOption, toast } from "./support/ui";

/** Seeded jobs (ARCHITECTURE §17): WO-000012 and WO-000013 are COMPLETED, WO-000002 is OPEN. */
test.describe("work orders", () => {
  test("board drag to the Assigned column opens the assign dialog", async ({ page, request }) => {
    const admin = await Api.login(request, SEED.admin);
    const asset = await admin.createAsset({ name: unique("Board tractor") });
    const title = unique("Board job");
    const created = await admin.send("POST", "/work-orders", { title, type: "CORRECTIVE", priority: "MEDIUM", assetId: asset.id });
    const number = String(created.number);

    await signIn(page, SEED.dispatcher, `/work-orders?view=board&q=${encodeURIComponent(title)}`);
    const card = page.locator(`[data-work-order="${number}"]`);
    await expect(page.locator('[data-column="unassigned"]').locator(`[data-work-order="${number}"]`)).toBeVisible();
    await card.dragTo(page.locator('[data-column="assigned"]'));

    const assign = dialog(page, `Assign ${number}`);
    await expect(assign).toBeVisible();
    await pickOption(assign.getByLabel("Or pick anyone on the team"), "Carlos");
    await assign.getByRole("button", { name: "Assign", exact: true }).click();
    const offDuty = assign.getByRole("button", { name: /assign anyway/iu });
    if (await offDuty.isVisible().catch(() => false)) await offDuty.click();

    await expect(toast(page, "Job assigned")).toBeVisible();
    await expect(page.locator('[data-column="assigned"]').locator(`[data-work-order="${number}"]`)).toBeVisible();
    expect((await admin.get(`/work-orders/${String(created.id)}`)).status).toBe("ASSIGNED");
  });

  test("verify a completed job and download its PDF", async ({ page, request }) => {
    const admin = await Api.login(request, SEED.admin);
    const wo = await admin.byNumber("/work-orders", "WO-000012");
    await signIn(page, SEED.manager, `/work-orders/${String(wo.id)}`);
    await expect(page.getByRole("main").getByText("WO-000012", { exact: true })).toBeVisible();

    const download = page.waitForEvent("download", { timeout: 60_000 });
    await page.getByRole("link", { name: "PDF report" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe("WO-000012.pdf");
    const bytes = await readFile(await file.path());
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    await page.getByRole("button", { name: "Verify", exact: true }).click();
    const verify = dialog(page, "Verify job");
    await verify.getByRole("button", { name: "Verify", exact: true }).click();
    await expect(toast(page, "Job verified")).toBeVisible();
    expect((await admin.get(`/work-orders/${String(wo.id)}`)).status).toBe("VERIFIED");
  });

  test("reopen a completed job with a reason", async ({ page, request }) => {
    const admin = await Api.login(request, SEED.admin);
    const wo = await admin.byNumber("/work-orders", "WO-000013");
    await signIn(page, SEED.manager, `/work-orders/${String(wo.id)}`);
    await page.getByRole("button", { name: "Reopen", exact: true }).click();
    const reopen = dialog(page, "Reopen job");
    await reopen.getByLabel("Reason").fill("The leak came back after the test drive.");
    await reopen.getByRole("button", { name: "Reopen", exact: true }).click();
    await expect(toast(page, "Job reopened")).toBeVisible();
    const after = await admin.get(`/work-orders/${String(wo.id)}`);
    expect(after.status).not.toBe("COMPLETED");
  });

  test("cancel an open job with a reason", async ({ page, request }) => {
    const admin = await Api.login(request, SEED.admin);
    const wo = await admin.byNumber("/work-orders", "WO-000002");
    await signIn(page, SEED.manager, `/work-orders/${String(wo.id)}`);
    await page.getByRole("button", { name: "Cancel job" }).click();
    const cancel = dialog(page, "Cancel job");
    // The reason is required: the confirm stays disabled or the dialog stays open without it.
    await cancel.getByLabel("Reason").fill("Duplicate of a job opened by phone.");
    await cancel.getByRole("button", { name: "Cancel job" }).click();
    await expect(toast(page, "Job cancelled")).toBeVisible();
    const after = await admin.get(`/work-orders/${String(wo.id)}`);
    expect(after).toMatchObject({ status: "CANCELLED", cancelReason: "Duplicate of a job opened by phone." });
  });
});
