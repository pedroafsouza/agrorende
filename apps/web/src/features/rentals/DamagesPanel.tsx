"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Ban, Check, Gavel, HelpCircle, Wrench } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/data/States";
import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { Badge, type Tone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/format";

import type { DamageDTO } from "./types";

const SEVERITY_TONE: Readonly<Record<DamageDTO["severity"], Tone>> = { MINOR: "info", MODERATE: "warning", SEVERE: "danger" };
const DISPUTE_TONE: Readonly<Record<DamageDTO["disputeStatus"], Tone>> = { NONE: "neutral", DISPUTED: "warning", ACCEPTED: "success", WAIVED: "neutral" };

/** Damages found at check-in (RN-07, EC-RN-07): dispute, accept or waive, and send to the workshop. */
export function DamagesPanel({ damages, editable }: { readonly damages: readonly DamageDTO[]; readonly editable: boolean }) {
  const t = useTranslations("rentals");
  const locale = useLocale();
  const client = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const run = async (key: string, write: () => Promise<unknown>, done: () => void) => {
    setBusy(key);
    setError(null);
    try {
      await write();
      await client.invalidateQueries({ queryKey: ["rentals"] });
      done();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(null);
    }
  };
  const patch = (damage: DamageDTO, body: Record<string, string>) =>
    run(`${damage.id}:${Object.values(body).join()}`, () => api<DamageDTO>(`/damages/${damage.id}`, { method: "PATCH", body, version: String(damage.syncVersion) }), () => toast.success(t("toast.damageUpdated")));

  if (damages.length === 0) return <EmptyState body={t("damages.emptyBody")} title={t("damages.empty")} />;
  return (
    <div className="flex flex-col gap-3">
      {error === null ? null : <ErrorAlert error={error} />}
      <ul className="flex flex-col gap-3">
        {damages.map((damage) => {
          const held = damage.disputeStatus === "DISPUTED" || damage.matchStatus === "UNCLEAR";
          return (
            <li className="flex flex-col gap-2 rounded-cards border border-[var(--ar-border)] p-3" key={damage.id}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{t(`damageZone.${damage.zone}`)}</span>
                <Badge tone={SEVERITY_TONE[damage.severity]}>{t(`damageSeverity.${damage.severity}`)}</Badge>
                <Badge tone={damage.isPreExisting ? "neutral" : "primary"}>{damage.isPreExisting ? t("damages.preExisting") : t(`damageMatch.${damage.matchStatus}`)}</Badge>
                <Badge tone={DISPUTE_TONE[damage.disputeStatus]}>{t(`damageDispute.${damage.disputeStatus}`)}</Badge>
                {held ? <Badge tone="warning">{t("damages.held")}</Badge> : null}
              </div>
              {damage.description === null || damage.description === undefined ? null : <p className="whitespace-pre-wrap">{damage.description}</p>}
              {damage.customerStatement === null || damage.customerStatement === undefined ? null : <p className="text-sm text-[var(--ar-text-muted)]">{t("damages.statement", { statement: damage.customerStatement })}</p>}
              <p className="text-sm">{t("damages.estimate", { amount: damage.estimatedCostCents === null || damage.estimatedCostCents === undefined ? "—" : formatMoney(damage.estimatedCostCents, locale) })}</p>
              {damage.repairedWorkOrderId === null || damage.repairedWorkOrderId === undefined ? null : (
                <Link className="font-semibold text-[var(--ar-link)]" href={`/work-orders/${damage.repairedWorkOrderId}`}>
                  {t("damages.openWorkOrder")}
                </Link>
              )}
              {editable ? (
                <div className="flex flex-wrap gap-2">
                  {damage.matchStatus === "UNCLEAR" ? (
                    <Button busy={busy === `${damage.id}:NEW`} icon={<HelpCircle aria-hidden="true" className="size-4" />} onClick={() => void patch(damage, { matchStatus: "NEW" })}>
                      {t("damages.confirmNew")}
                    </Button>
                  ) : null}
                  {damage.disputeStatus === "DISPUTED" ? null : (
                    <Button busy={busy === `${damage.id}:DISPUTED`} icon={<Gavel aria-hidden="true" className="size-4" />} onClick={() => void patch(damage, { disputeStatus: "DISPUTED" })}>
                      {t("damages.dispute")}
                    </Button>
                  )}
                  {damage.disputeStatus === "ACCEPTED" ? null : (
                    <Button busy={busy === `${damage.id}:ACCEPTED`} icon={<Check aria-hidden="true" className="size-4" />} onClick={() => void patch(damage, { disputeStatus: "ACCEPTED" })}>
                      {t("damages.accept")}
                    </Button>
                  )}
                  {damage.disputeStatus === "WAIVED" ? null : (
                    <Button busy={busy === `${damage.id}:WAIVED`} icon={<Ban aria-hidden="true" className="size-4" />} onClick={() => void patch(damage, { disputeStatus: "WAIVED" })}>
                      {t("damages.waive")}
                    </Button>
                  )}
                  <Button
                    busy={busy === `${damage.id}:wo`}
                    icon={<Wrench aria-hidden="true" className="size-4" />}
                    onClick={() =>
                      void run(`${damage.id}:wo`, async () => {
                        const wo = await api<{ id: string; number: string }>(`/damages/${damage.id}/create-work-order`, { method: "POST", body: {} });
                        toast.success(t("toast.workOrderCreated", { number: wo.number }));
                      }, () => undefined)
                    }
                    variant="primary"
                  >
                    {t("damages.createWorkOrder")}
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
