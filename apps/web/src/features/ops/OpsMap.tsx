"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { MapPinOff, RotateCw, UserX } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import Map, { Layer, NavigationControl, Source, type MapLayerMouseEvent, type MapRef } from "react-map-gl/maplibre";

import { campoClaroPalette } from "@agrorende/design-tokens";

import { Button } from "@/components/ui/Button";

import type { MapLayerKey, OpsView } from "./filters";
import { trailSegments } from "./filters";
import { startFrameLoop, type OperatorStore, type PointCollection } from "./operatorStore";
import type { TrailPointDTO } from "./types";

const LIGHT_STYLE = process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/liberty";

export const OPERATOR_SOURCE = "ops-operators";

const COLORS = {
  primary: campoClaroPalette["mata-700"],
  danger: campoClaroPalette.danger.light,
  warning: campoClaroPalette.warning.fill,
  info: campoClaroPalette.info.light,
  neutral: campoClaroPalette.neutral,
  muted: campoClaroPalette["graphite-500"],
  white: "#FFFFFF",
} as const;

/** Operator ring colour follows `OperatorState`; the legend and side list repeat it in words. */
const STATE_RING = ["match", ["get", "state"], "WORKING", COLORS.primary, "EN_ROUTE", COLORS.info, "ON_SITE", COLORS.info, "ON_HOLD", COLORS.warning, "IDLE", COLORS.neutral, COLORS.muted] as unknown as string;

type ShapeKind = "square" | "diamond" | "triangle";
const SHAPE_SIZE = 22;

/** Rasterises a white-bordered shape so WO squares, asset diamonds and rental triangles need no sprite. */
function shapeImage(shape: ShapeKind, hex: string): { width: number; height: number; data: Uint8Array } {
  const size = SHAPE_SIZE;
  const data = new Uint8Array(size * size * 4);
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  const c = (size - 1) / 2;
  const inside = (x: number, y: number, inset: number): boolean => {
    if (shape === "square") return x >= 2 + inset && x <= size - 3 - inset && y >= 2 + inset && y <= size - 3 - inset;
    if (shape === "diamond") return Math.abs(x - c) + Math.abs(y - c) <= c - inset;
    const top = 2 + inset * 1.6;
    const bottom = size - 2 - inset;
    if (y < top || y > bottom) return false;
    const half = ((y - top) / (bottom - top)) * (c - inset);
    return Math.abs(x - c) <= half;
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      if (inside(x, y, 2)) {
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      } else if (inside(x, y, 0)) {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
        data[i + 3] = 255;
      }
    }
  }
  return { width: size, height: size, data };
}

const SHAPE_IMAGES: readonly (readonly [string, ShapeKind, string])[] = [
  ["wo-ok", "square", COLORS.info],
  ["wo-risk", "square", COLORS.warning],
  ["wo-breached", "square", COLORS.danger],
  ["asset", "diamond", COLORS.neutral],
  ["asset-rented", "diamond", COLORS.info],
  ["rental", "triangle", COLORS.primary],
  ["rental-overdue", "triangle", COLORS.danger],
];

type SourceData = Extract<ComponentProps<typeof Source>, { type: "geojson" }>["data"];
/** Our GeoJSON builders return readonly arrays; MapLibre's typings want mutable ones. */
const asData = (data: unknown): SourceData => data as SourceData;

function collection(features: PointCollection["features"]): PointCollection {
  return { type: "FeatureCollection", features };
}

function point(id: string, lng: number, lat: number, properties: Record<string, string | number | boolean | null>) {
  return { type: "Feature" as const, id, geometry: { type: "Point" as const, coordinates: [lng, lat] as const }, properties: { id, ...properties } };
}

export interface OpsMapProps {
  readonly store: OperatorStore;
  readonly view: OpsView;
  readonly visibleLayers: ReadonlySet<MapLayerKey>;
  readonly trail: readonly TrailPointDTO[] | null;
  readonly onSelectOperator: (userId: string) => void;
  readonly onSelectEntity: (kind: "report" | "workOrder" | "asset" | "rental", id: string) => void;
  readonly emptyOperators: boolean;
}

/**
 * Ops Center live map. Operators sit in one unclustered GeoJSON source fed by the frame loop;
 * reports, WOs and assets are clustered sources (A§14.3). Tile or style failures show the
 * EC-OPS-18 banner and keep the lists usable.
 */
export function OpsMap({ store, view, visibleLayers, trail, onSelectOperator, onSelectEntity, emptyOperators }: OpsMapProps) {
  const t = useTranslations("ops");
  const ref = useRef<MapRef>(null);
  const [mapKey, setMapKey] = useState(0);
  const [failed, setFailed] = useState(false);
  const [initialOperators] = useState(() => store.takeFrame());
  const latest = useRef<PointCollection>(initialOperators);

  useEffect(
    () =>
      startFrameLoop(store, (frame) => {
        latest.current = frame;
        const source = ref.current?.getSource(OPERATOR_SOURCE) as { setData?: (data: unknown) => void } | undefined;
        source?.setData?.(frame);
      }),
    [store, mapKey],
  );

  const operatorFilter = useMemo(() => ["in", ["get", "userId"], ["literal", view.operators.map((o) => o.userId)]] as unknown as boolean, [view.operators]);

  const reports = useMemo(
    () => collection(view.reports.map((r) => point(r.id, r.lng, r.lat, { kind: "report", critical: r.critical, label: r.number ?? r.title }))),
    [view.reports],
  );
  const workOrders = useMemo(
    () => collection(view.workOrders.map((w) => point(w.id, w.lng, w.lat, { kind: "workOrder", icon: w.sla === "BREACHED" ? "wo-breached" : w.sla === "AT_RISK" ? "wo-risk" : "wo-ok", label: w.number }))),
    [view.workOrders],
  );
  const assets = useMemo(
    () => collection(view.assets.map((a) => point(a.id, a.lng, a.lat, { kind: "asset", icon: a.rentedOut ? "asset-rented" : "asset", label: a.code }))),
    [view.assets],
  );
  const rentals = useMemo(
    () =>
      collection(
        view.rentals.flatMap((r) => (r.lat === null || r.lng === null ? [] : [point(r.id, r.lng, r.lat, { kind: "rental", icon: r.overdue ? "rental-overdue" : "rental", label: r.number })])),
      ),
    [view.rentals],
  );
  const trailData = useMemo(
    () => ({ type: "Feature" as const, properties: {}, geometry: { type: "MultiLineString" as const, coordinates: trailSegments(trail ?? []) } }),
    [trail],
  );

  const visibility = (layer: MapLayerKey) => (visibleLayers.has(layer) ? "visible" : "none");

  const onLoad = () => {
    const map = ref.current?.getMap();
    if (map === undefined) return;
    for (const [name, shape, color] of SHAPE_IMAGES) {
      if (!map.hasImage(name)) map.addImage(name, shapeImage(shape, color));
    }
    const source = ref.current?.getSource(OPERATOR_SOURCE) as { setData?: (data: unknown) => void } | undefined;
    source?.setData?.(latest.current);
  };

  const onClick = (event: MapLayerMouseEvent) => {
    const feature = event.features?.[0];
    const props = (feature?.properties ?? {}) as Record<string, unknown>;
    if (typeof props.userId === "string") return onSelectOperator(props.userId);
    if (typeof props.id === "string" && typeof props.kind === "string" && props.cluster !== true) {
      onSelectEntity(props.kind as "report" | "workOrder" | "asset" | "rental", props.id);
    }
  };

  return (
    <div aria-label={t("map.label")} className="relative h-full min-h-[420px] overflow-hidden rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface-muted)]" role="region">
      {failed ? null : (
        <Map
          initialViewState={{ longitude: -51.9, latitude: -14.2, zoom: 3.5 }}
          interactiveLayerIds={["ops-operators-dot", "ops-reports-point", "ops-wos-point", "ops-assets-point", "ops-rentals-point"]}
          key={mapKey}
          mapStyle={LIGHT_STYLE}
          onClick={onClick}
          onError={() => setFailed(true)}
          onLoad={onLoad}
          ref={ref}
        >
          <NavigationControl position="top-right" />
          <Source cluster clusterMaxZoom={14} clusterRadius={44} data={asData(reports)} id="ops-reports" type="geojson">
            <Layer filter={["has", "point_count"]} id="ops-reports-cluster" layout={{ visibility: visibility("reports") }} paint={{ "circle-color": COLORS.warning, "circle-radius": 18, "circle-stroke-color": COLORS.white, "circle-stroke-width": 2 }} type="circle" />
            <Layer filter={["has", "point_count"]} id="ops-reports-count" layout={{ visibility: visibility("reports"), "text-field": ["get", "point_count_abbreviated"], "text-size": 13, "text-font": ["Noto Sans Bold"] }} type="symbol" />
            <Layer
              filter={["!", ["has", "point_count"]]}
              id="ops-reports-point"
              layout={{ visibility: visibility("reports") }}
              paint={{ "circle-color": ["case", ["get", "critical"], COLORS.danger, COLORS.warning] as unknown as string, "circle-radius": 9, "circle-stroke-color": COLORS.white, "circle-stroke-width": 2 }}
              type="circle"
            />
          </Source>
          <Source cluster clusterMaxZoom={14} clusterRadius={44} data={asData(workOrders)} id="ops-wos" type="geojson">
            <Layer filter={["has", "point_count"]} id="ops-wos-cluster" layout={{ visibility: visibility("workOrders") }} paint={{ "circle-color": COLORS.info, "circle-radius": 18, "circle-stroke-color": COLORS.white, "circle-stroke-width": 2 }} type="circle" />
            <Layer filter={["has", "point_count"]} id="ops-wos-count" layout={{ visibility: visibility("workOrders"), "text-field": ["get", "point_count_abbreviated"], "text-size": 13, "text-font": ["Noto Sans Bold"] }} paint={{ "text-color": COLORS.white }} type="symbol" />
            <Layer filter={["!", ["has", "point_count"]]} id="ops-wos-point" layout={{ visibility: visibility("workOrders"), "icon-image": ["get", "icon"] as unknown as string, "icon-allow-overlap": true }} type="symbol" />
          </Source>
          <Source cluster clusterMaxZoom={14} clusterRadius={44} data={asData(assets)} id="ops-assets" type="geojson">
            <Layer filter={["has", "point_count"]} id="ops-assets-cluster" layout={{ visibility: visibility("assets") }} paint={{ "circle-color": COLORS.neutral, "circle-radius": 18, "circle-stroke-color": COLORS.white, "circle-stroke-width": 2 }} type="circle" />
            <Layer filter={["has", "point_count"]} id="ops-assets-count" layout={{ visibility: visibility("assets"), "text-field": ["get", "point_count_abbreviated"], "text-size": 13, "text-font": ["Noto Sans Bold"] }} paint={{ "text-color": COLORS.white }} type="symbol" />
            <Layer filter={["!", ["has", "point_count"]]} id="ops-assets-point" layout={{ visibility: visibility("assets"), "icon-image": ["get", "icon"] as unknown as string, "icon-allow-overlap": true }} type="symbol" />
          </Source>
          <Source data={asData(rentals)} id="ops-rentals" type="geojson">
            <Layer id="ops-rentals-point" layout={{ visibility: visibility("rentals"), "icon-image": ["get", "icon"] as unknown as string, "icon-allow-overlap": true }} type="symbol" />
          </Source>
          <Source data={asData(trailData)} id="ops-trail" type="geojson">
            <Layer id="ops-trail-line" paint={{ "line-color": COLORS.primary, "line-width": 4, "line-opacity": 0.8 }} type="line" />
          </Source>
          <Source data={asData(initialOperators)} id={OPERATOR_SOURCE} type="geojson">
            <Layer
              filter={operatorFilter}
              id="ops-operators-dot"
              layout={{ visibility: visibility("operators") }}
              paint={{
                "circle-color": ["case", ["get", "stale"], COLORS.muted, COLORS.white] as unknown as string,
                "circle-radius": 14,
                "circle-stroke-color": STATE_RING,
                "circle-stroke-width": 4,
                "circle-opacity": ["case", ["get", "stale"], 0.6, 1] as unknown as number,
              }}
              type="circle"
            />
            <Layer
              filter={operatorFilter}
              id="ops-operators-label"
              layout={{ visibility: visibility("operators"), "text-field": ["get", "initials"] as unknown as string, "text-size": 11, "text-font": ["Noto Sans Bold"], "text-allow-overlap": true }}
              paint={{ "text-color": campoClaroPalette["graphite-950"] }}
              type="symbol"
            />
          </Source>
        </Map>
      )}
      {failed ? (
        <div className="absolute inset-0 flex items-center justify-center p-6" data-testid="map-error">
          <div className="max-w-md rounded-cards border-2 border-[var(--ar-warning)] bg-[var(--ar-surface)] p-5" role="alert">
            <p className="flex items-center gap-2 font-semibold">
              <MapPinOff aria-hidden="true" className="size-5 shrink-0" />
              {t("errors.MAP_TILES_UNAVAILABLE.title")}
            </p>
            <p className="mt-1 text-sm">{t("errors.MAP_TILES_UNAVAILABLE.body")}</p>
            <Button
              className="mt-3"
              icon={<RotateCw aria-hidden="true" className="size-4" />}
              onClick={() => {
                setFailed(false);
                setMapKey((k) => k + 1);
              }}
            >
              {t("errors.MAP_TILES_UNAVAILABLE.action")}
            </Button>
          </div>
        </div>
      ) : null}
      {emptyOperators && !failed ? (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-center">
          <div className="pointer-events-auto flex max-w-lg items-start gap-3 rounded-cards border border-[var(--ar-border-strong)] bg-[var(--ar-surface)] p-4 shadow-sm" role="status">
            <UserX aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-semibold">{t("errors.OPS_NO_LIVE_OPERATORS.title")}</p>
              <p className="text-sm">{t("errors.OPS_NO_LIVE_OPERATORS.body")}</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
