// @vitest-environment jsdom
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ExportJob, ExportStart } from "@/features/exports/api";

import { intlErrors, renderWithProviders } from "../testing";
import { ExportButton, ExportJobCard } from "./ExportControls";
import { exportEntitiesFor, ExportsPanel } from "./ExportsPanel";
import { parseCsvPreview } from "./csvPreview";

const jobState = vi.hoisted(() => ({ job: undefined as ExportJob | undefined }));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/features/exports/useExportJob", () => ({ useExportJob: () => ({ data: jobState.job }) }));

const BOM = "\uFEFF";

function job(status: ExportJob["status"]): ExportJob {
  return {
    id: "job-1",
    entity: "work-orders",
    status,
    rowCount: status === "READY" ? 60_000 : null,
    errorCode: null,
    createdAt: "2025-03-10T12:00:00.000Z",
    finishedAt: status === "READY" ? "2025-03-10T12:01:00.000Z" : null,
    expiresAt: status === "READY" ? "2025-03-17T12:01:00.000Z" : null,
    downloadUrl: status === "READY" ? "/api/v1/exports/job-1/download" : null,
  };
}

describe("parseCsvPreview", () => {
  it("strips the BOM, splits on ; and keeps sanitised formula cells verbatim", () => {
    const csv = `${BOM}Número;Observação;Valor\r\nOS-0001;"Trocar ""filtro""; urgente";'=SUM(A1)\r\nOS-0002;'+55 11;'-3\nOS-0003;'@cmd;"linha\nquebrada"\n`;
    expect(parseCsvPreview(csv)).toEqual([
      ["Número", "Observação", "Valor"],
      ["OS-0001", 'Trocar "filtro"; urgente', "'=SUM(A1)"],
      ["OS-0002", "'+55 11", "'-3"],
      ["OS-0003", "'@cmd", "linha\nquebrada"],
    ]);
  });

  it("stops after the header plus maxRows rows", () => {
    const csv = ["h", ...Array.from({ length: 50 }, (_, i) => String(i))].join("\n");
    expect(parseCsvPreview(csv, 20)).toHaveLength(21);
  });
});

describe("export controls", () => {
  beforeEach(() => {
    jobState.job = undefined;
    toastMock.success.mockClear();
    intlErrors.length = 0;
  });

  afterEach(() => {
    cleanup();
    expect(intlErrors).toEqual([]);
  });

  it("offers GPS history to ADMIN only", () => {
    expect(exportEntitiesFor("ADMIN")).toContain("location-pings");
    expect(exportEntitiesFor("MANAGER")).not.toContain("location-pings");
    renderWithProviders(<ExportsPanel role="MANAGER" />);
    expect(screen.queryByRole("button", { name: /GPS/u })).toBeNull();
    cleanup();
    renderWithProviders(<ExportsPanel role="ADMIN" />);
    expect(screen.getByRole("button", { name: /GPS/u })).toBeTruthy();
  });

  it("shows a preview of a small export with sanitised cells as text", async () => {
    const start = vi.fn((): Promise<ExportStart> => Promise.resolve({ kind: "file", blob: new Blob([`${BOM}Código;Nota\nA-1;'=HYPERLINK("x")\n`], { type: "text/csv" }), fileName: "assets.csv" }));
    renderWithProviders(<ExportButton entity="assets" start={start} />);
    await userEvent.click(screen.getByRole("button", { name: /Export CSV/u }));
    const table = await screen.findByTestId("csv-preview");
    expect(table.textContent).toContain("Código");
    expect(table.textContent).toContain(`'=HYPERLINK("x")`);
    expect(start).toHaveBeenCalledWith("assets", {}, "en");
  });

  it("walks a background job from queued to ready and notifies once", async () => {
    jobState.job = job("QUEUED");
    const onReady = vi.fn();
    const view = renderWithProviders(<ExportJobCard jobId="job-1" onReady={onReady} />);
    expect(screen.getByText("Waiting")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toMatch(/preparing the file/iu);

    jobState.job = job("RUNNING");
    view.rerender(<ExportJobCard jobId="job-1" onReady={onReady} />);
    jobState.job = job("READY");
    view.rerender(<ExportJobCard jobId="job-1" onReady={onReady} />);
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    view.rerender(<ExportJobCard jobId="job-1" onReady={onReady} />);
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: /Download CSV/u }).getAttribute("href")).toBe("/api/v1/exports/job-1/download");
  });

  it("explains failed and expired jobs", () => {
    jobState.job = job("FAILED");
    const view = renderWithProviders(<ExportJobCard jobId="job-1" />);
    expect(screen.getByText("Failed")).toBeTruthy();
    jobState.job = job("EXPIRED");
    view.rerender(<ExportJobCard jobId="job-1" />);
    expect(screen.getByText("Expired")).toBeTruthy();
  });

  it("turns a 202 into a job card and toasts once when ready", async () => {
    jobState.job = job("READY");
    const start = vi.fn((): Promise<ExportStart> => Promise.resolve({ kind: "job", job: job("QUEUED") }));
    renderWithProviders(<ExportButton entity="work-orders" start={start} />);
    await userEvent.click(screen.getByRole("button", { name: /Export CSV/u }));
    await screen.findByTestId("export-job-job-1");
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledTimes(1));
  });
});
