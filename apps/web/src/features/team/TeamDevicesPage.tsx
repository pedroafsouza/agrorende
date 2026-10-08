"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";

import { DataTable } from "@/components/data/DataTable";
import { EmptyState } from "@/components/data/States";
import { PageHeader } from "@/components/shell/PageHeader";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

import { DeviceSync, DeviceWarnings } from "./DeviceHealth";
import type { TeamDevice } from "./types";

export function TeamDevicesPage() {
  const t = useTranslations("team");
  const locale = useLocale();
  const router = useRouter();
  const query = useQuery({ queryKey: ["devices"], queryFn: () => api<{ items: TeamDevice[] }>("/devices") });
  const columns = useMemo<ColumnDef<TeamDevice, unknown>[]>(
    () => [
      { header: t("devices.user"), id: "user", cell: (c) => <span className="font-semibold">{c.row.original.userName ?? "—"}</span> },
      { header: t("devices.device"), id: "device", cell: (c) => [c.row.original.model, t(`devices.platform.${c.row.original.platform}`)].filter(Boolean).join(" · ") },
      { header: t("devices.sync"), id: "sync", cell: (c) => <DeviceSync device={c.row.original} /> },
      { header: t("devices.lastSync"), id: "lastSync", cell: (c) => formatDateTime(c.row.original.lastSyncAt, locale) || "—" },
      { header: t("devices.pending"), id: "pending", cell: (c) => t("devices.pendingValue", { mutations: c.row.original.pendingMutations ?? 0, uploads: c.row.original.pendingUploads ?? 0 }) },
      { header: t("devices.appVersion"), id: "app", cell: (c) => c.row.original.appVersion ?? "—" },
      { header: t("devices.warnings"), id: "warnings", cell: (c) => <DeviceWarnings device={c.row.original} /> },
    ],
    [t, locale],
  );
  return (
    <div className="flex flex-col gap-4">
      <PageHeader back={{ href: "/team", label: t("list.title") }} subtitle={t("devices.subtitle")} title={t("devices.title")} />
      <DataTable
        caption={t("devices.title")}
        columns={columns}
        empty={<EmptyState body={t("devices.emptyBody")} icon={<Smartphone className="size-8" />} title={t("devices.emptyTitle")} />}
        error={query.error}
        isLoading={query.isLoading}
        nextCursor={null}
        onRetry={() => void query.refetch()}
        onRowClick={(row) => router.push(`/team/${row.userId}`)}
        rowKey={(row) => row.id}
        rows={query.data?.items}
      />
    </div>
  );
}
