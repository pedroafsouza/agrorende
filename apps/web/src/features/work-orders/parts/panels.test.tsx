// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import enCommon from "../../../../messages/en/common.json";
import enErrors from "../../../../messages/en/errors.json";
import enJobs from "../../../../messages/en/jobs.json";

import { canEditExternalCost, ExternalCostPanel } from "./ExternalCostPanel";
import { isCatalogLine, PartsPanel } from "./PartsPanel";

const api = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, api: (...args: unknown[]) => api(...args) };
});

const WO = "00000000-0000-4000-8000-000000000001";
const PART = "00000000-0000-4000-8000-000000000002";
const VAN = "00000000-0000-4000-8000-000000000003";

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
});

function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ common: enCommon, errors: enErrors, jobs: enJobs }} timeZone="America/Sao_Paulo">
        {children}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("PartsPanel (WO-09 P1)", () => {
  it("tells catalog lines with their van and stock left apart from free-text lines", async () => {
    api.mockResolvedValue({ items: [{ partId: PART, stockLocationId: VAN, quantity: 3, locationName: "Carlos van" }] });
    wrap(
      <PartsPanel
        parts={[
          { id: "l1", name: "Oil filter", quantity: 2, unit: "un", unitCostCents: 4_500, partNumber: "FO-200", partId: PART, stockLocationId: VAN } as never,
          { id: "l2", name: "Hose clamp", quantity: 4, unit: "un", unitCostCents: null, partNumber: null },
        ]}
      />,
    );
    expect(screen.getByText("Catalog")).toBeTruthy();
    expect(screen.getByText("Free text")).toBeTruthy();
    expect(screen.getByText("Not taken from stock")).toBeTruthy();
    await screen.findByText(/Taken from Carlos van/u);
    expect(screen.getByText(/3 left there/u)).toBeTruthy();
    expect(api).toHaveBeenCalledWith("/stock-levels");
  });

  it("does not query stock when every line is free text", () => {
    wrap(<PartsPanel parts={[{ id: "l2", name: "Hose clamp", quantity: 4, unit: "un" }]} />);
    expect(api).not.toHaveBeenCalled();
    expect(isCatalogLine({ id: "x", name: "x", quantity: 1, unit: "un", partId: PART, stockLocationId: null })).toBe(false);
  });
});

describe("ExternalCostPanel (ERP-03 P1)", () => {
  it("is editable from COMPLETED on only", () => {
    expect(["OPEN", "IN_PROGRESS", "ON_HOLD", "CANCELLED"].map(canEditExternalCost)).toEqual([false, false, false, false]);
    expect(["COMPLETED", "VERIFIED"].map(canEditExternalCost)).toEqual([true, true]);
  });

  it("locks the value before completion and explains why", () => {
    wrap(<ExternalCostPanel workOrder={{ id: WO, status: "IN_PROGRESS", syncVersion: "3", externalCostCents: null, externalCostNote: null }} />);
    expect(screen.getByText("No external cost recorded.")).toBeTruthy();
    expect(screen.getByText("The external cost can be recorded once the job is completed.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add external cost" })).toBeNull();
  });

  it("saves the value with If-Match on a completed job", async () => {
    api.mockResolvedValue({ id: WO });
    wrap(<ExternalCostPanel workOrder={{ id: WO, status: "COMPLETED", syncVersion: "7", externalCostCents: 12_000, externalCostNote: "Lathe work" }} />);
    expect(screen.getByText("Lathe work")).toBeTruthy();
    expect(screen.getByText("Included in the job total and in the machine cost.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit external cost" }));
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Lathe and welding" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(`/work-orders/${WO}/external-cost`, { method: "PATCH", body: { externalCostCents: 12_000, externalCostNote: "Lathe and welding" }, version: "7" }),
    );
  });
});
