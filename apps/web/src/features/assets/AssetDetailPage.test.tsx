// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ApiModule from "@/lib/api";

import { intlErrors, renderWithProviders } from "@/features/ops/testing";

import { AssetDetailPage } from "./AssetDetailPage";

const apiMock = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/assets/a1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/map/MapView", () => ({ MapView: () => null }));
vi.mock("@/features/shell/useMe", () => ({
  useMe: () => ({ isLoading: false, error: null, data: { user: { id: "u1", name: "Ana", role: "ADMIN" }, org: { id: "org1", name: "Fazenda Boa Vista" } } }),
}));
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof ApiModule>()), api: apiMock }));

const ASSET = {
  id: "a1",
  code: "TR-01",
  name: "Trator 7200",
  category: "TRACTOR",
  condition: "OPERATIONAL",
  ownerType: "ORGANIZATION",
  hourMeter: 1200,
  isRentable: false,
  lastLat: null,
  lastLng: null,
  syncVersion: "v1",
};

beforeEach(() => {
  intlErrors.length = 0;
  apiMock.mockReset();
  apiMock.mockImplementation((path: string) => Promise.resolve(path.endsWith("/history") ? { items: [], nextCursor: null } : ASSET));
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

afterEach(() => {
  cleanup();
});

describe("AssetDetailPage QR action", () => {
  it("opens the QR modal for this asset and returns focus to the button on close", async () => {
    renderWithProviders(<AssetDetailPage id="a1" />);
    const trigger = await screen.findByRole("button", { name: "Generate QR code" });
    await userEvent.click(trigger);

    const dialog = await screen.findByRole("dialog", { name: "QR label" });
    const label = within(dialog).getByTestId("qr-label");
    expect(within(label).getByText("TR-01")).toBeTruthy();
    expect(within(label).getByText("Trator 7200")).toBeTruthy();

    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect((screen.getByTestId("qr-modal") as HTMLDialogElement).open).toBe(false));
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(intlErrors).toEqual([]);
  });
});
