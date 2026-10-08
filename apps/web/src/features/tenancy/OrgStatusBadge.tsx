"use client";

import type { OrgStatus } from "@agrorende/contracts/enums";
import { AlertTriangle, CircleCheck, Clock, Lock, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Badge, type Tone } from "@/components/ui/Badge";

const STYLE = {
  TRIAL: { tone: "info", icon: <Clock className="size-4" /> },
  ACTIVE: { tone: "success", icon: <CircleCheck className="size-4" /> },
  PAST_DUE: { tone: "warning", icon: <AlertTriangle className="size-4" /> },
  SUSPENDED: { tone: "danger", icon: <Lock className="size-4" /> },
  CANCELLED: { tone: "neutral", icon: <XCircle className="size-4" /> },
} as const satisfies Record<OrgStatus, { tone: Tone; icon: ReactNode }>;

/** Organisation status as icon plus word (A§3.7); labels live in the `tenancy` namespace. */
export function OrgStatusBadge({ status }: { readonly status: OrgStatus }) {
  const t = useTranslations("tenancy");
  const style = STYLE[status];
  return (
    <Badge icon={style.icon} tone={style.tone}>
      {t(`status.${status}`)}
    </Badge>
  );
}
