"use client";

import { ImageOff, RotateCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/cn";

export interface GalleryItem {
  readonly id: string;
  readonly kind: "PHOTO" | "VIDEO" | "AUDIO" | "SIGNATURE" | "DOCUMENT";
  readonly status: "PENDING" | "UPLOADED" | "FAILED";
  readonly caption?: string | null;
}

export type MediaReadVariant = "thumb" | "original";

/**
 * Same-origin read URL (ARCHITECTURE §7.7 step 9): `GET /media/:id/url` checks the session cookie
 * and redirects to a short-lived signed blob URL. Thumbnails ask for `fallback=original` because
 * web uploads and older app builds never send a thumbnail variant.
 */
export function mediaReadUrl(id: string, variant: MediaReadVariant, attempt = 0): string {
  const query = new URLSearchParams({ variant });
  if (variant !== "original") query.set("fallback", "original");
  if (attempt > 0) query.set("r", String(attempt));
  return `/api/v1/media/${encodeURIComponent(id)}/url?${query.toString()}`;
}

/** Best-effort silent refresh so an expired access cookie does not leave a broken image (A§14.2). */
async function refreshSession(): Promise<void> {
  try {
    await fetch("/api/v1/auth/refresh", { method: "POST", credentials: "same-origin", headers: { accept: "application/json" } });
  } catch {
    // Offline or refused: the retry below fails again and the recovery tile stays.
  }
}

type Phase = "loading" | "loaded" | "failed";

/**
 * An image from the media store that never shows the browser's broken-image icon: the first
 * failure refreshes the session and retries once on its own (AUTO); after that a recovery tile
 * explains that the file is safe and offers Try again (RETRY).
 */
export function MediaImage({ id, variant, alt, className, compact = false, onOpen }: { readonly id: string; readonly variant: MediaReadVariant; readonly alt: string; readonly className?: string; readonly compact?: boolean; readonly onOpen?: () => void }) {
  const t = useTranslations("common");
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<Phase>("loading");
  const [retrying, setRetrying] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  const retry = async () => {
    setRetrying(true);
    await refreshSession();
    setRetrying(false);
    setPhase("loading");
    setAttempt((value) => value + 1);
  };

  const fail = () => {
    if (attempt === 0) void retry();
    else setPhase("failed");
  };

  // An error that fired before hydration never reaches `onError`; catch it from the element state.
  // Only the first mounted element can miss its error event, so this runs once.
  const failRef = useRef(fail);
  failRef.current = fail;
  useEffect(() => {
    const element = ref.current;
    if (element !== null && element.complete && element.naturalWidth === 0 && element.currentSrc !== "") failRef.current();
  }, []);

  if (phase === "failed") {
    return (
      <div className={cn("flex flex-col items-center justify-center gap-2 rounded-controls border border-dashed border-[var(--ar-border-strong)] bg-[var(--ar-surface-muted)] p-3 text-center text-sm text-[var(--ar-text)]", compact ? "aspect-square" : "min-h-64", className)} data-testid="media-image-failed" role="alert">
        <ImageOff aria-hidden="true" className="size-6 text-[var(--ar-text-muted)]" />
        <p className="font-semibold">{t("media.loadFailed.title")}</p>
        {compact ? null : <p>{t("media.loadFailed.body")}</p>}
        <Button icon={<RotateCw aria-hidden="true" className="size-4" />} onClick={() => void retry()} pending={retrying}>
          {t("actions.retry")}
        </Button>
      </div>
    );
  }

  const image = (
    <img
      alt={alt}
      className={cn(className, phase === "loading" ? "bg-[var(--ar-surface-muted)]" : undefined)}
      data-testid="media-image"
      loading="lazy"
      onError={fail}
      onLoad={() => setPhase("loaded")}
      ref={ref}
      src={mediaReadUrl(id, variant, attempt)}
    />
  );
  if (onOpen === undefined) return image;
  return (
    <button aria-label={alt} className="block w-full overflow-hidden rounded-controls border border-[var(--ar-border)]" onClick={onOpen} type="button">
      {image}
    </button>
  );
}

/** Photo and signature tiles open a larger view; pending and failed uploads show a waiting tile instead of a broken image. */
export function MediaGallery({ items }: { readonly items: readonly GalleryItem[] }) {
  const t = useTranslations("common");
  const [open, setOpen] = useState<GalleryItem | null>(null);
  if (items.length === 0) return <p className="text-[var(--ar-text-muted)]">{t("media.empty")}</p>;
  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map((item) => (
          <li key={item.id}>
            {item.status === "UPLOADED" && (item.kind === "PHOTO" || item.kind === "SIGNATURE") ? (
              <MediaImage alt={item.caption ?? t("media.photo")} className="aspect-square w-full object-cover" compact id={item.id} onOpen={() => setOpen(item)} variant="thumb" />
            ) : (
              <div className="flex aspect-square flex-col items-center justify-center gap-2 rounded-controls border border-dashed border-[var(--ar-border-strong)] p-2 text-center text-sm">
                <ImageOff aria-hidden="true" className="size-6" />
                {item.status === "FAILED" ? t("media.failed") : item.status === "PENDING" ? t("media.pending") : t(`media.kind.${item.kind}`)}
              </div>
            )}
          </li>
        ))}
      </ul>
      <Dialog closeLabel={t("actions.close")} onClose={() => setOpen(null)} open={open !== null} size="lg" title={open?.caption ?? t("media.photo")}>
        {open === null ? null : <MediaImage alt={open.caption ?? t("media.photo")} className="w-full" id={open.id} key={open.id} variant="original" />}
      </Dialog>
    </>
  );
}

