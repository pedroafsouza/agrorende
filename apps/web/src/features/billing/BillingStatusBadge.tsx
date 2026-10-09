"use client";

import type { BillingStatus } from "@agrorende/contracts/enums";
import { Banknote, Circle, FileCheck2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Badge, type Tone } from "@/components/ui/Badge";

const tone: Record<BillingStatus, [Tone, ReactNode]> = {
  DRAFT: ["neutral", <Circle className="size-4" key="d" />],
  ISSUED: ["info", <FileCheck2 className="size-4" key="i" />],
  PAID: ["success", <Banknote className="size-4" key="p" />],
  CANCELLED: ["neutral", <XCircle className="size-4" key="c" />],
};

/** Billing status with icon and word, never colour alone (A§3.7). */
export function BillingStatusBadge({ status }: { readonly status: BillingStatus }) {
  const t = useTranslations("billing");
  const [badgeTone, glyph] = tone[status];
  return (
    <Badge icon={glyph} tone={badgeTone}>
      {t(`status.${status}`)}
    </Badge>
  );
}
