"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, QrCode, Tractor, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

import { ConditionBadge } from "@/components/data/badges";
import { DataTable } from "@/components/data/DataTable";
import { FilterBar, FilterSearch } from "@/components/data/FilterBar";
import { EmptyState } from "@/components/data/States";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button, buttonVariants } from "@/components/ui/Button";
import { Checkbox, Select } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import type { ListPage } from "@/lib/forms";
import { useUrlState } from "@/lib/url-state";

import { isQrSheetTooLarge, QR_SHEET_MAX_ASSETS } from "./qrSheetApi";
import { QrModal, type QrModalAsset } from "./QrModal";
import { CATEGORIES, CONDITIONS, type AssetDTO } from "./types";

const KEYS = ["q", "category", "condition", "includeRetired", "cursor"] as const;

export function AssetsListPage() {
  const t = useTranslations("assets");
  const common = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [filters, setFilters] = useUrlState(KEYS);
  const query = useQuery({
    queryKey: ["assets", filters],
    queryFn: () => api<ListPage<AssetDTO>>("/assets", { query: { ...filters, limit: 50 } }),
    placeholderData: keepPreviousData,
  });
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  // Selection survives paging, so remember every asset row seen to label the QR preview.
  const seen = useRef(new Map<string, QrModalAsset>());
  useEffect(() => {
    for (const asset of query.data?.items ?? []) seen.current.set(asset.id, { id: asset.id, code: asset.code, name: asset.name });
  }, [query.data]);
  const [qrAssets, setQrAssets] = useState<readonly QrModalAsset[]>([]);
  const [qrOpen, setQrOpen] = useState(false);
  const tooMany = isQrSheetTooLarge(selected.size);
  const openQrModal = () => {
    setQrAssets([...selected].map((id) => seen.current.get(id) ?? { id, code: "—", name: "" }));
    setQrOpen(true);
  };
  const columns = useMemo<ColumnDef<AssetDTO, unknown>[]>(
    () => [
      { header: t("fields.code"), accessorKey: "code", cell: (c) => <span className="font-mono font-semibold">{c.row.original.code}</span> },
      { header: t("fields.name"), accessorKey: "name" },
      { header: t("fields.category"), accessorKey: "category", cell: (c) => common(`category.${c.row.original.category}`) },
      { header: t("fields.condition"), accessorKey: "condition", cell: (c) => <ConditionBadge condition={c.row.original.condition} /> },
      { header: t("fields.hourMeter"), accessorKey: "hourMeter", cell: (c) => formatNumber(c.row.original.hourMeter, locale, 1) },
      { header: t("fields.isRentable"), accessorKey: "isRentable", cell: (c) => (c.row.original.isRentable ? common("yes") : common("no")) },
    ],
    [t, common, locale],
  );
  const filtered = filters.q.length > 0 || filters.category.length > 0 || filters.condition.length > 0;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        actions={
          <Link className={buttonVariants({ variant: "primary" })} href="/assets/new">
            <Plus aria-hidden="true" className="size-4" />
            {t("actions.new")}
          </Link>
        }
        title={t("list.title")}
      />
      {selected.size === 0 ? null : (
        <div aria-live="polite" className="flex flex-wrap items-center gap-3 rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface-muted)] p-3" role="region" aria-label={t("qr.bulkRegion")}>
          <p className="font-semibold">{t("qr.selected", { count: selected.size })}</p>
          <Button disabled={tooMany} icon={<QrCode aria-hidden="true" className="size-4" />} onClick={openQrModal} variant="primary">
            {t("qr.print")}
          </Button>
          <Button icon={<X aria-hidden="true" className="size-4" />} onClick={() => setSelected(new Set())} variant="ghost">
            {t("qr.clear")}
          </Button>
          {tooMany ? <p className="text-sm font-semibold text-[var(--ar-danger)]">{t("qr.tooMany", { max: QR_SHEET_MAX_ASSETS })}</p> : null}
        </div>
      )}
      <QrModal assets={qrAssets} onClose={() => setQrOpen(false)} open={qrOpen} />
      <DataTable
        caption={t("list.title")}
        columns={columns}
        empty={
          <EmptyState
            action={
              filtered ? undefined : (
                <Link className={buttonVariants({ variant: "primary" })} href="/assets/new">
                  {t("actions.new")}
                </Link>
              )
            }
            body={filtered ? common("states.noMatchesBody") : t("list.emptyBody")}
            animation={filtered ? undefined : "first-machine"}
            icon={<Tractor className="size-8" />}
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
        onRowClick={(row) => router.push(`/assets/${row.id}`)}
        rowKey={(row) => row.id}
        rows={query.data?.items}
        selection={{ selectedIds: selected, onChange: setSelected, label: (row) => t("qr.select", { code: row.code }), pageLabel: t("qr.selectPage") }}
        isRefreshing={query.isPlaceholderData}
        toolbar={
          <FilterBar
            active={filtered || filters.includeRetired === "true"}
            page={query.data}
            onClear={() => setFilters({ q: null, category: null, condition: null, includeRetired: null })}
            search={<FilterSearch aria-label={common("filters.search")} onSearch={(q) => setFilters({ q })} placeholder={t("list.searchPlaceholder")} value={filters.q} />}
            selects={
              <>
                <Select aria-label={t("fields.category")} onChange={(e) => setFilters({ category: e.target.value })} value={filters.category}>
                  <option value="">{t("list.allCategories")}</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {common(`category.${c}`)}
                    </option>
                  ))}
                </Select>
                <Select aria-label={t("fields.condition")} onChange={(e) => setFilters({ condition: e.target.value })} value={filters.condition}>
                  <option value="">{t("list.allConditions")}</option>
                  {CONDITIONS.map((c) => (
                    <option key={c} value={c}>
                      {common(`condition.${c}`)}
                    </option>
                  ))}
                </Select>
              </>
            }
            toggles={<Checkbox checked={filters.includeRetired === "true"} label={t("list.includeRetired")} onChange={(e) => setFilters({ includeRetired: e.target.checked ? "true" : null })} />}
          />
        }
      />
    </div>
  );
}
