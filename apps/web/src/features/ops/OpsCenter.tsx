"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers, PauseCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { ActivityEventDTOSchema } from "@agrorende/contracts/dto";
import { EntityChangedPayloadSchema, OperatorLocationPayloadSchema, OperatorPresencePayloadSchema } from "@agrorende/contracts/realtime";

import { LoadingState } from "@/components/data/States";
import { PageHeader } from "@/components/shell/PageHeader";
import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { RealtimeStatus } from "@/components/recovery/RealtimeStatus";
import { useMe } from "@/features/shell/useMe";
import { GettingStartedCard } from "@/features/tenancy/GettingStartedCard";
import { formatDateTime } from "@/lib/format";
import { useUrlState } from "@/lib/url-state";

import { ActivityFeed } from "./ActivityFeed";
import { AlertsPanel } from "./AlertsPanel";
import { opsApi } from "./api";
import { ExportsPanel } from "./exports/ExportsPanel";
import { applyKpiFilter, filterAlerts, MAP_LAYERS, type MapLayerKey } from "./filters";
import { KpiStrip } from "./KpiStrip";
import { OperatorList, OperatorPanel } from "./OperatorPanel";
import { OperatorStore } from "./operatorStore";
import { OpsMap } from "./OpsMap";
import { createOpsSocket, useOpsRealtime, type OpsSocketFactory } from "./realtime";
import { isKpiKey, OPS_QUERY_KEYS, type KpiRange, type OpsActivityItemDTO } from "./types";

const URL_KEYS = ["kpi", "range", "operator"] as const;
const URL_DEFAULTS = { range: "today" };
const LIVE_ACTIVITY_MAX = 50;
const STALE_CHECK_MS = 30_000;

const ONBOARDING_STEPS = ["assets", "team", "qr", "app"] as const;

/** Reads `settings.onboarding` leniently: the shape is written by the T03 tenancy flow. */
export function onboardingOf(settings: Readonly<Record<string, unknown>> | null | undefined): { readonly dismissed: boolean; readonly steps: Readonly<Record<string, boolean>> } {
  const raw = settings?.onboarding;
  if (raw === null || typeof raw !== "object") return { dismissed: false, steps: {} };
  const onboarding = raw as { dismissedAt?: unknown; steps?: unknown };
  const steps = onboarding.steps !== null && typeof onboarding.steps === "object" ? (onboarding.steps as Record<string, unknown>) : {};
  return {
    dismissed: typeof onboarding.dismissedAt === "string" && onboarding.dismissedAt.length > 0,
    steps: Object.fromEntries(ONBOARDING_STEPS.map((k) => [k, steps[k] === true || (typeof steps[k] === "string" && (steps[k] as string).length > 0)])),
  };
}

function toActivityItem(payload: unknown): OpsActivityItemDTO | null {
  const parsed = ActivityEventDTOSchema.safeParse(payload);
  if (!parsed.success) return null;
  const e = parsed.data;
  return {
    id: e.id,
    entityType: e.entityType,
    entityId: e.entityId,
    action: e.action,
    fromStatus: e.fromStatus ?? null,
    toStatus: e.toStatus ?? null,
    actorId: e.actorId ?? null,
    actorName: null,
    occurredAt: e.occurredAt,
    meta: (e.meta ?? {}) as Readonly<Record<string, unknown>>,
  };
}

export interface OpsCenterProps {
  readonly socketFactory?: OpsSocketFactory;
  readonly store?: OperatorStore;
}

export function OpsCenter({ socketFactory = createOpsSocket, store: injected }: OpsCenterProps) {
  const t = useTranslations("ops");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [store] = useState(() => injected ?? new OperatorStore());
  const [url, setUrl] = useUrlState(URL_KEYS, URL_DEFAULTS);
  const kpi = isKpiKey(url.kpi) ? url.kpi : null;
  const range: KpiRange = url.range === "7d" || url.range === "30d" ? url.range : "today";
  const selectedId = url.operator === "" ? null : url.operator;
  const [layers, setLayers] = useState<ReadonlySet<MapLayerKey>>(() => new Set(MAP_LAYERS));
  const [liveActivity, setLiveActivity] = useState<readonly OpsActivityItemDTO[]>([]);
  const me = useMe();

  const live = useQuery({ queryKey: OPS_QUERY_KEYS.live, queryFn: ({ signal }) => opsApi.live(signal) });
  const kpis = useQuery({ queryKey: OPS_QUERY_KEYS.kpis(range), queryFn: ({ signal }) => opsApi.kpis(range, signal), refetchInterval: 60_000 });
  const alerts = useQuery({ queryKey: OPS_QUERY_KEYS.alerts, queryFn: ({ signal }) => opsApi.alerts(signal), refetchInterval: 60_000 });
  const trail = useQuery({ queryKey: OPS_QUERY_KEYS.trail(selectedId ?? ""), queryFn: ({ signal }) => opsApi.trail(selectedId ?? "", signal), enabled: selectedId !== null, retry: false });

  useEffect(() => {
    if (live.data !== undefined) store.load(live.data.operators);
  }, [live.data, store]);

  useEffect(() => {
    const id = setInterval(() => store.refreshStale(), STALE_CHECK_MS);
    return () => clearInterval(id);
  }, [store]);

  const operators = useSyncExternalStore(
    useCallback((cb: () => void) => store.subscribe(cb), [store]),
    () => store.list(),
    () => store.list(),
  );

  const realtime = useOpsRealtime(socketFactory, {
    onLocation: (payload) => {
      const parsed = OperatorLocationPayloadSchema.safeParse(payload);
      if (!parsed.success) return;
      if (store.get(parsed.data.userId) === undefined) void queryClient.invalidateQueries({ queryKey: OPS_QUERY_KEYS.live });
      else store.applyLocation(parsed.data);
    },
    onPresence: (payload) => {
      const parsed = OperatorPresencePayloadSchema.safeParse(payload);
      if (!parsed.success) return;
      if (store.get(parsed.data.userId) === undefined) void queryClient.invalidateQueries({ queryKey: OPS_QUERY_KEYS.live });
      else store.applyPresence(parsed.data);
    },
    onActivity: (payload) => {
      const item = toActivityItem(payload);
      if (item !== null) setLiveActivity((list) => [item, ...list].slice(0, LIVE_ACTIVITY_MAX));
    },
    onEntityChanged: (payload) => {
      if (!EntityChangedPayloadSchema.safeParse(payload).success) return;
      void queryClient.invalidateQueries({ queryKey: OPS_QUERY_KEYS.alerts });
      void queryClient.invalidateQueries({ queryKey: ["ops", "kpis"] });
      void queryClient.invalidateQueries({ queryKey: OPS_QUERY_KEYS.live });
    },
    onReconnect: () => {
      void queryClient.invalidateQueries({ queryKey: ["ops"] });
    },
  });

  const view = useMemo(
    () =>
      applyKpiFilter(
        { operators, reports: live.data?.reports ?? [], workOrders: live.data?.workOrders ?? [], assets: live.data?.assets ?? [], rentals: live.data?.rentals ?? [] },
        kpi,
      ),
    [operators, live.data, kpi],
  );
  const shownAlerts = useMemo(() => filterAlerts(alerts.data?.items ?? [], kpi), [alerts.data, kpi]);
  const selected = selectedId === null ? undefined : operators.find((o) => o.userId === selectedId);
  const noLiveOperators = live.data !== undefined && operators.every((o) => o.stale || o.state === "OFFLINE" || o.dutyStatus !== "ON_DUTY");

  const role = me.data?.user.role ?? "MANAGER";
  const onboarding = onboardingOf(me.data?.settings);
  const showOnboarding = role === "ADMIN" && !onboarding.dismissed && ONBOARDING_STEPS.some((k) => onboarding.steps[k] !== true);

  const toggleLayer = (layer: MapLayerKey) =>
    setLayers((current) => {
      const next = new Set(current);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader actions={<RealtimeStatus state={realtime.state} />} subtitle={t("subtitle")} title={t("title")} />
      {showOnboarding ? <GettingStartedCard steps={ONBOARDING_STEPS.map((id) => ({ id, label: t(`gettingStarted.${id}`), completed: onboarding.steps[id] === true }))} title={t("gettingStarted.title")} /> : null}
      {realtime.paused ? (
        <div className="flex items-start gap-3 rounded-cards border-2 border-[var(--ar-warning)] bg-[var(--ar-warning-bg)] p-4 text-[var(--ar-text)]" data-testid="realtime-paused" role="status">
          <PauseCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">{t("errors.REALTIME_DISCONNECTED.title")}</p>
            <p className="text-sm">{t("errors.REALTIME_DISCONNECTED.body")}</p>
            <p className="text-sm">{realtime.lastUpdateAt === null ? t("realtime.never") : t("realtime.lastUpdate", { at: formatDateTime(realtime.lastUpdateAt.toISOString(), locale) })}</p>
          </div>
        </div>
      ) : null}
      <KpiStrip active={kpi} kpis={kpis.data} onRange={(r) => setUrl({ range: r === "today" ? null : r })} onSelect={(k) => setUrl({ kpi: k })} range={range} />
      {kpis.error === null ? null : <ErrorAlert compact error={kpis.error} onRetry={() => void kpis.refetch()} />}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-3">
          <fieldset className="flex flex-wrap items-center gap-2">
            <legend className="sr-only">{t("layers.label")}</legend>
            <Layers aria-hidden="true" className="size-5 text-[var(--ar-text-muted)]" />
            {MAP_LAYERS.map((layer) => (
              <label className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-controls border border-[var(--ar-border)] bg-[var(--ar-surface)] px-3 text-sm font-medium has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--ar-focus)]" key={layer}>
                <input checked={layers.has(layer)} className="size-5 accent-[var(--ar-primary)]" onChange={() => toggleLayer(layer)} type="checkbox" />
                <span aria-hidden="true">{t(`legend.glyph.${layer}`)}</span>
                {t(`layers.${layer}`)}
              </label>
            ))}
          </fieldset>
          {live.isLoading ? <LoadingState rows={6} /> : null}
          {live.error === null ? null : <ErrorAlert error={live.error} onRetry={() => void live.refetch()} />}
          <div className="h-[60vh] min-h-[420px]">
            <OpsMap
              emptyOperators={noLiveOperators}
              onSelectEntity={(kind, id) => {
                const base = { report: "/reports", workOrder: "/work-orders", asset: "/assets", rental: "/rentals" }[kind];
                window.location.assign(`${base}/${id}`);
              }}
              onSelectOperator={(userId) => setUrl({ operator: userId })}
              store={store}
              trail={selectedId === null ? null : (trail.data?.points ?? null)}
              view={view}
              visibleLayers={layers}
            />
          </div>
          <dl aria-label={t("legend.label")} className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {(["operators", "operatorsStale", "reports", "reportsCritical", "workOrders", "workOrdersRisk", "assets", "rentals"] as const).map((k) => (
              <div className="flex items-center gap-2" key={k}>
                <dt aria-hidden="true" className="font-bold">
                  {t(`legend.glyph.${k}`)}
                </dt>
                <dd>{t(`legend.items.${k}`)}</dd>
              </div>
            ))}
          </dl>
        </div>
        <aside className="flex flex-col gap-5">
          {selected === undefined ? null : <OperatorPanel marker={selected} onClose={() => setUrl({ operator: null })} />}
          <AlertsPanel alerts={shownAlerts} />
          {alerts.error === null ? null : <ErrorAlert compact error={alerts.error} onRetry={() => void alerts.refetch()} />}
          <OperatorList onSelect={(userId) => setUrl({ operator: userId })} operators={view.operators} selected={selectedId} />
          <ActivityFeed live={liveActivity} />
          <ExportsPanel role={role} />
        </aside>
      </div>
    </div>
  );
}
