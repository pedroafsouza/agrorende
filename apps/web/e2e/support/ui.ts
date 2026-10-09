import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Selects the option of a native `<select>` whose text contains `text`. For an `EntityPicker` (a search
 * box followed by a select that lists the first 50 matches), `search` is typed into the search box first.
 */
export async function pickOption(select: Locator, text: string | RegExp, search?: string): Promise<void> {
  if (search !== undefined) {
    await select.locator("..").locator('input[type="search"]').fill(search);
  }
  const option = select.locator("option", { hasText: text }).first();
  await expect(option).toBeAttached();
  const value = await option.getAttribute("value");
  expect(value, `option ${String(text)}`).not.toBeNull();
  await select.selectOption(value ?? "");
}

/** Waits for a Sonner toast with the given text. */
export function toast(page: Page, text: string | RegExp): Locator {
  return page.locator("[data-sonner-toast]").filter({ hasText: text }).first();
}

/** The open modal dialog (the shared `Dialog` renders a native `<dialog>` or `role="dialog"`). */
export function dialog(page: Page, name: string | RegExp): Locator {
  return page.getByRole("dialog", { name });
}

/** Formats a local `datetime-local` value `days` from now at `hour`:00. */
export function localDateTime(days: number, hour = 8): string {
  const date = new Date(Date.now() + days * 86_400_000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(hour)}:00`;
}
