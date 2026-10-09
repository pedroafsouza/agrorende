import { expect, test } from "@playwright/test";

import { Api, unique } from "./support/api";
import { signIn } from "./support/auth";
import { SEED } from "./support/env";
import { dialog, localDateTime, pickOption, toast } from "./support/ui";

/** Rentals (RN-01, RN-02, RN-10, RN-11): live eligibility, CUSTOMER_INCOMPLETE, reserve and close with charges. */
test.describe("rentals", () => {
  test("create with live eligibility, see CUSTOMER_INCOMPLETE, then reserve", async ({ page, request }) => {
    const admin = await Api.login(request, SEED.admin);
    const asset = await admin.createAsset({ name: unique("Rental tractor"), rentable: true });
    const customer = await admin.createCustomer({ name: unique("Rental customer") });

    await signIn(page, SEED.manager, "/rentals/new");
    await expect(page.getByRole("heading", { name: "New rental", level: 1 })).toBeVisible();
    await expect(page.getByText("Choose a machine and both dates to check availability.")).toBeVisible();

    const machine = page.getByRole("combobox", { name: "Machine", exact: true });
    const customerPicker = page.getByRole("combobox", { name: "Customer", exact: true });
    await pickOption(machine, String(asset.code), String(asset.code));
    // The seeded customer without a phone (ARCHITECTURE §17) blocks the reservation.
    await pickOption(customerPicker, "Cliente Sem Telefone A", "Cliente Sem Telefone A");
    await page.getByRole("textbox", { name: "Start", exact: true }).fill(localDateTime(3));
    await page.getByRole("textbox", { name: "End", exact: true }).fill(localDateTime(5, 18));

    await expect(page.getByText("Customer details are missing").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Complete customer details" })).toBeVisible();

    // Switching to a complete customer turns the live check green, then the rental is reserved.
    await pickOption(customerPicker, String(customer.name), String(customer.name));
    await expect(page.getByText("Machine available for these dates")).toBeVisible();
    await page.getByRole("button", { name: "Create and reserve" }).click();

    await expect(page).toHaveURL(/\/rentals\/[0-9a-f-]{36}$/u);
    await expect(page.getByRole("heading", { name: /Rental RN-\d{6}/u })).toBeVisible();
    const id = page.url().split("/").pop() ?? "";
    expect((await admin.get(`/rentals/${id}`)).status).toBe("RESERVED");
  });

  test("close a returned rental with an extra charge", async ({ page, request }) => {
    const admin = await Api.login(request, SEED.admin);
    const rental = await admin.byNumber("/rentals", "RN-000006");
    expect(rental.status).toBe("RETURNED");

    await signIn(page, SEED.manager, `/rentals/${String(rental.id)}`);
    await expect(page.getByRole("heading", { name: "Rental RN-000006" })).toBeVisible();

    const description = unique("Cleaning fee");
    await page.getByLabel("Description", { exact: true }).fill(description);
    await page.getByLabel("Quantity", { exact: true }).fill("1");
    const unitAmount = page.getByLabel("Unit amount", { exact: true });
    await unitAmount.fill("150.00");
    await unitAmount.press("Tab");
    await page.getByRole("button", { name: "Add line" }).click();
    await expect(toast(page, "Charge added")).toBeVisible();
    await expect(page.getByRole("cell", { name: description, exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Close rental" }).click();
    const close = dialog(page, "Close rental");
    await expect(close.getByText("Total", { exact: true })).toBeVisible();
    await close.getByLabel("Payment note").fill("Paid by PIX on return.");
    await close.getByRole("button", { name: /Close rental|Confirm new totals and close/u }).click();
    await expect(toast(page, "Rental closed")).toBeVisible();

    const closed = await admin.get(`/rentals/${String(rental.id)}`);
    expect(closed.status).toBe("CLOSED");
    expect(Number(closed.chargesTotalCents)).toBeGreaterThanOrEqual(15_000);
  });
});
