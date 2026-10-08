"use client";

import { AlertTriangle, Clock, ImageOff, Timer } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/Badge";

import type { SlaState } from "./types";

/** SLA chip (WO-15): icon plus text, never colour alone. */
export function SlaBadge({ sla }: { readonly sla: SlaState }) {
  const t = useTranslations("jobs");
  if (sla === "NONE") return null;
  if (sla === "BREACHED")
    return (
      <Badge icon={<AlertTriangle aria-hidden="true" className="size-4" />} tone="danger">
        {t("sla.BREACHED")}
      </Badge>
    );
  if (sla === "AT_RISK")
    return (
      <Badge icon={<Timer aria-hidden="true" className="size-4" />} tone="warning">
        {t("sla.AT_RISK")}
      </Badge>
    );
  return (
    <Badge icon={<Clock aria-hidden="true" className="size-4" />} tone="neutral">
      {t("sla.OK")}
    </Badge>
  );
}

export function LateEvidenceBadge() {
  const t = useTranslations("jobs");
  return (
    <Badge icon={<ImageOff aria-hidden="true" className="size-4" />} tone="warning">
      {t("flags.lateEvidence")}
    </Badge>
  );
}

