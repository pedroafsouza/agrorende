"use client";

import { useLocale, useTranslations } from "next-intl";

import { useMe } from "@/features/shell/useMe";

import { orgBannerFor } from "./orgBanner";
import { OrgStatusBanner } from "./OrgStatusBanner";

export function formatDay(iso: string, locale: string, timeZone: string | undefined): string {
  if (iso.length === 0) return "";
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", ...(timeZone === undefined ? {} : { timeZone }) }).format(new Date(iso));
}

/**
 * Role-aware organisation banner for every office page (T20.7, EC-OPS-29). The T04 shell mounts it
 * through `features/shell/OrgBanner.tsx`; `supportWhatsApp` comes from `supportWhatsApp()` in `./server`.
 */
export function TenancyOrgBanner({ supportWhatsApp = null, now }: { readonly supportWhatsApp?: string | null; readonly now?: Date }) {
  const t = useTranslations("tenancy");
  const locale = useLocale();
  const me = useMe().data;
  const org = me?.org ?? null;
  const descriptor = orgBannerFor({
    status: org?.status,
    role: me?.user.role,
    trialEndsAt: org?.trialEndsAt ?? null,
    pastDueAt: org?.pastDueAt ?? null,
    purgeAfter: org?.purgeAfter ?? null,
    supportWhatsApp,
    now: now ?? new Date(),
  });
  if (descriptor === null) return null;
  const values = { ...descriptor.values, date: formatDay(String(descriptor.values.date ?? ""), locale, org?.timezone) };
  const action = descriptor.action;
  return (
    <OrgStatusBanner
      body={t(`${descriptor.key}.body`, values)}
      title={t(`${descriptor.key}.title`, values)}
      tone={descriptor.tone}
      {...(action === null ? {} : { actionHref: action.href, actionKind: action.kind, actionLabel: t(`banner.action.${action.kind}`) })}
    />
  );
}
