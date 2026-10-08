"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bug, CheckCircle2, CloudOff, ExternalLink, ImageOff, RotateCw, Smartphone, UserCheck } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState, type ComponentType } from "react";
import { toast } from "sonner";

import type { AttentionItemDTO, AttentionKind, AttentionListDTO, AttentionResolutionDTO } from "@agrorende/core/modules/ops/dto";

import { EmptyState, QueryState } from "@/components/data/States";
import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Field, Textarea } from "@/components/ui/Field";
import { api, isApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

export const ATTENTION_KIND_ORDER: readonly AttentionKind[] = ["REJECTED_MUTATION", "MEDIA_PENDING", "STALE_DEVICE", "DIAGNOSTIC"];
/** Shares the `["attention"]` prefix with the shell badge so both refresh together. */
export const ATTENTION_QUERY_KEY = ["attention", "list"] as const;

const ICONS: Readonly<Record<AttentionKind, ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>>> = {
  REJECTED_MUTATION: CloudOff,
  MEDIA_PENDING: ImageOff,
  STALE_DEVICE: Smartphone,
  DIAGNOSTIC: Bug,
};

const PARENT_ROUTES: Readonly<Record<string, string>> = {
  FIELD_REPORT: "/reports",
  WORK_ORDER: "/work-orders",
  RENTAL: "/rentals",
  ASSET: "/assets",
};

export const attentionApi = {
  list: (signal?: AbortSignal) => api<AttentionListDTO>("/attention", signal === undefined ? {} : { signal }),
  resolve: (kind: AttentionKind, id: string, note: string) => api<AttentionResolutionDTO>(`/attention/${kind}/${encodeURIComponent(id)}/resolve`, { method: "POST", body: { note } }),
};

export interface ColleagueResolution {
  readonly resolverName: string | null;
  readonly resolvedAt: string | null;
  readonly note: string | null;
}

function colleagueOf(error: unknown): ColleagueResolution | null {
  if (!isApiError(error, "ALREADY_RESOLVED")) return null;
  const d = error.details;
  return {
    resolverName: typeof d.resolverName === "string" ? d.resolverName : null,
    resolvedAt: typeof d.resolvedAt === "string" ? d.resolvedAt : null,
    note: typeof d.note === "string" ? d.note : null,
  };
}

function ItemLinks({ item }: { readonly item: AttentionItemDTO }) {
  const t = useTranslations("attention.actions");
  const links: { href: string; label: string }[] = [];
  if (item.deviceId !== null) links.push({ href: `/team/devices?device=${encodeURIComponent(item.deviceId)}`, label: t("device") });
  if (item.kind === "MEDIA_PENDING" && typeof item.params.parentType === "string" && typeof item.params.parentId === "string") {
    const base = PARENT_ROUTES[item.params.parentType];
    if (base !== undefined) links.push({ href: `${base}/${item.params.parentId}`, label: t("openRecord") });
  }
  if (item.userId !== null) links.push({ href: `/team/${item.userId}`, label: t("user") });
  return (
    <>
      {links.map((l) => (
        <Link className="inline-flex min-h-12 items-center gap-1 px-2 text-sm font-semibold text-[var(--ar-link)] underline" href={l.href} key={l.href}>
          <ExternalLink aria-hidden="true" className="size-4" />
          {l.label}
        </Link>
      ))}
    </>
  );
}

export function ColleagueNotice({ item, colleague }: { readonly item: AttentionItemDTO; readonly colleague: ColleagueResolution }) {
  const t = useTranslations("attention");
  const locale = useLocale();
  return (
    <div className="rounded-controls border-2 border-[var(--ar-info)] bg-[var(--ar-info-bg)] p-3 text-[var(--ar-text)]" role="status">
      <p className="flex items-center gap-2 font-semibold">
        <UserCheck aria-hidden="true" className="size-4" />
        {t("alreadyResolved.title")}
      </p>
      <p className="text-sm">{t("alreadyResolved.body")}</p>
      <p className="mt-1 text-sm">{t(`kinds.${item.kind}.item`, { user: item.userName ?? t("unknownUser"), ...stringParams(item.params) })}</p>
      <p className="mt-1 text-sm">
        {t("alreadyResolved.by", { name: colleague.resolverName ?? t("unknownUser"), at: colleague.resolvedAt === null ? "—" : formatDateTime(colleague.resolvedAt, locale) })}
      </p>
      {colleague.note === null ? null : <blockquote className="mt-1 border-l-4 border-[var(--ar-border-strong)] pl-2 text-sm">{colleague.note}</blockquote>}
    </div>
  );
}

export function AttentionRow({ item, onResolved, onColleague }: { readonly item: AttentionItemDTO; readonly onResolved: () => void; readonly onColleague: (item: AttentionItemDTO, colleague: ColleagueResolution) => void }) {
  const t = useTranslations("attention");
  const locale = useLocale();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [missingNote, setMissingNote] = useState(false);
  const Icon = ICONS[item.kind];
  const mutation = useMutation({
    mutationFn: () => attentionApi.resolve(item.kind, item.id, note),
    onSuccess: () => {
      toast.success(t("resolved"));
      onResolved();
    },
    onError: (error) => {
      const other = colleagueOf(error);
      if (other !== null) {
        onColleague(item, other);
        onResolved();
      }
      if (isApiError(error, "GUARD_RESOLUTION_REQUIRED")) setMissingNote(true);
    },
  });

  const submit = () => {
    if (note.trim().length === 0) {
      setMissingNote(true);
      document.getElementById(`${formId}-note`)?.focus();
      return;
    }
    setMissingNote(false);
    mutation.mutate();
  };

  return (
    <li className="rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-4" data-kind={item.kind}>
      <div className="flex flex-wrap items-start gap-3">
        <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{t(`kinds.${item.kind}.item`, { user: item.userName ?? t("unknownUser"), ...stringParams(item.params) })}</p>
          <p className="text-sm text-[var(--ar-text-muted)]">{t(`kinds.${item.kind}.detail`, { at: formatDateTime(item.at, locale), ...stringParams(item.params) })}</p>
          {item.kind === "REJECTED_MUTATION" && typeof item.params.ref === "string" ? <p className="text-xs text-[var(--ar-text-muted)]">{t("ref", { ref: item.params.ref })}</p> : null}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <ItemLinks item={item} />
        {!open ? (
          <Button icon={<CheckCircle2 aria-hidden="true" className="size-4" />} onClick={() => setOpen(true)} variant="secondary">
            {t("actions.resolve")}
          </Button>
        ) : null}
      </div>
      {open ? (
        <form
          aria-label={t("resolveForm.label")}
          className="mt-3 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Field label={t("resolveForm.note")} required {...(missingNote ? { error: t("resolveForm.noteRequired") } : {})}>
            {(props) => <Textarea {...props} id={`${formId}-note`} maxLength={1000} onChange={(e) => setNote(e.target.value)} value={note} />}
          </Field>
          {mutation.error !== null && colleagueOf(mutation.error) === null && !isApiError(mutation.error, "GUARD_RESOLUTION_REQUIRED") ? <ErrorAlert compact error={mutation.error} onRetry={submit} /> : null}
          <div className="flex flex-wrap gap-2">
            <Button busy={mutation.isPending} type="submit">
              {t("resolveForm.submit")}
            </Button>
            <Button onClick={() => setOpen(false)} variant="ghost">
              {t("resolveForm.cancel")}
            </Button>
          </div>
        </form>
      ) : null}
    </li>
  );
}

function stringParams(params: AttentionItemDTO["params"]): Record<string, string | number> {
  return Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v ?? "—"]));
}

export function AttentionPage() {
  const t = useTranslations("attention");
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ATTENTION_QUERY_KEY, queryFn: ({ signal }) => attentionApi.list(signal) });
  const items = query.data?.items ?? [];
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["attention"] });
  const [notices, setNotices] = useState<readonly { readonly item: AttentionItemDTO; readonly colleague: ColleagueResolution }[]>([]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        actions={
          <Button busy={query.isFetching && !query.isLoading} icon={<RotateCw aria-hidden="true" className="size-4" />} onClick={refresh} variant="secondary">
            {t("refresh")}
          </Button>
        }
        subtitle={t("subtitle")}
        title={t("title")}
      />
      {notices.map((n) => (
        <ColleagueNotice colleague={n.colleague} item={n.item} key={`${n.item.kind}:${n.item.id}`} />
      ))}
      <QueryState
        empty={<EmptyState body={t("empty.body")} icon={<CheckCircle2 aria-hidden="true" className="size-6" />} title={t("empty.title")} />}
        error={query.error}
        isEmpty={items.length === 0}
        isLoading={query.isLoading}
        onRetry={() => void query.refetch()}
      >
        {ATTENTION_KIND_ORDER.map((kind) => {
          const group = items.filter((i) => i.kind === kind);
          if (group.length === 0) return null;
          return (
            <section aria-labelledby={`attention-${kind}`} className="flex flex-col gap-2" key={kind}>
              <h2 className="text-lg font-semibold" id={`attention-${kind}`}>
                {t(`kinds.${kind}.title`)} <span className="text-[var(--ar-text-muted)]">({group.length})</span>
              </h2>
              <p className="text-sm text-[var(--ar-text-muted)]">{t(`kinds.${kind}.hint`)}</p>
              <ul className="flex flex-col gap-2">
                {group.map((item) => (
                  <AttentionRow
                    item={item}
                    key={`${item.kind}:${item.id}`}
                    onColleague={(resolvedItem, colleague) => setNotices((list) => [{ item: resolvedItem, colleague }, ...list.filter((n) => n.item.id !== resolvedItem.id)])}
                    onResolved={refresh}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </QueryState>
    </div>
  );
}
