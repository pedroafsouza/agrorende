// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import enCommon from "../../../messages/en/common.json";
import enErrors from "../../../messages/en/errors.json";

import { ApiError } from "@/lib/api";

import { BillingActions } from "./index";

const api = vi.fn();
const push = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, api: (...args: unknown[]) => api(...args) };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/work-orders/x", useSearchParams: () => new URLSearchParams() }));

const WO = "00000000-0000-4000-8000-000000000001";
const CUSTOMER = "00000000-0000-4000-8000-0000000000c1";
const DOC = "00000000-0000-4000-8000-0000000000d1";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

afterEach(() => {
  cleanup();
  api.mockReset();
  push.mockReset();
});

function renderPanel(entityType: "WORK_ORDER" | "RENTAL") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ common: enCommon, errors: enErrors }} timeZone="America/Sao_Paulo">
        <BillingActions entityId={WO} entityType={entityType} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("BillingActions mount point", () => {
  it("creates a draft from a work order with the prefilled lines", async () => {
    api.mockImplementation((path: string, init?: { method?: string }) => {
      if (path === "/billing-documents/preview") return Promise.resolve({ lines: [{ description: "Labour", quantity: 2, unitAmountCents: 1500, amountCents: 3000 }], customerId: CUSTOMER, existingId: null });
      if (path === "/billing-documents" && init?.method === "POST") return Promise.resolve({ id: DOC });
      return Promise.resolve({ items: [], nextCursor: null });
    });
    renderPanel("WORK_ORDER");
    fireEvent.click(await screen.findByRole("button", { name: "Create billing document" }));
    expect(api).toHaveBeenCalledWith("/billing-documents/preview", { query: { workOrderId: WO } });
    expect((screen.getByDisplayValue("Labour") as HTMLInputElement).value).toBe("Labour");
    fireEvent.click(screen.getByRole("button", { name: "Create draft" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/billing/${DOC}`));
    const post = api.mock.calls.find((call) => call[0] === "/billing-documents" && (call[1] as { method?: string }).method === "POST");
    expect((post?.[1] as { body: Record<string, unknown> }).body).toMatchObject({ source: "WORK_ORDER", workOrderId: WO, customerId: CUSTOMER, lines: [{ description: "Labour", quantity: 2, unitAmountCents: 1500 }], discountCents: 0 });
  });

  it("links to the existing document instead of billing twice", async () => {
    api.mockResolvedValue({ lines: [], customerId: CUSTOMER, existingId: DOC });
    renderPanel("RENTAL");
    const link = await screen.findByRole("link", { name: "Open billing document" });
    expect(link.getAttribute("href")).toBe(`/billing/${DOC}`);
    expect(screen.queryByRole("button", { name: "Create billing document" })).toBeNull();
  });

  it("stays hidden for a rental without a document and for a cancelled work order", async () => {
    api.mockResolvedValueOnce({ lines: [], customerId: CUSTOMER, existingId: null });
    const first = renderPanel("RENTAL");
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole("button")).toBeNull();
    first.unmount();
    api.mockRejectedValueOnce(new ApiError({ status: 409, code: "WO_CANCELLED" }));
    renderPanel("WORK_ORDER");
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole("region")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
