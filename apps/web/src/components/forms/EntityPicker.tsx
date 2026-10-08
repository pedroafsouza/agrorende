"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Input, Select } from "@/components/ui/Field";
import { api } from "@/lib/api";

export interface PickerOption {
  readonly id: string;
  readonly label: string;
}

type PickerEntity = "assets" | "sites" | "customers" | "users" | "seasons";

interface ListResponse {
  readonly items: ReadonlyArray<{ id: string; name?: string; code?: string; displayName?: string; email?: string }>;
}

function labelOf(item: ListResponse["items"][number]): string {
  if (item.code !== undefined && item.name !== undefined) return `${item.code} · ${item.name}`;
  return item.name ?? item.displayName ?? item.email ?? item.id;
}

/** Searchable select over a master-data list endpoint; used for asset, site, customer, user and season pickers. */
export function EntityPicker({ entity, value, onChange, id, name, filters, allowEmpty = true, ...aria }: {
  readonly entity: PickerEntity;
  readonly value: string | null;
  readonly onChange: (id: string | null) => void;
  readonly id?: string;
  readonly name?: string;
  readonly filters?: Readonly<Record<string, string>>;
  readonly allowEmpty?: boolean;
  readonly "aria-invalid"?: boolean;
  readonly "aria-describedby"?: string | undefined;
}) {
  const t = useTranslations("common");
  const [q, setQ] = useState("");
  const query = useQuery({
    queryKey: [entity, { picker: true, q, ...filters }],
    queryFn: () => api<ListResponse>(`/${entity}`, { query: { q, limit: 50, ...filters } }),
  });
  const options: PickerOption[] = (query.data?.items ?? []).map((item) => ({ id: item.id, label: labelOf(item) }));
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Input aria-label={t("picker.search")} className="sm:max-w-48" onChange={(e) => setQ(e.target.value)} placeholder={t("picker.search")} type="search" value={q} />
      <Select {...aria} id={id} name={name} onChange={(e) => onChange(e.target.value.length === 0 ? null : e.target.value)} value={value ?? ""}>
        {allowEmpty ? <option value="">{query.isLoading ? t("states.loading") : t("picker.none")}</option> : null}
        {value !== null && !options.some((o) => o.id === value) ? <option value={value}>{value}</option> : null}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
