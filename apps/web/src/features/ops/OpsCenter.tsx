"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PauseCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { ActivityEventDTOSchema } from "@agrorende/contracts/dto";
import { EntityChangedPayloadSchema, OperatorLocationPayloadSchema, OperatorPresencePayloadSchema } from "@agrorende/contracts/realtime";

import { LoadingState } from "@/components/data/States";
import { PageHeader } from "@/components/shell/PageHeader";
import { ErrorAlert } from "@/components/recovery/ErrorAlert";
import { RealtimeStatus } from "@/components/recovery/RealtimeStatus";
import { useMe } from "@/features/shell/useMe";
import { GuideProgressCard } from "@/features/onboarding/GuideProgressCard";
import { formatDateTime } from "@/lib/format";
import { useUrlState } from "@/lib/url-state";

import { ActivityFeed } from "./ActivityFeed";
import { AlertsPanel } from "./AlertsPanel";
import { opsApi } from "./api";
import { ExportsPanel } from "./exports/ExportsPanel";
import { applyKpiFilter, filterAlerts, MAP_LAYERS, satelliteTilesUrl, type BaseMap, type MapLayerKey } from "./filters";
import { KpiStrip } from "./KpiStrip";
import { LayerMenu } from "./LayerMenu";
import { dataBounds, fallbackCenter } from "./mapBounds";
import { OperatorList, OperatorPanel } from "./OperatorPanel";
import { OperatorStore } from "./operatorStore";
import { OpsMap } from "./OpsMap";
import { useOpsRealtime } from "./realtime";
import { isKpiKey, OPS_QUERY_KEYS, type KpiRange, type OpsActivityItemDTO } from "./types";

const subscribeNever = (): (() => void) => () => undefined;

const URL_KEYS = ["kpi", "range", "operator"] as const;
const URL_DEFAULTS = { range: "today" };
const LIVE_ACTIVITY_MAX = 50;
const STALE_CHECK_MS = 30_000;

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
  readonly store?: OperatorStore;
  /** Satellite XYZ template; defaults to `NEXT_PUBLIC_SATELLITE_TILES_URL` and hides the toggle when unset (T16.4). */
  readonly satelliteUrl?: string | null;
}

export function OpsCenter({ store: injected, satelliteUrl = satelliteTilesUrl() }: OpsCenterProps) {
  const t = useTranslations("ops");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [store] = useState(() => injected ?? new OperatorStore());
  const [url, setUrl] = useUrlState(URL_KEYS, URL_DEFAULTS);
  const kpi = isKpiKey(url.kpi) ? url.kpi : null;
  const range: KpiRange = url.range === "7d" || url.range === "30d" ? url.range : "today";
  const selectedId = url.operator === "" ? null : url.operator;
  const [layers, setLayers] = useState<ReadonlySet<MapLayerKey>>(() => new Set(MAP_LAYERS));
  const [showBoundaries, setShowBoundaries] = useState(true);
  const [baseMap, setBaseMap] = useState<BaseMap>("map");
  const [liveActivity, setLiveActivity] = useState<readonly OpsActivityItemDTO[]>([]);
  const me = useMe();

  const live = useQuery({ queryKey: OPS_QUERY_KEYS.live, queryFn: ({ signal }) => opsApi.live(signal) });
  const kpis = useQuery({ queryKey: OPS_QUERY_KEYS.kpis(range), queryFn: ({ signal }) => opsApi.kpis(range, signal), refetchInterval: 60_000 });
  const alerts = useQuery({ queryKey: OPS_QUERY_KEYS.alerts, queryFn: ({ signal }) => opsApi.alerts(signal), refetchInterval: 60_000 });
  const boundaries = useQuery({ queryKey: OPS_QUERY_KEYS.boundaries, queryFn: ({ signal }) => opsApi.boundaries(signal), enabled: showBoundaries, staleTime: 5 * 60_000 });
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

  const realtime = useOpsRealtime({
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

  // The server never has the cached /me answer, so the first client render must match it.
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);
  const role = (hydrated ? me.data?.user.role : undefined) ?? "MANAGER";
  const timezone = me.data?.org?.timezone;
  const fallback = useMemo(() => fallbackCenter(timezone), [timezone]);
  const shownBoundaries = showBoundaries ? (boundaries.data ?? null) : null;
  const fitTo = useMemo(() => dataBounds(view, shownBoundaries), [view, shownBoundaries]);
  const dataReady = live.data !== undefined && !(showBoundaries && boundaries.isLoading) && !me.isLoading;

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
      <GuideProgressCard />
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
      <div className="grid gap-[var(--ar-section-gap)] xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-3">
          <LayerMenu
            baseMap={baseMap}
            layers={layers}
            onToggleBaseMap={() => setBaseMap((b) => (b === "satellite" ? "map" : "satellite"))}
            onToggleBoundaries={() => setShowBoundaries((v) => !v)}
            onToggleLayer={toggleLayer}
            satelliteAvailable={satelliteUrl !== null}
            showBoundaries={showBoundaries}
          />
          {showBoundaries && boundaries.error !== null ? <ErrorAlert compact error={boundaries.error} onRetry={() => void boundaries.refetch()} /> : null}
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
              baseMap={baseMap}
              boundaries={shownBoundaries}
              dataReady={dataReady}
              fallback={fallback}
              fitTo={fitTo}
              satelliteUrl={satelliteUrl}
              visibleLayers={layers}
            />
          </div>
          <dl aria-label={t("legend.label")} className="grid gap-x-6 gap-y-1.5 text-sm text-[var(--ar-text-muted)] sm:grid-cols-2">
            {(["operators", "operatorsStale", "reports", "reportsCritical", "workOrders", "workOrdersRisk", "assets", "rentals"] as const).map((k) => (
              <div className="flex items-center gap-2" key={k}>
                <dt aria-hidden="true" className="w-4 shrink-0 text-center font-bold text-[var(--ar-text)]">
                  {t(`legend.glyph.${k}`)}
                </dt>
                <dd>{t(`legend.items.${k}`)}</dd>
              </div>
            ))}
          </dl>
        </div>
        <aside className="flex min-w-0 flex-col gap-[var(--ar-section-gap)]">
          {selected === undefined ? null : <OperatorPanel marker={selected} onClose={() => setUrl({ operator: null })} />}
          <AlertsPanel alerts={shownAlerts} />
          {alerts.error === null ? null : <ErrorAlert compact error={alerts.error} onRetry={() => void alerts.refetch()} />}
          <OperatorList onDuty={kpis.data?.counts.on_duty} onSelect={(userId) => setUrl({ operator: userId })} operators={view.operators} selected={selectedId} />
          <ActivityFeed live={liveActivity} />
          <ExportsPanel role={role} />
        </aside>
      </div>
    </div>
  );
}
