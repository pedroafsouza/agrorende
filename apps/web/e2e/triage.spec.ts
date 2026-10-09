import { expect, test } from "@playwright/test";

import { Api, unique } from "./support/api";
import { signIn } from "./support/auth";
import { SEED } from "./support/env";
import { dialog, toast } from "./support/ui";

/**
 * Triage (A§15, FR-20, OPS-09): URL filters lead to the report, "Mark for repair" creates the job
 * with the suggested technician. Runs on the desktop and the 1024 × 768 tablet projects.
 */
test("URL filters to mark for repair with the suggested technician", async ({ page, request }) => {
  const admin = await Api.login(request, SEED.admin);
  const carlos = await Api.login(request, SEED.tech1);
  const asset = await admin.createAsset({ name: unique("Triage tractor") });
  const title = unique("Hydraulic leak");
  const report = await carlos.createReport({ assetId: String(asset.id), title, priority: "HIGH", category: "ENGINE" });

  await signIn(page, SEED.dispatcher, `/reports?priority=HIGH&q=${encodeURIComponent(title)}`);
  await expect(page.getByRole("heading", { name: "Field reports", level: 1 })).toBeVisible();
  // Filters live in the URL and are reflected in the controls.
  await expect(page.getByRole("combobox", { name: "Severity", exact: true })).toHaveValue("HIGH");
  await expect(page.getByPlaceholder("Search by number, title or machine")).toHaveValue(title);
  const row = page.getByRole("row").filter({ hasText: title });
  await expect(row).toHaveCount(1);
  await row.click();

  await expect(page).toHaveURL(new RegExp(`/reports/${report.id}$`, "u"));
  await expect(page.getByText(title).first()).toBeVisible();
  await page.getByRole("button", { name: "Mark for repair" }).click();

  const repair = dialog(page, "Mark for repair");
  await expect(repair).toBeVisible();
  await expect(repair.getByLabel("Job title")).toHaveValue(/.+/u);
  const suggested = repair.getByRole("group", { name: "Suggested" }).getByRole("button");
  await expect(suggested.first()).toBeVisible();
  const technician = (await suggested.first().innerText()).split(" · ")[0]?.trim() ?? "";
  await suggested.first().click();
  await expect(suggested.first()).toHaveAttribute("aria-pressed", "true");
  await repair.getByRole("button", { name: "Create job" }).click();

  await expect(toast(page, /Job WO-\d{6} created\./u)).toBeVisible();
  const created = await admin.get(`/field-reports/${report.id}`);
  const workOrderId = String(created.workOrderId ?? "");
  expect(workOrderId).not.toBe("");
  const workOrder = await admin.get(`/work-orders/${workOrderId}`);
  expect(workOrder.status).toBe("ASSIGNED");
  expect(String(workOrder.assigneeName ?? "")).toBe(technician);
});
