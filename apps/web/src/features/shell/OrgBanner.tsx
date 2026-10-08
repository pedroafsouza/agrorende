"use client";

import { useTranslations } from "next-intl";

import { OrgStatusBanner, type OrgStatusBannerTone } from "@/features/tenancy/OrgStatusBanner";

import { useMe } from "./useMe";

const TONE = { TRIAL: "trial", PAST_DUE: "past_due", SUSPENDED: "suspended", CANCELLED: "cancelled" } as const satisfies Record<string, OrgStatusBannerTone>;

/** Mounts the T20 banner above page content when the organisation is not plainly ACTIVE. */
export function OrgBanner() {
  const t = useTranslations("admin");
  const status = useMe().data?.org?.status;
  if (status === undefined || status === "ACTIVE") return null;
  const tone = TONE[status];
  return (
    <div className="px-4 pt-4 lg:px-6">
      <OrgStatusBanner body={t(`orgStatus.${status}.body`)} title={t(`orgStatus.${status}.title`)} tone={tone} />
    </div>
  );
}
