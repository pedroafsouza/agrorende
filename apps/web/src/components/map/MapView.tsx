"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { forwardRef, useEffect, useImperativeHandle, useRef, type ReactNode } from "react";
import Map, { Marker, NavigationControl, type MapProps, type MapRef } from "react-map-gl/maplibre";

import { MAPLIBRE_WORKER_URL } from "./maplibreWorker";
import { useMapLayers } from "./useMapLayers";

const LIGHT_STYLE = process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? "https://tiles.openfreemap.org/styles/liberty";
const DARK_STYLE = process.env.NEXT_PUBLIC_MAP_STYLE_DARK_URL ?? "https://tiles.openfreemap.org/styles/dark";

export interface MapPoint {
  readonly id: string;
  readonly lng: number;
  readonly lat: number;
  readonly label: string;
  readonly shape?: "circle" | "square" | "diamond";
  readonly tone?: "primary" | "danger" | "warning" | "neutral";
}

const toneVar = { primary: "var(--ar-primary)", danger: "var(--ar-danger)", warning: "var(--ar-warning)", neutral: "var(--ar-text-muted)" } as const;

/** Marker shapes follow §3.7: report circle, work order square, asset diamond. */
export function MapMarker({ point, onClick }: { readonly point: MapPoint; readonly onClick?: (id: string) => void }) {
  const shape = point.shape ?? "circle";
  const color = toneVar[point.tone ?? "primary"];
  return (
    <Marker anchor="center" latitude={point.lat} longitude={point.lng}>
      <button aria-label={point.label} className="flex size-12 items-center justify-center" onClick={() => onClick?.(point.id)} title={point.label} type="button">
        <span
          className={shape === "circle" ? "size-5 rounded-full border-2 border-white" : shape === "square" ? "size-5 border-2 border-white" : "size-4 rotate-45 border-2 border-white"}
          style={{ background: color }}
        />
      </button>
    </Marker>
  );
}

export interface MapViewProps {
  readonly mapId: string;
  readonly points?: readonly MapPoint[];
  readonly onPointClick?: (id: string) => void;
  readonly className?: string;
  readonly children?: ReactNode;
  readonly initial?: { lng: number; lat: number; zoom: number };
  readonly onError?: MapProps["onError"];
  readonly onLoad?: MapProps["onLoad"];
  readonly onClick?: MapProps["onClick"];
  readonly interactiveLayerIds?: MapProps["interactiveLayerIds"];
}

/**
 * Base map with theme-aware style, fit-to-bounds over `points`, and registry layers from
 * `useMapLayers`. The forwarded ref exposes the react-map-gl `MapRef` for source updates.
 */
export const MapView = forwardRef<MapRef, MapViewProps>(function MapView(
  { mapId, points = [], onPointClick, className, children, initial = { lng: -51.9, lat: -14.2, zoom: 3.5 }, onError, onLoad, onClick, interactiveLayerIds },
  forwarded,
) {
  const t = useTranslations("common");
  const { resolvedTheme } = useTheme();
  const ref = useRef<MapRef>(null);
  useImperativeHandle(forwarded, () => ref.current as MapRef, []);
  const layers = useMapLayers(mapId);

  useEffect(() => {
    const map = ref.current;
    if (map === null || points.length === 0) return;
    if (points.length === 1) {
      const [p] = points;
      if (p !== undefined) map.flyTo({ center: [p.lng, p.lat], zoom: 13, duration: 0 });
      return;
    }
    const lngs = points.map((p) => p.lng);
    const lats = points.map((p) => p.lat);
    map.fitBounds([Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)], { padding: 48, duration: 0 });
  }, [points]);

  return (
    <div aria-label={t("map.label")} className={className ?? "h-80 overflow-hidden rounded-cards border border-[var(--ar-border)]"} role="region">
      <Map initialViewState={{ longitude: initial.lng, latitude: initial.lat, zoom: initial.zoom }} interactiveLayerIds={interactiveLayerIds} mapStyle={resolvedTheme === "dark" ? DARK_STYLE : LIGHT_STYLE} onClick={onClick} onError={onError} onLoad={onLoad} ref={ref} workerUrl={MAPLIBRE_WORKER_URL}>
        <NavigationControl position="top-right" />
        {points.map((p) => (
          <MapMarker key={p.id} onClick={onPointClick} point={p} />
        ))}
        {layers.map((layer) => (
          <LayerSlot key={layer.id} render={layer.render} />
        ))}
        {children}
      </Map>
    </div>
  );
});

function LayerSlot({ render }: { readonly render: () => ReactNode }) {
  return <>{render()}</>;
}
