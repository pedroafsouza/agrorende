"use client";

import { FileDown, ImageDown, Printer, QrCode, X } from "lucide-react";
import QRCode from "qrcode";
import { useTranslations } from "next-intl";
import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";

import { prefersReducedMotion } from "@/components/feedback/RouteMotion";
import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { Button } from "@/components/ui/Button";
import { QrSvg } from "@/components/ui/QrSvg";
import { useMe } from "@/features/shell/useMe";

import { assetQrPayload, fetchQrPng, fetchQrSheet, isQrSheetTooLarge, QR_LABELS_PER_PAGE, QR_SHEET_MAX_ASSETS, saveFile } from "./qrSheetApi";

export const QR_MODAL_ENTER_MS = 200;
export const QR_MODAL_EXIT_MS = 150;
const SPRING = "cubic-bezier(0.22, 1.2, 0.36, 1)";
const EASE_IN = "cubic-bezier(0.4, 0, 1, 1)";
const SHEET_QUERY = "(max-width: 639.98px)";
const FOCUSABLE = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "audio[controls]",
  "video[controls]",
  "summary",
  "[contenteditable]:not([contenteditable='false'])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");
/** How long a print frame may stay when the browser never fires `afterprint`. */
const PRINT_FRAME_TTL_MS = 60_000;

/** Paper colours of the printed label (`qrSheetDocument` in packages/core): the preview stays white in dark mode. */
const LABEL_INK = "#1F2A1C";
const LABEL_INK_MUTED = "#4A5A44";
const LABEL_CUT = "#C9D3C2";

export interface QrModalAsset {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

type Action = "pdf" | "png" | "print";

function isSheet(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(SHEET_QUERY).matches;
}

function panelKeyframes(reduced: boolean, sheet: boolean): Keyframe[] {
  if (reduced) return [{ opacity: 0 }, { opacity: 1 }];
  if (sheet) return [{ transform: "translateY(100%)" }, { transform: "translateY(0)" }];
  return [
    { opacity: 0, transform: "translateY(8px) scale(0.97)" },
    { opacity: 1, transform: "translateY(0) scale(1)" },
  ];
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/**
 * Prints one label from a hidden frame, so the admin page itself never needs print styles. The frame
 * goes away once the print dialog closes (`afterprint`), or after a fallback delay for browsers that
 * never report it. Failures reject so the modal can offer a retry.
 */
async function printLabel(asset: QrModalAsset, orgName: string | undefined): Promise<void> {
  const svg = await QRCode.toString(assetQrPayload(asset.code), { type: "svg", errorCorrectionLevel: "H", margin: 1, width: 240 });
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("data-testid", "qr-print-frame");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (doc === null || win === null) {
    frame.remove();
    throw new Error("The print frame has no document.");
  }
  let fallback: ReturnType<typeof setTimeout> | undefined;
  const remove = () => {
    if (fallback !== undefined) clearTimeout(fallback);
    frame.remove();
  };
  try {
    doc.open();
    doc.write(
      `<!doctype html><html><head><title>${escapeHtml(asset.code)}</title><style>@page{margin:12mm}body{font-family:Helvetica,Arial,sans-serif;color:${LABEL_INK};display:flex;justify-content:center}.label{border:1px dashed ${LABEL_CUT};padding:16px 20px;text-align:center;width:280px}.org{font-size:12px;color:${LABEL_INK_MUTED};margin:0 0 8px}.code{font-size:22px;font-weight:700;margin:8px 0 2px}.name{font-size:14px;color:${LABEL_INK_MUTED};margin:0}svg{display:block;margin:0 auto}</style></head><body><div class="label">${orgName === undefined ? "" : `<p class="org">${escapeHtml(orgName)}</p>`}${svg}<p class="code">${escapeHtml(asset.code)}</p><p class="name">${escapeHtml(asset.name)}</p></div></body></html>`,
    );
    doc.close();
    win.addEventListener("afterprint", remove, { once: true });
    fallback = setTimeout(remove, PRINT_FRAME_TTL_MS);
    win.focus();
    win.print();
  } catch (error) {
    remove();
    throw error;
  }
}

function LabelCard({ asset, orgName, label }: { readonly asset: QrModalAsset; readonly orgName: string | undefined; readonly label: string }) {
  return (
    <figure className="mx-auto flex w-full max-w-[18rem] flex-col items-center rounded-controls border border-dashed bg-white px-5 pt-4 pb-5 text-center" data-testid="qr-label" style={{ borderColor: LABEL_CUT, color: LABEL_INK }}>
      {orgName === undefined ? null : (
        <p className="mb-2 max-w-full truncate text-xs" style={{ color: LABEL_INK_MUTED }}>
          {orgName}
        </p>
      )}
      <div className="grid size-[13.5rem] place-items-center [&_svg]:size-full">
        <QrSvg label={label} size={216} value={assetQrPayload(asset.code)} />
      </div>
      <figcaption className="mt-2 flex max-w-full flex-col">
        <span className="font-mono text-2xl font-bold tracking-tight">{asset.code}</span>
        <span className="truncate text-sm" style={{ color: LABEL_INK_MUTED }}>
          {asset.name}
        </span>
      </figcaption>
    </figure>
  );
}

function LabelTile({ asset, label }: { readonly asset: QrModalAsset; readonly label: string }) {
  return (
    <li className="flex min-w-0 items-center gap-2 border border-dashed bg-white p-2" data-testid="qr-label" style={{ borderColor: LABEL_CUT, color: LABEL_INK }}>
      <div className="grid size-[4.5rem] shrink-0 place-items-center [&_svg]:size-full">
        <QrSvg label={label} size={72} value={assetQrPayload(asset.code)} />
      </div>
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-mono text-sm font-bold">{asset.code}</span>
        <span className="truncate text-xs" style={{ color: LABEL_INK_MUTED }}>
          {asset.name}
        </span>
      </div>
    </li>
  );
}

/**
 * QR label preview with download actions. One asset: the label at reading size, PDF sheet, PNG and
 * print. Several assets: the labels as they fall on the A4 sheet and one PDF for all of them.
 * Native modal `<dialog>` like the guide: centred card on desktop, bottom sheet on phones, a fade
 * under reduced motion, Escape closes and focus goes back to the button that opened it.
 */
export function QrModal({ open, onClose, assets }: { readonly open: boolean; readonly onClose: () => void; readonly assets: readonly QrModalAsset[] }) {
  const t = useTranslations("assets");
  const common = useTranslations("common");
  const me = useMe();
  const orgName = me.data?.org?.name ?? undefined;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  /** Running enter or exit animations; exit ones fill forwards, so they must be cancelled before the next open. */
  const animations = useRef<Animation[]>([]);
  /** Bumped on every open, so a download that settles after a reopen cannot put its state into the new session. */
  const session = useRef(0);
  const [mounted, setMounted] = useState(false);
  const [running, setRunning] = useState<Action | null>(null);
  const [failed, setFailed] = useState<{ readonly action: Action; readonly error: unknown } | null>(null);
  const titleId = `${useId()}-title`;
  const descriptionId = `${titleId}-description`;

  const single = assets.length === 1 ? assets[0] : undefined;
  const tooMany = isQrSheetTooLarge(assets.length);
  const pages = Math.max(1, Math.ceil(assets.length / QR_LABELS_PER_PAGE));

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return undefined;
    const reduced = prefersReducedMotion();
    const sheet = isSheet();
    const panel = panelRef.current;
    const backdrop = backdropRef.current;
    const animate = typeof panel?.animate === "function";
    const stopAnimations = () => {
      for (const animation of animations.current) {
        animation.onfinish = null;
        animation.cancel();
      }
      animations.current = [];
    };
    if (open) {
      // Reopened during the exit animation: the dialog never closed, so focus and the trigger stay as they are.
      const reopened = dialog.open;
      stopAnimations();
      session.current += 1;
      setMounted(true);
      setRunning(null);
      setFailed(null);
      if (!reopened) {
        const active = document.activeElement;
        triggerRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
        dialog.showModal();
      }
      const root = document.documentElement;
      const overflow = root.style.overflow;
      root.style.overflow = "hidden";
      if (animate && panel !== null && !reopened) {
        animations.current = [
          panel.animate(panelKeyframes(reduced, sheet), { duration: reduced ? QR_MODAL_EXIT_MS : QR_MODAL_ENTER_MS, easing: reduced ? "ease-out" : SPRING }),
          ...(backdrop === null ? [] : [backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: QR_MODAL_ENTER_MS, easing: "ease-out" })]),
        ];
      }
      return () => {
        root.style.overflow = overflow;
      };
    }
    if (!dialog.open) return undefined;
    const finish = () => {
      stopAnimations();
      if (dialog.open) dialog.close();
      setMounted(false);
      const trigger = triggerRef.current;
      if (trigger !== null && trigger.isConnected) trigger.focus();
    };
    if (!animate || panel === null) {
      finish();
      return undefined;
    }
    stopAnimations();
    const exit = panel.animate([...panelKeyframes(reduced, sheet)].reverse(), { duration: QR_MODAL_EXIT_MS, easing: EASE_IN, fill: "forwards" });
    animations.current = [exit, ...(backdrop === null ? [] : [backdrop.animate([{ opacity: 1 }, { opacity: 0 }], { duration: QR_MODAL_EXIT_MS, easing: EASE_IN, fill: "forwards" })])];
    // Animations can be cancelled or never tick (background tab); never leave the dialog stuck open.
    const fallback = setTimeout(finish, QR_MODAL_EXIT_MS + 100);
    exit.onfinish = () => {
      clearTimeout(fallback);
      finish();
    };
    // Reopened or unmounted before the exit ended: drop the pending close and the forwards fill.
    return () => {
      clearTimeout(fallback);
      stopAnimations();
    };
  }, [open]);

  const run = async (action: Action) => {
    const current = session.current;
    setRunning(action);
    setFailed(null);
    try {
      if (action === "pdf") {
        saveFile(await fetchQrSheet(assets.map((asset) => asset.id)));
        toast.success(t("qr.ready", { count: assets.length }));
      } else if (action === "png" && single !== undefined) {
        saveFile(await fetchQrPng(single.id, single.code));
        toast.success(t("qr.pngReady", { code: single.code }));
      } else if (single !== undefined) {
        await printLabel(single, orgName);
      }
    } catch (error) {
      if (current === session.current) setFailed({ action, error });
    } finally {
      if (current === session.current) setRunning(null);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab" || panelRef.current === null) return;
    // Browsers already keep Tab inside a modal dialog; this also wraps it between the first and last control.
    const focusable = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const show = mounted || open;
  return (
    <dialog
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none border-0 bg-transparent p-0 text-[var(--ar-text)] backdrop:bg-transparent open:flex open:items-end open:justify-center sm:open:items-center sm:open:p-6"
      data-testid="qr-modal"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={onKeyDown}
      ref={dialogRef}
    >
      <div aria-hidden="true" className="absolute inset-0 bg-black/45 backdrop-blur-sm" data-testid="qr-modal-backdrop" onClick={onClose} ref={backdropRef} />
      <div
        className={`relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-sheets border border-[var(--ar-border)] bg-[var(--ar-surface)] shadow-2xl sm:max-h-[min(88dvh,48rem)] sm:rounded-sheets ${single === undefined ? "sm:max-w-[44rem]" : "sm:max-w-[28rem]"}`}
        ref={panelRef}
      >
        <div aria-hidden="true" className="flex justify-center pt-2 sm:hidden">
          <span className="h-1.5 w-10 rounded-full bg-[var(--ar-border-strong)]" />
        </div>
        <header className="flex items-center gap-3 border-b border-[var(--ar-border)] py-2 pr-2 pl-4 sm:pl-6">
          <QrCode aria-hidden="true" className="size-5 shrink-0 text-[var(--ar-primary)]" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold" id={titleId}>
              {single === undefined ? t("qr.modal.titleMulti", { count: assets.length }) : t("qr.modal.titleSingle")}
            </h2>
            <p className="text-sm text-[var(--ar-text-muted)]" id={descriptionId}>
              {single === undefined ? t("qr.modal.sheetInfo", { pages, perPage: QR_LABELS_PER_PAGE }) : t("detail.qrBody")}
            </p>
          </div>
          <button aria-label={common("actions.close")} className="flex size-12 shrink-0 items-center justify-center rounded-controls hover:bg-[var(--ar-surface-muted)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--ar-focus)]" data-testid="qr-modal-close" onClick={onClose} type="button">
            <X aria-hidden="true" className="size-5" />
          </button>
        </header>
        {show ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain bg-[var(--ar-surface-muted)] px-4 py-5 sm:px-6">
            {single === undefined ? (
              <ul aria-label={t("qr.modal.previewRegion")} className="grid grid-cols-1 gap-1 min-[420px]:grid-cols-2 sm:grid-cols-3">
                {assets.slice(0, QR_SHEET_MAX_ASSETS).map((asset) => (
                  <LabelTile asset={asset} key={asset.id} label={t("qr.modal.preview", { code: asset.code })} />
                ))}
              </ul>
            ) : (
              <LabelCard asset={single} label={t("qr.modal.preview", { code: single.code })} orgName={orgName} />
            )}
            {failed === null ? null : <ErrorAlert compact error={failed.error} onRetry={() => void run(failed.action)} />}
          </div>
        ) : null}
        <footer className="flex flex-col-reverse gap-2 border-t border-[var(--ar-border)] px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-6">
          {single === undefined ? null : (
            <>
              <Button className="sm:mr-auto" disabled={running !== null} icon={<Printer aria-hidden="true" className="size-4" />} onClick={() => void run("print")} pending={running === "print"} variant="ghost">
                {t("qr.modal.print")}
              </Button>
              <Button disabled={running !== null} icon={<ImageDown aria-hidden="true" className="size-4" />} onClick={() => void run("png")} pending={running === "png"}>
                {t("qr.modal.downloadPng")}
              </Button>
            </>
          )}
          <Button disabled={tooMany || assets.length === 0 || running !== null} icon={<FileDown aria-hidden="true" className="size-4" />} onClick={() => void run("pdf")} pending={running === "pdf"} variant="primary">
            {t("qr.modal.downloadPdf")}
          </Button>
        </footer>
      </div>
    </dialog>
  );
}
