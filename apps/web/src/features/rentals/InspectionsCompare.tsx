"use client";

import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { EmptyState, LoadingState } from "@/components/data/States";
import { MediaGallery } from "@/components/media/MediaGallery";
import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { formatDateTime, formatNumber } from "@/lib/format";
import { api } from "@/lib/api";

import { meterDelta, type InspectionCompare, type InspectionWithMedia } from "./types";

/** Check-out next to check-in (RN-07): readings, accessories, signature and photos side by side. */
export function InspectionsCompare({ inspectionId }: { readonly inspectionId: string | null }) {
  const t = useTranslations("rentals");
  const locale = useLocale();
  const query = useQuery({
    queryKey: ["rentals", "inspections", inspectionId, "compare"],
    queryFn: () => api<InspectionCompare>(`/inspections/${inspectionId ?? ""}/compare`),
    enabled: inspectionId !== null,
  });
  if (inspectionId === null) return <EmptyState body={t("inspections.noneBody")} icon={<ClipboardCheck className="size-8" />} title={t("inspections.none")} />;
  if (query.isLoading) return <LoadingState rows={4} />;
  if (query.error !== null || query.data === undefined) return <ErrorAlert error={query.error} onRetry={() => void query.refetch()} />;
  const { checkOut, checkIn } = query.data;
  const delta = meterDelta(checkOut?.hourMeter, checkIn?.hourMeter);
  const statusLabel = (status: string) => t(`signatureStatus.${status}`);
  const yesNo = (value: boolean | undefined) => (value === undefined ? "—" : value ? t("yes") : t("no"));
  const num = (value: number | null | undefined, digits = 0) => (value === null || value === undefined ? "—" : formatNumber(value, locale, digits));
  const rows: { key: string; label: string; out: ReactNode; in: ReactNode }[] = [
    { key: "performedAt", label: t("inspections.performedAt"), out: formatDateTime(checkOut?.performedAt, locale), in: formatDateTime(checkIn?.performedAt, locale) },
    { key: "hourMeter", label: t("inspections.hourMeter"), out: num(checkOut?.hourMeter, 1), in: delta === null ? num(checkIn?.hourMeter, 1) : `${num(checkIn?.hourMeter, 1)} (${t("inspections.delta", { hours: formatNumber(delta, locale, 1) })})` },
    { key: "odometerKm", label: t("inspections.odometerKm"), out: num(checkOut?.odometerKm), in: num(checkIn?.odometerKm) },
    { key: "fuelPercent", label: t("inspections.fuelPercent"), out: num(checkOut?.fuelPercent), in: num(checkIn?.fuelPercent) },
    { key: "safety", label: t("inspections.safetyBriefing"), out: yesNo(checkOut?.safetyBriefingGiven), in: yesNo(checkIn?.safetyBriefingGiven) },
    { key: "operator", label: t("inspections.operator"), out: checkOut?.operatorName ?? "—", in: checkIn?.operatorName ?? "—" },
    { key: "terms", label: t("fields.termsVersion"), out: checkOut?.termsVersion ?? "—", in: checkIn?.termsVersion ?? "—" },
    { key: "signature", label: t("inspections.signature"), out: signature(checkOut, statusLabel), in: signature(checkIn, statusLabel) },
    { key: "notes", label: t("inspections.notes"), out: checkOut?.notes ?? "—", in: checkIn?.notes ?? "—" },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <caption className="sr-only">{t("inspections.title")}</caption>
          <thead>
            <tr className="border-b border-[var(--ar-border)]">
              <th className="p-2" scope="col"><span className="sr-only">{t("inspections.item")}</span></th>
              <th className="p-2" scope="col">{t("inspections.checkOut")}</th>
              <th className="p-2" scope="col">{t("inspections.checkIn")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-b border-[var(--ar-border)]" key={row.key}>
                <th className="p-2 text-sm font-semibold" scope="row">{row.label}</th>
                <td className="p-2">{checkOut === null ? "—" : row.out}</td>
                <td className="p-2">{checkIn === null ? t("inspections.pending") : row.in}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Accessories checkIn={checkIn} checkOut={checkOut} />
      <div className="grid gap-4 md:grid-cols-2">
        <section>
          <h3 className="mb-2 font-semibold">{t("inspections.photosOut")}</h3>
          {checkOut === null ? <p className="text-sm">—</p> : <MediaGallery items={checkOut.media.map((m) => ({ id: m.id, kind: m.kind, status: m.status, caption: m.caption ?? null }))} />}
        </section>
        <section>
          <h3 className="mb-2 font-semibold">{t("inspections.photosIn")}</h3>
          {checkIn === null ? <p className="text-sm">{t("inspections.pending")}</p> : <MediaGallery items={checkIn.media.map((m) => ({ id: m.id, kind: m.kind, status: m.status, caption: m.caption ?? null }))} />}
        </section>
      </div>
    </div>
  );
}

function signature(inspection: InspectionWithMedia | null, statusLabel: (status: string) => string): string {
  if (inspection === null) return "—";
  return [statusLabel(inspection.signatureStatus), inspection.signerName ?? null, inspection.signatureReason ?? null].filter((part): part is string => part !== null && part.length > 0).join(" · ");
}

function Accessories({ checkOut, checkIn }: { readonly checkOut: InspectionWithMedia | null; readonly checkIn: InspectionWithMedia | null }) {
  const t = useTranslations("rentals");
  const keys = [...new Set([...(checkOut?.accessories ?? []), ...(checkIn?.accessories ?? [])].map((a) => a.accessoryKey))];
  if (keys.length === 0) return null;
  return (
    <section>
      <h3 className="mb-2 font-semibold">{t("inspections.accessories")}</h3>
      <ul className="flex flex-col gap-1">
        {keys.map((key) => {
          const out = checkOut?.accessories.find((a) => a.accessoryKey === key);
          const back = checkIn?.accessories.find((a) => a.accessoryKey === key);
          const missing = back !== undefined && back.present < back.expected;
          return (
            <li className={missing ? "font-semibold text-[var(--ar-danger)]" : undefined} key={key}>
              {t("inspections.accessoryLine", { key, out: out?.present ?? 0, back: back?.present ?? 0, expected: out?.expected ?? back?.expected ?? 0 })}
              {missing && back.missingReason !== undefined ? ` · ${back.missingReason}` : ""}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
