"use client";

import { ImageOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Dialog } from "@/components/ui/Dialog";

export interface GalleryItem {
  readonly id: string;
  readonly kind: "PHOTO" | "VIDEO" | "AUDIO" | "SIGNATURE" | "DOCUMENT";
  readonly status: "PENDING" | "UPLOADED" | "FAILED";
  readonly caption?: string | null;
}

/** Thumbnails served by the media blob route; pending uploads show a waiting tile instead of a broken image (EC-MED-*). */
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
              <button className="block w-full overflow-hidden rounded-controls border border-[var(--ar-border)]" onClick={() => setOpen(item)} type="button">
                <img alt={item.caption ?? t("media.photo")} className="aspect-square w-full object-cover" loading="lazy" src={`/api/v1/media/${item.id}/blob?variant=thumb`} />
              </button>
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
        {open === null ? null : (
          <img alt={open.caption ?? t("media.photo")} className="w-full" src={`/api/v1/media/${open.id}/blob`} />
        )}
      </Dialog>
    </>
  );
}
