import { readFile } from "node:fs/promises";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { Api, unique } from "./support/api";
import { signIn } from "./support/auth";
import { SEED } from "./support/env";
import { dialog, toast } from "./support/ui";

/**
 * Power tools (T16): the ⌘K command palette is fully usable from the keyboard, the analytics page
 * opens from it, assets get a printable QR label sheet, and a plot boundary saves with a computed area.
 */

const PALETTE = "Search and commands";

/** Ctrl+K before hydration attaches the shortcut listener does nothing, so press until the palette shows. */
async function openPalette(page: Page, palette: Locator): Promise<void> {
  await expect(async () => {
    if (!(await palette.isVisible())) await page.keyboard.press("Control+k");
    await expect(palette).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}

async function moveSelectionTo(page: Page, text: string | RegExp): Promise<void> {
  const palette = dialog(page, PALETTE);
  for (let step = 0; step < 25; step += 1) {
    const current = palette.locator('[cmdk-item][aria-selected="true"]');
    if ((await current.count()) > 0 && (typeof text === "string" ? ((await current.textContent()) ?? "").includes(text) : text.test((await current.textContent()) ?? ""))) return;
    await page.keyboard.press("ArrowDown");
  }
  throw new Error(`palette item ${String(text)} never became selected`);
}

test.describe("power tools", () => {
  test("Ctrl+K finds a machine and opens it using only the keyboard", async ({ page, request }) => {
    const admin = await Api.login(request, SEED.admin);
    const name = unique("Palette tractor");
    const asset = await admin.createAsset({ name });

    await signIn(page, SEED.manager, "/ops");
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

    const palette = dialog(page, PALETTE);
    await openPalette(page, palette);
    const input = palette.getByRole("combobox");
    await expect(input).toBeFocused();
    await page.keyboard.type(String(asset.code));
    await expect(palette.getByRole("option", { name: new RegExp(name, "u") })).toBeVisible();
    await moveSelectionTo(page, name);
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(new RegExp(`/assets/${String(asset.id)}$`, "u"));
    await expect(palette).toBeHidden();
    await expect(page.getByRole("heading", { name })).toBeVisible();
  });

  test("the palette opens Analytics, and the cost tab is reachable with arrow keys", async ({ page }) => {
    await signIn(page, SEED.manager, "/assets");
    await expect(page.getByRole("heading", { name: "Assets" })).toBeVisible();

    await openPalette(page, dialog(page, PALETTE));
    await page.keyboard.type("analyt");
    await moveSelectionTo(page, "Analytics");
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/analytics/u);
    await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Mean time to repair" })).toBeVisible();
    // A key pressed before the tab list hydrates is lost on a cold dev compile; retry until it lands.
    await expect(async () => {
      await page.getByRole("tab", { name: "Operations" }).focus();
      await page.keyboard.press("ArrowRight");
      await expect(page.getByRole("tab", { name: "Costs" })).toHaveAttribute("aria-selected", "true", { timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    await expect(page.getByRole("tab", { name: "Costs" })).toBeFocused();
    await expect(page).toHaveURL(/tab=costs/u);
    await expect(page.locator("caption", { hasText: /Costs by/u })).toBeAttached();
  });

  test("selected assets download one A4 PDF of QR labels", async ({ page, request }) => {
    const admin = await Api.login(request, SEED.admin);
    const prefix = unique("QR batch");
    const first = await admin.createAsset({ name: `${prefix} A` });
    const second = await admin.createAsset({ name: `${prefix} B` });

    await signIn(page, SEED.manager, `/assets?q=${encodeURIComponent(prefix)}`);
    await expect(page.getByRole("cell", { name: `${prefix} A` })).toBeVisible();
    await page.getByRole("checkbox", { name: `Select ${String(first.code)}` }).check();
    await page.getByRole("checkbox", { name: `Select ${String(second.code)}` }).check();
    const bar = page.getByRole("region", { name: "Selected assets" });
    await expect(bar).toContainText("2 assets selected");
    await expect(page).toHaveURL(/\/assets\?/u);

    // The bulk action previews the A4 sheet in a modal first; its PDF button downloads the sheet.
    await bar.getByRole("button", { name: "Print QR labels" }).click();
    const modal = dialog(page, "2 QR labels");
    await expect(modal).toBeVisible();
    await expect(modal.getByTestId("qr-label")).toHaveCount(2);
    const download = page.waitForEvent("download", { timeout: 60_000 });
    await modal.getByRole("button", { name: "Download PDF" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe("agrorende-qr.pdf");
    const bytes = await readFile(await file.path());
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1_000);
    await expect(toast(page, "QR label sheet for 2 assets downloaded")).toBeVisible();
  });

  test("a typed plot boundary saves and the server recomputes the area", async ({ page, request }) => {
    const admin = await Api.login(request, SEED.admin);
    const site = await admin.send("POST", "/sites", { name: unique("Boundary farm"), type: "FARM", lat: -12.555, lng: -55.711 });
    const plotName = unique("Talhão");
    const plot = await admin.send("POST", `/sites/${String(site.id)}/plots`, { name: plotName, areaHa: 50 });

    await signIn(page, SEED.manager, `/sites/${String(site.id)}`);
    await page.getByRole("button", { name: `Boundary of ${plotName}` }).click();
    const form = dialog(page, `Boundary of ${plotName}`);
    await expect(form).toBeVisible();
    await form.getByLabel("Corners (longitude, latitude)").fill(["-55.721534, -12.545812", "-55.700921, -12.546303", "-55.698774, -12.561127", "-55.709412, -12.566938", "-55.722866, -12.559455"].join("\n"));
    await expect(form.getByTestId("boundary-area")).toContainText(/Area from the boundary: [\d,.]+ ha/u);
    await form.getByRole("button", { name: "Save boundary" }).click();
    await expect(toast(page, /Boundary saved\. Area: [\d,.]+ ha/u)).toBeVisible();
    await expect(form).toBeHidden();

    const saved = await admin.get(`/plots/${String(plot.id)}`);
    expect(Number(saved.areaHa)).toBeGreaterThan(200);
    expect(Number(saved.areaHa)).not.toBe(50);
    expect((saved.boundary as { coordinates: unknown[][] }).coordinates[0]).toHaveLength(6);
  });
});
