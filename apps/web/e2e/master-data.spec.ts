import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

import { Api, randomCpf, unique } from "./support/api";
import { signIn } from "./support/auth";
import { SEED } from "./support/env";
import { dialog, pickOption, toast } from "./support/ui";

const PNG_SIGNATURE = "89504e470d0a1a0a";

/** Master data (MD-01 … MD-06): assets with QR labels, sites with coordinates, checklists, customers. */
test.describe("master data", () => {
  test("create an asset and download its QR label", async ({ page }) => {
    const name = unique("Tractor E2E");
    const code = `QR-${Date.now().toString(36).toUpperCase()}`;
    await signIn(page, SEED.manager, "/assets/new");
    await page.getByRole("textbox", { name: "Name", exact: true }).fill(name);
    await page.getByRole("textbox", { name: "Code", exact: true }).fill(code);
    await pickOption(page.getByRole("combobox", { name: "Category", exact: true }), "Tractor");
    await page.getByRole("button", { name: "Create asset" }).click();

    await expect(page).toHaveURL(/\/assets\/[0-9a-f-]{36}$/u);
    await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();

    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download QR label" }).click();
    const file = await download;
    const bytes = await readFile(await file.path());
    expect(bytes.subarray(0, 8).toString("hex")).toBe(PNG_SIGNATURE);
  });

  test("create a site with coordinates and see it on the map", async ({ page }) => {
    const name = unique("Fazenda E2E");
    await signIn(page, SEED.manager, "/sites");
    const form = dialog(page, "New site");
    // On a cold dev compile the button can render before React hydrates it; retry until the dialog opens.
    await expect(async () => {
      await page.getByRole("button", { name: "New site" }).first().click({ timeout: 5_000 });
      await expect(form).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 60_000 });
    await form.getByRole("textbox", { name: "Name", exact: true }).fill(name);
    await pickOption(form.getByRole("combobox", { name: "Type", exact: true }), "Farm");
    await form.getByLabel("Latitude").fill("-21.1775");
    await form.getByLabel("Longitude").fill("-47.8103");
    await form.getByLabel("Radius (m)").fill("800");
    await form.getByRole("button", { name: "Create site" }).click();

    await expect(page).toHaveURL(/\/sites\/[0-9a-f-]{36}$/u);
    await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Site map" })).toBeVisible();
  });

  test("create a checklist and publish a new version", async ({ page }) => {
    const name = unique("Hand-over checklist");
    await signIn(page, SEED.manager, "/templates/new");
    await page.getByRole("textbox", { name: "Name", exact: true }).fill(name);
    // A new checklist starts with one empty item.
    await page.getByRole("textbox", { name: "Label (pt-BR)" }).first().fill("Pneus dianteiros");
    await page.getByRole("textbox", { name: "Label (en)" }).first().fill("Front tyres");
    await page.getByRole("button", { name: "Create checklist" }).click();

    await expect(page).toHaveURL(/\/templates\/[0-9a-f-]{36}$/u);
    await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
    await expect(page.getByText("Version 1", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Add item" }).click();
    await page.getByRole("textbox", { name: "Label (pt-BR)" }).nth(1).fill("Faróis");
    await page.getByRole("textbox", { name: "Label (en)" }).nth(1).fill("Headlights");
    await page.getByRole("button", { name: "Publish new version" }).click();
    await expect(toast(page, "Version 2 published")).toBeVisible();
    await expect(page.getByText("Version 2", { exact: true })).toBeVisible();
  });

  test("customer tax id is validated for CPF and CNPJ", async ({ page, request }) => {
    const admin = await Api.login(request, SEED.admin);
    await signIn(page, SEED.manager, "/customers");
    const form = dialog(page, "New customer");
    await expect(async () => {
      await page.getByRole("button", { name: "New customer" }).first().click({ timeout: 5_000 });
      await expect(form).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 60_000 });
    const name = unique("Agro Cliente");
    await form.getByRole("textbox", { name: "Name or legal name" }).fill(name);
    const taxId = form.getByLabel("CPF or CNPJ");

    await taxId.fill("123.456.789-00");
    await taxId.press("Tab");
    await expect(form.getByText("Invalid CPF or CNPJ")).toBeVisible();
    await taxId.fill("11.222.333/0001-00");
    await taxId.press("Tab");
    await expect(form.getByText("Invalid CPF or CNPJ")).toBeVisible();

    await taxId.fill("11.222.333/0001-81");
    await taxId.press("Tab");
    await expect(form.getByText("Invalid CPF or CNPJ")).toBeHidden();

    // A fresh valid CPF, because tax ids are unique per organisation and the suite may rerun.
    await taxId.fill(randomCpf());
    await taxId.press("Tab");
    await expect(form.getByText("Invalid CPF or CNPJ")).toBeHidden();
    await form.getByRole("button", { name: "Create customer" }).click();

    await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}$/u);
    await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
    const list = await admin.get(`/customers?q=${encodeURIComponent(name)}`);
    expect((list.items as unknown[]).length).toBe(1);
  });
});
