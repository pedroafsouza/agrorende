"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import type { SubscriptionDTO } from "@agrorende/core/modules/tenancy/dto";

import { useMe } from "@/features/shell/useMe";
import { GettingStartedCard } from "@/features/tenancy/GettingStartedCard";
import { api } from "@/lib/api";

export const GETTING_STARTED_HREF = { assets: "/assets", team: "/team", qr: "/assets", app: "/team" } as const;

/** ADMIN-only getting-started card for `/ops` (TEN-10). Hidden once every step is done. */
export function GettingStartedPanel() {
  const t = useTranslations("tenancy");
  const role = useMe().data?.user.role;
  const query = useQuery({
    queryKey: ["org", "subscription"],
    queryFn: () => api<SubscriptionDTO>("/org/subscription"),
    enabled: role === "ADMIN",
  });
  const state = query.data?.gettingStarted;
  if (role !== "ADMIN" || state === undefined || state.completed) return null;
  const done = state.steps.filter((step) => step.completed).length;
  return (
    <GettingStartedCard
      completedLabel={t("gettingStarted.completed")}
      progressLabel={t("gettingStarted.progress", { done, total: state.steps.length })}
      steps={state.steps.map((step) => ({ id: step.id, completed: step.completed, label: t(`gettingStarted.steps.${step.id}`), href: GETTING_STARTED_HREF[step.id] }))}
      title={t("gettingStarted.title")}
    />
  );
}
