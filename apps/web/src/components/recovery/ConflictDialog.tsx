"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

export interface ConflictField {
  readonly field: string;
  readonly label: string;
  readonly mine: string;
  readonly theirs: string;
}

/** Stale If-Match (EC-OPS-05): keep mine overwrites with the new version, use theirs discards, review shows the diff. */
export function ConflictDialog({ open, fields, onKeepMine, onUseTheirs, onClose }: { readonly open: boolean; readonly fields: readonly ConflictField[]; readonly onKeepMine: () => void; readonly onUseTheirs: () => void; readonly onClose: () => void }) {
  const t = useTranslations("common");
  return (
    <Dialog
      closeLabel={t("actions.close")}
      description={t("conflict.body")}
      footer={
        <>
          <Button onClick={onUseTheirs}>{t("conflict.useTheirs")}</Button>
          <Button onClick={onKeepMine} variant="primary">
            {t("conflict.keepMine")}
          </Button>
        </>
      }
      onClose={onClose}
      open={open}
      size="lg"
      title={t("conflict.title")}
    >
      {fields.length === 0 ? (
        <p>{t("conflict.noDiff")}</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="py-2">{t("conflict.field")}</th>
              <th className="py-2">{t("conflict.mine")}</th>
              <th className="py-2">{t("conflict.theirs")}</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((f) => (
              <tr className="border-t border-[var(--ar-border)]" key={f.field}>
                <td className="py-2 font-semibold">{f.label}</td>
                <td className="py-2">{f.mine}</td>
                <td className="py-2">{f.theirs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Dialog>
  );
}
