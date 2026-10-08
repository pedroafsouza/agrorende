"use client";

import type { CriticalWindow } from "@agrorende/contracts/checklist";
import type { SeasonDTO } from "@agrorende/contracts/dto";
import { AssetCategoryEnum } from "@agrorende/contracts/enums";
import { useQuery } from "@tanstack/react-query";
import { CalendarRange, Lock, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { Card } from "@/components/data/Detail";
import { EmptyState, QueryState } from "@/components/data/States";
import { FormDialog } from "@/components/forms/FormDialog";
import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { PageHeader } from "@/components/shell/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Checkbox, Field, Input } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { nullIfEmpty, useFieldErrors, type ListPage } from "@/lib/forms";
import { useSave } from "@/lib/useSave";

interface SeasonValues {
  name: string;
  crop: string;
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
  criticalWindows: CriticalWindow[];
}

const seasonValues = (s?: SeasonDTO): SeasonValues => ({
  name: s?.name ?? "",
  crop: s?.crop ?? "",
  startsOn: s?.startsOn ?? "",
  endsOn: s?.endsOn ?? "",
  isCurrent: s?.isCurrent ?? false,
  criticalWindows: s?.criticalWindows.map((w) => ({ ...w, assetCategories: [...w.assetCategories] })) ?? [],
});

const seasonBody = (v: SeasonValues) => ({ name: v.name.trim(), crop: nullIfEmpty(v.crop), startsOn: v.startsOn, endsOn: v.endsOn, isCurrent: v.isCurrent, criticalWindows: v.criticalWindows });

type CloseResult = { closed: true; season: SeasonDTO } | { closed: false; warning: "SEASON_OPEN_WORK_WARNING"; openWork: { openWorkOrders: number; activeRentals: number } };

function WindowsEditor({ windows, onChange }: { readonly windows: CriticalWindow[]; readonly onChange: (w: CriticalWindow[]) => void }) {
  const t = useTranslations("settings");
  const common = useTranslations("common");
  const update = (index: number, patch: Partial<CriticalWindow>) => onChange(windows.map((w, i) => (i === index ? { ...w, ...patch } : w)));
  return (
    <fieldset className="flex flex-col gap-3 sm:col-span-2">
      <legend className="mb-2 font-semibold">{t("seasons.windows.title")}</legend>
      <p className="text-sm text-[var(--ar-text-muted)]">{t("seasons.windows.hint")}</p>
      {windows.map((w, index) => (
        <div className="grid gap-3 rounded-cards border border-[var(--ar-border)] p-3 sm:grid-cols-3" key={index}>
          <Field label={t("seasons.windows.name")} required>
            {(p) => <Input {...p} onChange={(e) => update(index, { name: e.target.value })} value={w.name} />}
          </Field>
          <Field label={t("seasons.fields.startsOn")} required>
            {(p) => <Input {...p} onChange={(e) => update(index, { startsOn: e.target.value })} type="date" value={w.startsOn} />}
          </Field>
          <Field label={t("seasons.fields.endsOn")} required>
            {(p) => <Input {...p} onChange={(e) => update(index, { endsOn: e.target.value })} type="date" value={w.endsOn} />}
          </Field>
          <div className="sm:col-span-3">
            <p className="mb-1 text-sm font-semibold">{t("seasons.windows.categories")}</p>
            <div className="flex flex-wrap gap-x-4">
              {AssetCategoryEnum.options.map((c) => (
                <Checkbox
                  checked={w.assetCategories.includes(c)}
                  key={c}
                  label={common(`category.${c}`)}
                  onChange={(e) => update(index, { assetCategories: e.target.checked ? [...w.assetCategories, c] : w.assetCategories.filter((x) => x !== c) })}
                />
              ))}
            </div>
          </div>
          <div className="sm:col-span-3">
            <Button icon={<Trash2 aria-hidden="true" className="size-4" />} onClick={() => onChange(windows.filter((_, i) => i !== index))} variant="ghost">
              {t("seasons.windows.remove")}
            </Button>
          </div>
        </div>
      ))}
      <div>
        <Button icon={<Plus aria-hidden="true" className="size-4" />} onClick={() => onChange([...windows, { name: "", startsOn: "", endsOn: "", assetCategories: [] }])}>
          {t("seasons.windows.add")}
        </Button>
      </div>
    </fieldset>
  );
}

export function SeasonsPage() {
  const t = useTranslations("settings");
  const common = useTranslations("common");
  const locale = useLocale();
  const query = useQuery({ queryKey: ["seasons"], queryFn: () => api<ListPage<SeasonDTO>>("/seasons") });
  const [target, setTarget] = useState<SeasonDTO | "new" | null>(null);
  const [values, setValues] = useState(seasonValues());
  const [closeWarning, setCloseWarning] = useState<{ season: SeasonDTO; openWorkOrders: number; activeRentals: number } | null>(null);
  const [save, state] = useSave(
    "seasons",
    (input: { target: SeasonDTO | "new"; body: Record<string, unknown> }) =>
      input.target === "new" ? api<SeasonDTO>("/seasons", { method: "POST", body: input.body }) : api<SeasonDTO>(`/seasons/${input.target.id}`, { method: "PATCH", body: input.body, version: input.target.syncVersion }),
    () => {
      setTarget(null);
      toast.success(common("toast.saved"));
    },
  );
  const [makeCurrent, currentState] = useSave("seasons", (s: SeasonDTO) => api<SeasonDTO>(`/seasons/${s.id}`, { method: "PATCH", body: { isCurrent: true }, version: s.syncVersion }), () => toast.success(common("toast.saved")));
  const [close, closeState] = useSave(
    "seasons",
    (input: { season: SeasonDTO; confirmOpenWork: boolean }) => api<CloseResult>(`/seasons/${input.season.id}`, { method: "PATCH", body: { close: true, confirmOpenWork: input.confirmOpenWork } }).then((result) => ({ result, season: input.season })),
    ({ result, season }) => {
      if (result.closed) {
        setCloseWarning(null);
        toast.success(t("seasons.closed"));
      } else {
        setCloseWarning({ season, ...result.openWork });
      }
    },
  );
  const fe = useFieldErrors()(state.error);
  const set = <K extends keyof SeasonValues>(key: K, value: SeasonValues[K]) => setValues({ ...values, [key]: value });
  const open = (s: SeasonDTO | "new") => {
    setValues(seasonValues(s === "new" ? undefined : s));
    state.reset();
    setTarget(s);
  };
  const actionError = currentState.error ?? closeState.error;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader actions={<Button icon={<Plus aria-hidden="true" className="size-4" />} onClick={() => open("new")} variant="primary">{t("seasons.actions.new")}</Button>} subtitle={t("seasons.subtitle")} title={t("seasons.title")} />
      {actionError === null ? null : <ErrorAlert error={actionError} onRetry={() => void query.refetch()} />}
      <QueryState
        empty={<EmptyState action={<Button onClick={() => open("new")} variant="primary">{t("seasons.actions.new")}</Button>} body={t("seasons.emptyBody")} icon={<CalendarRange className="size-8" />} title={t("seasons.emptyTitle")} />}
        error={query.error}
        isEmpty={(query.data?.items.length ?? 0) === 0}
        isLoading={query.isLoading}
        onRetry={() => void query.refetch()}
      >
        {(

          <ul className="grid gap-4 md:grid-cols-2">
            {(query.data?.items ?? []).map((s) => (
              <li key={s.id}>
                <Card
                  actions={s.isCurrent ? <Badge tone="success">{t("seasons.current")}</Badge> : null}
                  title={s.name}
                >
                  <p className="text-[var(--ar-text-muted)]">
                    {[s.crop, `${formatDate(s.startsOn, locale)} – ${formatDate(s.endsOn, locale)}`].filter(Boolean).join(" · ")}
                  </p>
                  {s.criticalWindows.length === 0 ? null : (
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {s.criticalWindows.map((w) => (
                        <li key={`${w.name}-${w.startsOn}`}>
                          <Badge tone="warning">{`${w.name} · ${formatDate(w.startsOn, locale)} – ${formatDate(w.endsOn, locale)}`}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button icon={<Pencil aria-hidden="true" className="size-4" />} onClick={() => open(s)}>
                      {common("actions.edit")}
                    </Button>
                    {s.isCurrent ? (
                      <Button busy={closeState.busy} icon={<Lock aria-hidden="true" className="size-4" />} onClick={() => void close({ season: s, confirmOpenWork: false })}>
                        {t("seasons.actions.close")}
                      </Button>
                    ) : (
                      <Button busy={currentState.busy} icon={<Star aria-hidden="true" className="size-4" />} onClick={() => void makeCurrent(s)}>
                        {t("seasons.actions.makeCurrent")}
                      </Button>
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
      <FormDialog
        busy={state.busy}
        dirty
        error={state.error}
        formId="season-form"
        onClose={() => setTarget(null)}
        onSubmit={() => (target === null ? undefined : void save({ target, body: seasonBody(values) }))}
        open={target !== null}
        size="lg"
        title={target === "new" ? t("seasons.actions.new") : t("seasons.edit")}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field error={fe.name} label={t("seasons.fields.name")} required>
            {(p) => <Input {...p} onChange={(e) => set("name", e.target.value)} value={values.name} />}
          </Field>
          <Field error={fe.crop} label={t("seasons.fields.crop")}>
            {(p) => <Input {...p} onChange={(e) => set("crop", e.target.value)} value={values.crop} />}
          </Field>
          <Field error={fe.startsOn} label={t("seasons.fields.startsOn")} required>
            {(p) => <Input {...p} onChange={(e) => set("startsOn", e.target.value)} type="date" value={values.startsOn} />}
          </Field>
          <Field error={fe.endsOn} label={t("seasons.fields.endsOn")} required>
            {(p) => <Input {...p} onChange={(e) => set("endsOn", e.target.value)} type="date" value={values.endsOn} />}
          </Field>
          <div className="sm:col-span-2">
            <Checkbox checked={values.isCurrent} label={t("seasons.fields.isCurrent")} onChange={(e) => set("isCurrent", e.target.checked)} />
          </div>
          <WindowsEditor onChange={(w) => set("criticalWindows", w)} windows={values.criticalWindows} />
        </div>
      </FormDialog>
      <Dialog
        closeLabel={common("actions.close")}
        description={closeWarning === null ? undefined : t("seasons.openWork.body", { workOrders: closeWarning.openWorkOrders, rentals: closeWarning.activeRentals })}
        footer={
          <>
            <Button onClick={() => setCloseWarning(null)}>{common("actions.cancel")}</Button>
            <Button busy={closeState.busy} onClick={() => (closeWarning === null ? undefined : void close({ season: closeWarning.season, confirmOpenWork: true }))} variant="danger">
              {t("seasons.openWork.confirm")}
            </Button>
          </>
        }
        onClose={() => setCloseWarning(null)}
        open={closeWarning !== null}
        title={t("seasons.openWork.title")}
      >
        {closeState.error === null ? null : <ErrorAlert compact error={closeState.error} />}
      </Dialog>
    </div>
  );
}
