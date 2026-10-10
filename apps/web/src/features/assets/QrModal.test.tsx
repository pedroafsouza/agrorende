// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as QrSheetApi from "./qrSheetApi";

import { ApiError } from "@/lib/api";
import { intlErrors, renderWithProviders } from "@/features/ops/testing";

import { QR_MODAL_EXIT_MS, QrModal, type QrModalAsset } from "./QrModal";

const toastSuccess = vi.hoisted(() => vi.fn());
const sheet = vi.hoisted(() => ({ fetchQrSheet: vi.fn(), fetchQrPng: vi.fn(), saveFile: vi.fn() }));

vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: vi.fn() } }));
vi.mock("@/features/shell/useMe", () => ({
  useMe: () => ({ isLoading: false, error: null, data: { user: { id: "u1", name: "Ana", role: "ADMIN" }, org: { id: "org1", name: "Fazenda Boa Vista" } } }),
}));
vi.mock("./qrSheetApi", async (importOriginal) => ({ ...(await importOriginal<typeof QrSheetApi>()), ...sheet }));

const TRACTOR: QrModalAsset = { id: "a1", code: "TR-01", name: "Trator 7200" };
const HARVESTER: QrModalAsset = { id: "a2", code: "CL-02", name: "Colheitadeira S700" };
const PDF = { blob: new Blob(["%PDF-1.7"], { type: "application/pdf" }), fileName: "agrorende-qr.pdf" };

function Harness({ assets }: { readonly assets: readonly QrModalAsset[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} type="button">
        open qr
      </button>
      <QrModal assets={assets} onClose={() => setOpen(false)} open={open} />
    </>
  );
}

function modal(): HTMLDialogElement {
  return screen.getByTestId("qr-modal") as HTMLDialogElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  intlErrors.length = 0;
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("QrModal", () => {
  it("opens as a labelled modal dialog and previews the label with code, name and organisation", async () => {
    renderWithProviders(<Harness assets={[TRACTOR]} />);
    expect(modal().open).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "open qr" }));
    const dialog = screen.getByRole("dialog", { name: "QR label" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(modal().open).toBe(true);
    const label = within(dialog).getByTestId("qr-label");
    expect(within(label).getByText("TR-01")).toBeTruthy();
    expect(within(label).getByText("Trator 7200")).toBeTruthy();
    expect(within(label).getByText("Fazenda Boa Vista")).toBeTruthy();
    expect(await within(label).findByRole("img", { name: "QR code for TR-01" })).toBeTruthy();
    for (const name of ["Download PDF", "Download PNG", "Print"]) expect(within(dialog).getByRole("button", { name })).toBeTruthy();
    expect(intlErrors).toEqual([]);
  });

  it("downloads the PDF label sheet for the asset and confirms with a toast", async () => {
    sheet.fetchQrSheet.mockResolvedValue(PDF);
    renderWithProviders(<Harness assets={[TRACTOR]} />, { locale: "pt-BR" });
    await userEvent.click(screen.getByRole("button", { name: "open qr" }));
    await userEvent.click(screen.getByRole("button", { name: "Baixar PDF" }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Folha de etiquetas QR de 1 ativo baixada"));
    expect(sheet.fetchQrSheet).toHaveBeenCalledWith(["a1"]);
    expect(sheet.saveFile).toHaveBeenCalledWith(PDF);
    expect(intlErrors).toEqual([]);
  });

  it("downloads the PNG label", async () => {
    const png = { blob: new Blob(["png"], { type: "image/png" }), fileName: "TR-01.png" };
    sheet.fetchQrPng.mockResolvedValue(png);
    renderWithProviders(<Harness assets={[TRACTOR]} />);
    await userEvent.click(screen.getByRole("button", { name: "open qr" }));
    await userEvent.click(screen.getByRole("button", { name: "Download PNG" }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("PNG label for TR-01 downloaded"));
    expect(sheet.fetchQrPng).toHaveBeenCalledWith("a1", "TR-01");
    expect(sheet.saveFile).toHaveBeenCalledWith(png);
  });

  it("previews every selected label and sends all of them in one PDF", async () => {
    sheet.fetchQrSheet.mockResolvedValue(PDF);
    renderWithProviders(<Harness assets={[TRACTOR, HARVESTER]} />);
    await userEvent.click(screen.getByRole("button", { name: "open qr" }));
    const dialog = screen.getByRole("dialog", { name: "2 QR labels" });
    expect(within(dialog).getByText("Prints on 1 A4 sheet, up to 30 labels per sheet.")).toBeTruthy();
    expect(within(dialog).getAllByTestId("qr-label")).toHaveLength(2);
    expect(within(dialog).queryByRole("button", { name: "Download PNG" })).toBeNull();
    await userEvent.click(within(dialog).getByRole("button", { name: "Download PDF" }));
    await waitFor(() => expect(sheet.fetchQrSheet).toHaveBeenCalledWith(["a1", "a2"]));
    expect(toastSuccess).toHaveBeenCalledWith("QR label sheet for 2 assets downloaded");
  });

  it("keeps the PDF disabled as a safety net when the selection is larger than one sheet request allows", async () => {
    const many = Array.from({ length: 301 }, (_, i) => ({ id: `id-${i}`, code: `M-${i}`, name: `Máquina ${i}` }));
    renderWithProviders(<Harness assets={many} />);
    await userEvent.click(screen.getByRole("button", { name: "open qr" }));
    expect((screen.getByRole("button", { name: "Download PDF" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByTestId("qr-label")).toHaveLength(300);
  });

  it("shows a recoverable error and retries the failed download", async () => {
    sheet.fetchQrSheet.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", status: 500, retryable: true })).mockResolvedValueOnce(PDF);
    renderWithProviders(<Harness assets={[TRACTOR]} />);
    await userEvent.click(screen.getByRole("button", { name: "open qr" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Download PDF" }));
    const alert = await within(dialog).findByRole("alert");
    expect(toastSuccess).not.toHaveBeenCalled();
    await userEvent.click(within(alert).getByRole("button", { name: /try/i }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("QR label sheet for 1 asset downloaded"));
    expect(sheet.fetchQrSheet).toHaveBeenCalledTimes(2);
    expect(within(dialog).queryByRole("alert")).toBeNull();
  });

  it("closes on Escape and gives focus back to the button that opened it", async () => {
    renderWithProviders(<Harness assets={[TRACTOR]} />);
    const trigger = screen.getByRole("button", { name: "open qr" });
    await userEvent.click(trigger);
    expect(modal().open).toBe(true);
    screen.getByRole("button", { name: "Download PDF" }).focus();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(modal().open).toBe(false));
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps Tab inside the dialog", async () => {
    renderWithProviders(<Harness assets={[TRACTOR]} />);
    await userEvent.click(screen.getByRole("button", { name: "open qr" }));
    const close = screen.getByRole("button", { name: "Close" });
    const pdf = screen.getByRole("button", { name: "Download PDF" });
    pdf.focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(close);
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(pdf);
  });
});

function deferred<T>(): { readonly promise: Promise<T>; readonly resolve: (value: T) => void; readonly reject: (error: unknown) => void } {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("QrModal lifecycle", () => {
  it("closes from the backdrop and gives focus back to the trigger", async () => {
    renderWithProviders(<Harness assets={[TRACTOR]} />);
    const trigger = screen.getByRole("button", { name: "open qr" });
    await userEvent.click(trigger);
    fireEvent.click(screen.getByTestId("qr-modal-backdrop"));
    await waitFor(() => expect(modal().open).toBe(false));
    expect(document.activeElement).toBe(trigger);
  });

  it("closes from the close button and gives focus back to the trigger", async () => {
    renderWithProviders(<Harness assets={[TRACTOR]} />);
    const trigger = screen.getByRole("button", { name: "open qr" });
    await userEvent.click(trigger);
    await userEvent.click(screen.getByTestId("qr-modal-close"));
    await waitFor(() => expect(modal().open).toBe(false));
    expect(document.activeElement).toBe(trigger);
  });

  it("locks the page scroll while open and restores the previous value on close", async () => {
    const root = document.documentElement;
    root.style.overflow = "scroll";
    renderWithProviders(<Harness assets={[TRACTOR]} />);
    await userEvent.click(screen.getByRole("button", { name: "open qr" }));
    expect(root.style.overflow).toBe("hidden");
    await userEvent.click(screen.getByTestId("qr-modal-close"));
    expect(root.style.overflow).toBe("scroll");
    root.style.overflow = "";
  });

  it("shows the sheet count for 31 assets and disables the PDF for an empty selection", async () => {
    const many = Array.from({ length: 31 }, (_, i) => ({ id: `id-${i}`, code: `M-${i}`, name: `Máquina ${i}` }));
    const { unmount } = renderWithProviders(<Harness assets={many} />);
    await userEvent.click(screen.getByRole("button", { name: "open qr" }));
    expect(screen.getByText("Prints on 2 A4 sheets, up to 30 labels per sheet.")).toBeTruthy();
    unmount();
    renderWithProviders(<Harness assets={[]} />);
    await userEvent.click(screen.getByRole("button", { name: "open qr" }));
    expect((screen.getByRole("button", { name: "Download PDF" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("retries a failed PNG download from the error alert", async () => {
    const png = { blob: new Blob(["png"], { type: "image/png" }), fileName: "TR-01.png" };
    sheet.fetchQrPng.mockRejectedValueOnce(new ApiError({ code: "INTERNAL", status: 500, retryable: true })).mockResolvedValueOnce(png);
    renderWithProviders(<Harness assets={[TRACTOR]} />);
    await userEvent.click(screen.getByRole("button", { name: "open qr" }));
    await userEvent.click(screen.getByRole("button", { name: "Download PNG" }));
    const alert = await screen.findByRole("alert");
    await userEvent.click(within(alert).getByRole("button", { name: /try/i }));
    await waitFor(() => expect(sheet.saveFile).toHaveBeenCalledWith(png));
    expect(sheet.fetchQrPng).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("disables the other actions while the PDF is being generated", async () => {
    const pending = deferred<typeof PDF>();
    sheet.fetchQrSheet.mockReturnValue(pending.promise);
    renderWithProviders(<Harness assets={[TRACTOR]} />);
    await userEvent.click(screen.getByRole("button", { name: "open qr" }));
    await userEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    for (const name of ["Download PNG", "Print", "Download PDF"]) expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Download PDF" }).getAttribute("aria-busy")).toBe("true");
    await act(async () => {
      pending.resolve(PDF);
      await pending.promise;
    });
    for (const name of ["Download PNG", "Print", "Download PDF"]) expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("ignores a download that fails after the modal was closed and reopened", async () => {
    const pending = deferred<typeof PDF>();
    sheet.fetchQrPng.mockReturnValue(pending.promise);
    renderWithProviders(<Harness assets={[TRACTOR]} />);
    await userEvent.click(screen.getByRole("button", { name: "open qr" }));
    await userEvent.click(screen.getByRole("button", { name: "Download PNG" }));
    await userEvent.click(screen.getByTestId("qr-modal-close"));
    await userEvent.click(screen.getByRole("button", { name: "open qr" }));
    expect((screen.getByRole("button", { name: "Download PNG" }) as HTMLButtonElement).disabled).toBe(false);
    await act(async () => {
      pending.reject(new ApiError({ code: "INTERNAL", status: 500, retryable: true }));
      await pending.promise.catch(() => undefined);
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect((screen.getByRole("button", { name: "Download PNG" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("QrModal print", () => {
  const print = vi.fn();

  beforeEach(() => {
    print.mockReset();
    const append = Node.prototype.appendChild;
    vi.spyOn(document.body, "appendChild").mockImplementation(function appendChild<T extends Node>(this: HTMLElement, node: T): T {
      const added = append.call(this, node) as T;
      if (node instanceof HTMLIFrameElement && node.contentWindow !== null) node.contentWindow.print = print;
      return added;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const frame of document.querySelectorAll("[data-testid='qr-print-frame']")) frame.remove();
  });

  it("prints the label from a hidden frame with the name escaped, and removes the frame after printing", async () => {
    renderWithProviders(<Harness assets={[{ id: "a9", code: "TR-09", name: "<b>Trator</b>" }]} />);
    await userEvent.click(screen.getByRole("button", { name: "open qr" }));
    await userEvent.click(screen.getByRole("button", { name: "Print" }));
    await waitFor(() => expect(print).toHaveBeenCalledOnce());
    const frame = document.querySelector<HTMLIFrameElement>("[data-testid='qr-print-frame']");
    const doc = frame?.contentDocument;
    expect(doc?.querySelector(".name")?.textContent).toBe("<b>Trator</b>");
    expect(doc?.querySelector("b")).toBeNull();
    expect(doc?.querySelector(".org")?.textContent).toBe("Fazenda Boa Vista");
    expect(doc?.querySelector("svg")).not.toBeNull();
    frame?.contentWindow?.dispatchEvent(new Event("afterprint"));
    expect(frame?.isConnected).toBe(false);
  });

  it("shows a recoverable error when printing fails", async () => {
    print.mockImplementation(() => {
      throw new Error("blocked");
    });
    renderWithProviders(<Harness assets={[TRACTOR]} />);
    await userEvent.click(screen.getByRole("button", { name: "open qr" }));
    await userEvent.click(screen.getByRole("button", { name: "Print" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(document.querySelector("[data-testid='qr-print-frame']")).toBeNull();
    expect((screen.getByRole("button", { name: "Print" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("QrModal animations", () => {
  class FakeAnimation {
    onfinish: (() => void) | null = null;
    readonly cancel = vi.fn();
    constructor(readonly fill: FillMode | undefined) {}
    finish(): void {
      this.onfinish?.();
    }
  }
  let animations: FakeAnimation[] = [];

  beforeEach(() => {
    animations = [];
    Element.prototype.animate = function animate(_keyframes: Keyframe[] | PropertyIndexedKeyframes | null, options?: number | KeyframeAnimationOptions): Animation {
      const animation = new FakeAnimation(typeof options === "object" ? options.fill : undefined);
      animations.push(animation);
      return animation as unknown as Animation;
    };
  });

  afterEach(() => {
    Reflect.deleteProperty(Element.prototype, "animate");
  });

  function Controlled({ open, onClose = () => undefined }: { readonly open: boolean; readonly onClose?: () => void }) {
    return (
      <>
        <button type="button">trigger</button>
        <QrModal assets={[TRACTOR]} onClose={onClose} open={open} />
      </>
    );
  }

  const exits = () => animations.filter((animation) => animation.fill === "forwards");

  it("cancels the forwards-filled exit animations so a second open is visible", () => {
    const { rerender } = renderWithProviders(<Controlled open={false} />);
    screen.getByRole("button", { name: "trigger" }).focus();
    rerender(<Controlled open />);
    expect(animations).toHaveLength(2);
    rerender(<Controlled open={false} />);
    expect(exits()).toHaveLength(2);
    expect(modal().open).toBe(true);
    act(() => exits()[0]?.finish());
    expect(modal().open).toBe(false);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "trigger" }));
    rerender(<Controlled open />);
    expect(modal().open).toBe(true);
    for (const animation of exits()) expect(animation.cancel).toHaveBeenCalled();
  });

  it("stays open and keeps focus when reopened during the exit animation", () => {
    vi.useFakeTimers();
    const { rerender } = renderWithProviders(<Controlled open={false} />);
    rerender(<Controlled open />);
    const pdf = screen.getByRole("button", { name: "Download PDF" });
    pdf.focus();
    rerender(<Controlled open={false} />);
    const [exit] = exits();
    rerender(<Controlled open />);
    expect(exit?.onfinish).toBeNull();
    expect(exit?.cancel).toHaveBeenCalled();
    act(() => {
      exit?.finish();
      vi.advanceTimersByTime(1_000);
    });
    expect(modal().open).toBe(true);
    expect(document.activeElement).toBe(pdf);
  });

  it("closes through the fallback timer when the exit animation never finishes", () => {
    vi.useFakeTimers();
    const { rerender } = renderWithProviders(<Controlled open={false} />);
    screen.getByRole("button", { name: "trigger" }).focus();
    rerender(<Controlled open />);
    rerender(<Controlled open={false} />);
    expect(modal().open).toBe(true);
    act(() => {
      vi.advanceTimersByTime(QR_MODAL_EXIT_MS + 100);
    });
    expect(modal().open).toBe(false);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "trigger" }));
  });
});
