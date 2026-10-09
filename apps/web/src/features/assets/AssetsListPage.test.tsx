// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ApiModule from "@/lib/api";

import { intlErrors, renderWithProviders } from "@/features/ops/testing";

import { AssetsListPage } from "./AssetsListPage";

const router = vi.hoisted(() => ({ push: vi.fn() }));
const toastSuccess = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: router.push, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/assets",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  const asset = (id: string, code: string, name: string) => ({
    id,
    code,
    name,
    category: "TRACTOR",
    condition: "OPERATIONAL",
    hourMeter: 1200,
    isRentable: true,
  });
  return {
    ...actual,
    api: vi.fn(() =>
      Promise.resolve({
        items: [asset("a1", "TR-01", "Trator 7200"), asset("a2", "CL-02", "Colheitadeira S700")],
        nextCursor: null,
      }),
    ),
  };
});

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  router.push.mockClear();
  toastSuccess.mockClear();
  intlErrors.length = 0;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  URL.createObjectURL = vi.fn(() => "blob:qr");
  URL.revokeObjectURL = vi.fn();
  HTMLAnchorElement.prototype.click = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AssetsListPage QR bulk action", () => {
  it("selects rows without opening them and downloads one PDF for the selection", async () => {
    fetchMock.mockResolvedValue(
      new Response(new Blob(["%PDF-1.7"], { type: "application/pdf" }), {
        status: 200,
        headers: { "content-disposition": 'attachment; filename="agrorende-qr.pdf"' },
      }),
    );
    renderWithProviders(<AssetsListPage />);
    await screen.findByText("Trator 7200");
    expect(screen.queryByRole("button", { name: "Print QR labels" })).toBeNull();

    await userEvent.click(screen.getByRole("checkbox", { name: "Select TR-01" }));
    expect(router.push).not.toHaveBeenCalled();
    const bar = screen.getByRole("region", { name: "Selected assets" });
    expect(within(bar).getByText("1 asset selected")).toBeTruthy();

    await userEvent.click(screen.getByRole("checkbox", { name: "Select all assets on this page" }));
    expect(within(bar).getByText("2 assets selected")).toBeTruthy();

    await userEvent.click(within(bar).getByRole("button", { name: "Print QR labels" }));
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith("QR label sheet for 2 assets downloaded"),
    );
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toMatch(/\/api\/v1\/assets\/qr-sheet$/);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ assetIds: ["a1", "a2"] });
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();

    await userEvent.click(within(bar).getByRole("button", { name: "Clear selection" }));
    expect(screen.queryByRole("region", { name: "Selected assets" })).toBeNull();
    expect(intlErrors).toEqual([]);
  });

  it("shows a recoverable error when the sheet cannot be generated", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: "INTERNAL", retryable: true } }), {
        status: 500,
      }),
    );
    renderWithProviders(<AssetsListPage />, { locale: "pt-BR" });
    await screen.findByText("Trator 7200");
    await userEvent.click(screen.getByRole("checkbox", { name: "Selecionar CL-02" }));
    await userEvent.click(screen.getByRole("button", { name: "Imprimir etiquetas QR" }));
    const alert = await screen.findByRole("alert");
    fetchMock.mockResolvedValueOnce(new Response(new Blob(["%PDF"]), { status: 200 }));
    await userEvent.click(within(alert).getByRole("button", { name: /tentar/i }));
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith("Folha de etiquetas QR de 1 ativo baixada"),
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(intlErrors).toEqual([]);
  });
});
