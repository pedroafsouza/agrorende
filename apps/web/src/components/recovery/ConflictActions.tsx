"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";

/** Shown inside the CONFLICT alert: keep my edits on top of the latest version, or drop them. */
export function ConflictActions({ onKeepMine, onUseTheirs }: { readonly onKeepMine: () => void; readonly onUseTheirs: () => void }) {
  const t = useTranslations("common");
  return (
    <>
      <Button onClick={onKeepMine} variant="primary">
        {t("conflict.keepMine")}
      </Button>
      <Button onClick={onUseTheirs}>{t("conflict.useTheirs")}</Button>
    </>
  );
}
