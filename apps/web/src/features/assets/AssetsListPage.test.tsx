// @vitest-environment jsdom
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ApiModule from "@/lib/api";

import { intlErrors, renderWithProviders } from "@/features/ops/testing";

import { AssetsListPage } from "./AssetsListPage";

const router = vi.hoisted(() => ({ push: vi.fn() }));
const toastSuccess = vi.hoisted(() => vi.fn());
/** A tiny URL store, so paging through `useUrlState` re-renders with the new cursor like the real router. */
const nav = vi.hoisted(() => {
  let search = "";
  const listeners = new Set<() => void>();
  return {
    get: () => search,
    set: (next: string) => {
      search = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
});
const apiMock = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: vi.fn() } }));
vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useRouter: () => ({ push: router.push, replace: (url: string) => nav.set(url.split("?")[1] ?? ""), refresh: vi.fn() }),
    usePathname: () => "/assets",
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(nav.subscribe, nav.get)),
  };
});
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof ApiModule>()), api: apiMock }));

function asset(id: string, code: string, name: string) {
  return { id, code, name, category: "TRACTOR", condition: "OPERATIONAL", hourMeter: 1200, isRentable: true };
}

/** Page one has a next page; the cursor `c2` returns page two. */
function pagedAssets(_path: string, init?: { readonly query?: { readonly cursor?: string } }) {
  return Promise.resolve(
    init?.query?.cursor === "c2"
      ? { items: [asset("a3", "PL-03", "Plantadeira 2117")], nextCursor: null }
      : { items: [asset("a1", "TR-01", "Trator 7200"), asset("a2", "CL-02", "Colheitadeira S700")], nextCursor: "c2" },
  );
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation(pagedAssets);
  router.push.mockClear();
  toastSuccess.mockClear();
  intlErrors.length = 0;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  URL.createObjectURL = vi.fn(() => "blob:qr");
  URL.revokeObjectURL = vi.fn();
  HTMLAnchorElement.prototype.click = vi.fn();
  // jsdom has no modal dialogs; model the parts the QR modal relies on.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  act(() => nav.set(""));
});

describe("AssetsListPage QR bulk action", () => {
  it("selects rows without opening them, previews the labels and downloads one PDF", async () => {
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
    const dialog = await screen.findByRole("dialog", { name: "2 QR labels" });
    const preview = within(dialog).getByRole("list", { name: "Label preview" });
    expect(within(preview).getByText("TR-01")).toBeTruthy();
    expect(within(preview).getByText("CL-02")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Download PDF" }));
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
    const dialog = await screen.findByRole("dialog", { name: "Etiqueta QR" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Baixar PDF" }));
    const alert = await within(dialog).findByRole("alert");
    fetchMock.mockResolvedValueOnce(new Response(new Blob(["%PDF"]), { status: 200 }));
    await userEvent.click(within(alert).getByRole("button", { name: /tentar/i }));
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith("Folha de etiquetas QR de 1 ativo baixada"),
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(intlErrors).toEqual([]);
  });

  it("keeps the selection across pages and labels every selected asset in the preview", async () => {
    renderWithProviders(<AssetsListPage />);
    await screen.findByText("Trator 7200");
    await userEvent.click(screen.getByRole("checkbox", { name: "Select all assets on this page" }));
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByText("Plantadeira 2117");
    expect(nav.get()).toContain("cursor=c2");
    await userEvent.click(screen.getByRole("checkbox", { name: "Select PL-03" }));
    const bar = screen.getByRole("region", { name: "Selected assets" });
    expect(within(bar).getByText("3 assets selected")).toBeTruthy();

    await userEvent.click(within(bar).getByRole("button", { name: "Print QR labels" }));
    const dialog = await screen.findByRole("dialog", { name: "3 QR labels" });
    const preview = within(dialog).getByRole("list", { name: "Label preview" });
    for (const code of ["TR-01", "CL-02", "PL-03"]) expect(within(preview).getByText(code)).toBeTruthy();
    expect(within(preview).queryByText("—")).toBeNull();

    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect((screen.getByTestId("qr-modal") as HTMLDialogElement).open).toBe(false));
    expect(within(screen.getByRole("region", { name: "Selected assets" })).getByText("3 assets selected")).toBeTruthy();
    expect(intlErrors).toEqual([]);
  });

  it("disables printing and explains why when more assets are selected than one sheet allows", async () => {
    const many = Array.from({ length: 301 }, (_, i) => asset(`m${i}`, `M-${i}`, `Máquina ${i}`));
    apiMock.mockImplementation(() => Promise.resolve({ items: many, nextCursor: null }));
    renderWithProviders(<AssetsListPage />);
    await screen.findByText("Máquina 0");
    await userEvent.click(screen.getByRole("checkbox", { name: "Select all assets on this page" }));
    const bar = screen.getByRole("region", { name: "Selected assets" });
    expect(within(bar).getByText("301 assets selected")).toBeTruthy();
    expect((within(bar).getByRole("button", { name: "Print QR labels" }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(bar).getByText("Select at most 300 assets per sheet.")).toBeTruthy();
  });
});
