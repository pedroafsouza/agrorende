"use client";

import { AlarmClock } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/Badge";

/** Overdue is derived (ACTIVE past `plannedEnd` + grace), so it sits next to the status badge. */
export function OverdueBadge() {
  const t = useTranslations("rentals");
  return (
    <Badge icon={<AlarmClock aria-hidden="true" className="size-4" />} tone="danger">
      {t("overdue")}
    </Badge>
  );
}
