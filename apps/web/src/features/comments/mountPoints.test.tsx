// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import enCommon from "../../../messages/en/common.json";
import enErrors from "../../../messages/en/errors.json";
import enJobs from "../../../messages/en/jobs.json";
import enParts from "../../../messages/en/parts.json";

import { BillingActions } from "@/features/billing";
import { CommandPalette } from "@/features/command-palette";
import { ExternalCostPanel } from "@/features/work-orders/parts";

import { CommentThread } from "./index";

const api = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, api: (...args: unknown[]) => api(...args) };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/work-orders/x", useSearchParams: () => new URLSearchParams() }));

const id = "00000000-0000-4000-8000-000000000001";

afterEach(() => {
  cleanup();
  api.mockReset();
});

function renderWithIntl(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ common: enCommon, errors: enErrors, jobs: enJobs, parts: enParts }} timeZone="America/Sao_Paulo">
        {children}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function renderThread(entityType: "FIELD_REPORT" | "WORK_ORDER" | "RENTAL") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ common: enCommon, errors: enErrors }} timeZone="America/Sao_Paulo">
        <CommentThread entityId={id} entityType={entityType} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("wave 6 mount points", () => {
  it("CommentThread shows the empty state on every detail page", async () => {
    for (const entityType of ["FIELD_REPORT", "WORK_ORDER", "RENTAL"] as const) {
      api.mockResolvedValueOnce({ items: [] });
      const { unmount } = renderThread(entityType);
      await screen.findByText("No comments yet");
      expect(api).toHaveBeenLastCalledWith("/comments", { query: { entityType, entityId: id } });
      unmount();
    }
  });

  it("CommentThread lists the thread and posts a trimmed comment", async () => {
    api.mockImplementation((_path: string, init?: { method?: string }) => {
      if (init?.method === "POST") return Promise.resolve({ id: "c2" });
      return Promise.resolve({ items: [{ id: "c1", entityType: "WORK_ORDER", entityId: id, authorId: "u1", authorName: "Carlos", body: "Belt replaced", createdAt: "2025-03-01T12:00:00.000Z" }] });
    });
    renderThread("WORK_ORDER");
    await screen.findByText("Belt replaced");
    expect(screen.getByText("Carlos")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("New comment"), { target: { value: "  Checked the pump  " } });
    fireEvent.click(screen.getByRole("button", { name: "Post comment" }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/comments", { method: "POST", body: { entityType: "WORK_ORDER", entityId: id, body: "Checked the pump" } }));
  });

  it("CommentThread refuses an empty comment with an inline error", async () => {
    api.mockResolvedValue({ items: [] });
    renderThread("RENTAL");
    await screen.findByText("No comments yet");
    fireEvent.click(screen.getByRole("button", { name: "Post comment" }));
    await screen.findByText("Write something before posting.");
    expect(api).toHaveBeenCalledTimes(1);
  });

  // The other wave 6 mount points are real components now (T14, T15, T16); their owners test the
  // behaviour, and this file checks that each one mounts inside the providers the detail pages give it.
  it("ExternalCostPanel mounts on a completed work order with the work-order messages", () => {
    renderWithIntl(<ExternalCostPanel workOrder={{ id, status: "COMPLETED", syncVersion: "2", externalCostCents: 12_000, externalCostNote: "Lathe work" }} />);
    expect(screen.getByText("Lathe work")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit external cost" })).toBeTruthy();
  });

  it("BillingActions mounts the billing panel on a work order", async () => {
    api.mockResolvedValue({ lines: [], customerId: id, existingId: null });
    renderWithIntl(<BillingActions entityId={id} entityType="WORK_ORDER" />);
    await screen.findByRole("button", { name: "Create billing document" });
  });

  it("BillingActions links a rental to its billing document", async () => {
    api.mockResolvedValue({ lines: [], customerId: id, existingId: id });
    renderWithIntl(<BillingActions entityId={id} entityType="RENTAL" />);
    await screen.findByRole("link", { name: "Open billing document" });
  });

  it("CommandPalette is exported for the admin shell", () => {
    expect(typeof CommandPalette).toBe("function");
  });
});
