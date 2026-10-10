"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Smartphone, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { DataTable } from "@/components/data/DataTable";
import { EmptyState } from "@/components/data/States";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button, buttonVariants } from "@/components/ui/Button";
import { Checkbox, Input, Select } from "@/components/ui/Field";
import { api } from "@/lib/api";
import type { ListPage } from "@/lib/forms";
import { useUrlState } from "@/lib/url-state";

import { InviteDialog } from "./InviteDialog";
import { UserStateChip } from "./UserChips";
import { ROLES, type TeamUser } from "./types";

const KEYS = ["q", "role", "includeInactive", "cursor"] as const;

export function TeamListPage() {
  const t = useTranslations("team");
  const admin = useTranslations("admin");
  const common = useTranslations("common");
  const router = useRouter();
  const [filters, setFilters] = useUrlState(KEYS);
  const [inviting, setInviting] = useState(false);
  const query = useQuery({ queryKey: ["users", filters], queryFn: () => api<ListPage<TeamUser>>("/users", { query: { ...filters, limit: 50 } }) });
  const columns = useMemo<ColumnDef<TeamUser, unknown>[]>(
    () => [
      { header: t("fields.name"), accessorKey: "name", cell: (c) => <span className="font-semibold">{c.row.original.name}</span> },
      { header: t("fields.role"), accessorKey: "role", cell: (c) => admin(`roles.${c.row.original.role}`) },
      { header: t("fields.contact"), id: "contact", cell: (c) => c.row.original.email ?? c.row.original.phone ?? "—" },
      { header: t("fields.skills"), id: "skills", cell: (c) => (c.row.original.skills.length === 0 ? "—" : c.row.original.skills.map((k) => t(`skill.${k}`)).join(", ")) },
      { header: t("fields.state"), id: "state", cell: (c) => <UserStateChip user={c.row.original} /> },
    ],
    [t, admin],
  );
  const filtered = filters.q.length > 0 || filters.role.length > 0;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        actions={
          <>
            <Link className={buttonVariants({ variant: "secondary" })} href="/team/devices">
              <Smartphone aria-hidden="true" className="size-4" />
              {t("devices.title")}
            </Link>
            <Button icon={<UserPlus aria-hidden="true" className="size-4" />} onClick={() => setInviting(true)} variant="primary">
              {t("actions.invite")}
            </Button>
          </>
        }
        subtitle={t("list.subtitle")}
        title={t("list.title")}
      />
      <DataTable
        caption={t("list.title")}
        columns={columns}
        empty={
          <EmptyState
            action={filtered ? undefined : <Button onClick={() => setInviting(true)} variant="primary">{t("actions.invite")}</Button>}
            body={filtered ? common("states.noMatchesBody") : t("list.emptyBody")}
            animation={filtered ? undefined : "invite-team"}
            icon={<Users className="size-8" />}
            title={filtered ? common("states.noMatches") : t("list.emptyTitle")}
          />
        }
        error={query.error}
        hasPrevious={filters.cursor.length > 0}
        isLoading={query.isLoading}
        nextCursor={query.data?.nextCursor ?? null}
        onFirst={() => setFilters({ cursor: null })}
        onNext={(cursor) => setFilters({ cursor })}
        onRetry={() => void query.refetch()}
        onRowClick={(row) => router.push(`/team/${row.id}`)}
        rowKey={(row) => row.id}
        rows={query.data?.items}
        toolbar={
          <>
            <Input aria-label={common("filters.search")} className="max-w-xs" defaultValue={filters.q} onChange={(e) => setFilters({ q: e.target.value })} placeholder={t("list.searchPlaceholder")} type="search" />
            <Select aria-label={t("fields.role")} className="max-w-xs" onChange={(e) => setFilters({ role: e.target.value.length === 0 ? null : e.target.value })} value={filters.role}>
              <option value="">{t("list.allRoles")}</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {admin(`roles.${r}`)}
                </option>
              ))}
            </Select>
            <Checkbox checked={filters.includeInactive === "true"} label={t("list.includeInactive")} onChange={(e) => setFilters({ includeInactive: e.target.checked ? "true" : null })} />
          </>
        }
      />
      <InviteDialog onClose={() => setInviting(false)} open={inviting} />
    </div>
  );
}
