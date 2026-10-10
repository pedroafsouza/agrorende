"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CalendarDays, CalendarX2 } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { Button, buttonVariants } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input } from "@/components/ui/Field";
import { api, isApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

import { extendBody, type RentalDTO } from "./types";

/**
 * Extend the planned end (RN-06). A conflicting booking (ASSET_DOUBLE_BOOKED, EC-RN-32) is
 * shown inline with a link to the calendar; the rental itself is unchanged.
 */
export function ExtendRentalDialog({
  rentalId,
  assetId,
  plannedEnd,
  onClose,
  onDone,
}: {
  readonly rentalId: string;
  readonly assetId: string;
  readonly plannedEnd: string;
  readonly onClose: () => void;
  readonly onDone: () => void;
}) {
  const t = useTranslations("rentals");
  const common = useTranslations("common");
  const locale = useLocale();
  const client = useQueryClient();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const conflict = isApiError(error, "ASSET_DOUBLE_BOOKED");

  const submit = async () => {
    const body = extendBody(value, plannedEnd);
    setInvalid(body === null);
    if (body === null) return;
    setBusy(true);
    setError(null);
    try {
      await api<RentalDTO>(`/rentals/${rentalId}/extend`, { method: "POST", body });
      await client.invalidateQueries({ queryKey: ["rentals"] });
      onDone();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      closeLabel={common("actions.cancel")}
      footer={
        <>
          <Button onClick={onClose}>{common("actions.cancel")}</Button>
          <Button pending={busy} icon={<CalendarDays aria-hidden="true" className="size-4" />} onClick={() => void submit()} variant="primary">
            {t("extend.confirm")}
          </Button>
        </>
      }
      onClose={onClose}
      open
      title={t("extend.title")}
    >
      <div className="flex flex-col gap-4">
        <p>{t("extend.body", { end: formatDateTime(plannedEnd, locale) })}</p>
        {conflict ? (
          <div className="flex flex-col gap-2 rounded-cards border-2 border-[var(--ar-danger)] p-3" role="alert">
            <p className="flex items-center gap-2 font-semibold">
              <CalendarX2 aria-hidden="true" className="size-5" />
              {t("extend.conflictTitle")}
            </p>
            <p>{t("extend.conflictBody")}</p>
            <div>
              <Link className={buttonVariants({ variant: "secondary" })} href={`/rentals?view=calendar&assetId=${assetId}`}>
                <CalendarDays aria-hidden="true" className="size-4" />
                {t("extend.openCalendar")}
              </Link>
            </div>
          </div>
        ) : error === null ? null : (
          <ErrorAlert error={error} />
        )}
        <Field error={invalid ? t("extend.invalid") : undefined} hint={t("new.timeZoneHint")} label={t("extend.newEnd")} required>
          {(p) => (
            <Input
              {...p}
              onChange={(e) => {
                setValue(e.target.value);
                setInvalid(false);
                setError(null);
              }}
              type="datetime-local"
              value={value}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}
