"use client";

import { campoClaroPalette } from "@agrorende/design-tokens";
import { Eraser, PenLine } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Layer, Source, type MapRef } from "react-map-gl/maplibre";
import {
  TerraDraw,
  TerraDrawPolygonMode,
  TerraDrawSelectMode,
  type GeoJSONStoreFeatures,
} from "terra-draw";

import { MapView } from "@/components/map/MapView";
import { Button } from "@/components/ui/Button";
import { satelliteTilesUrl } from "@/features/ops/filters";

import { ringBounds, type Position } from "./plotGeometry";
import { TerraDrawMapLibreAdapter } from "./terraDrawMapLibre";

export interface BoundaryDrawMapProps {
  readonly ring: Position[] | null;
  readonly onChange: (ring: Position[] | null) => void;
  readonly center?: { readonly lng: number; readonly lat: number } | null;
}

const TERRA = campoClaroPalette["terra-600"] as `#${string}`;
const WHITE = "#ffffff";

function polygonFeature(ring: Position[]): GeoJSONStoreFeatures {
  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [ring] },
    properties: { mode: "polygon" },
  };
}

function sameRing(a: Position[] | null, b: Position[] | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.length === b.length &&
    a.every(([lng, lat], index) => b[index]?.[0] === lng && b[index]?.[1] === lat)
  );
}

/**
 * terra-draw polygon drawing on a MapLibre map (T16.5). One polygon at a time: drawing a new
 * one replaces the old, and select mode lets the user drag, insert and delete corners.
 */
export function BoundaryDrawMap({ ring, onChange, center }: BoundaryDrawMapProps) {
  const t = useTranslations("assets");
  const mapRef = useRef<MapRef>(null);
  const drawRef = useRef<TerraDraw | null>(null);
  const emitted = useRef<Position[] | null>(ring);
  const initialRing = useRef(ring);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [ready, setReady] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const satellite = satelliteTilesUrl();

  useEffect(
    () => () => {
      drawRef.current?.stop();
      drawRef.current = null;
    },
    [],
  );

  useEffect(() => {
    const draw = drawRef.current;
    if (draw === null || !ready || sameRing(ring, emitted.current)) return;
    emitted.current = ring;
    draw.clear();
    if (ring !== null) {
      const [added] = draw.addFeatures([polygonFeature(ring)]);
      if (added?.valid === true) draw.selectFeature(added.id as string);
    }
  }, [ring, ready]);

  const handleLoad = () => {
    const map = mapRef.current?.getMap();
    if (map === undefined || drawRef.current !== null) return;
    const draw = new TerraDraw({
      adapter: new TerraDrawMapLibreAdapter({ map, coordinatePrecision: 6 }),
      modes: [
        new TerraDrawPolygonMode({
          styles: {
            fillColor: TERRA,
            fillOpacity: 0.2,
            outlineColor: TERRA,
            outlineWidth: 3,
            closingPointColor: TERRA,
            closingPointWidth: 8,
          },
        }),
        new TerraDrawSelectMode({
          flags: {
            polygon: {
              feature: {
                draggable: true,
                coordinates: { midpoints: true, draggable: true, deletable: true },
              },
            },
          },
          styles: {
            selectedPolygonColor: TERRA,
            selectedPolygonFillOpacity: 0.25,
            selectedPolygonOutlineColor: TERRA,
            selectedPolygonOutlineWidth: 3,
            selectionPointColor: TERRA,
            selectionPointWidth: 8,
            midPointColor: WHITE,
            midPointOutlineColor: TERRA,
          },
        }),
      ],
    });
    draw.on("finish", (id) => {
      const polygons = draw.getSnapshot().filter((feature) => feature.geometry.type === "Polygon");
      const others = polygons
        .filter((feature) => feature.id !== id)
        .map((feature) => feature.id as string);
      if (others.length > 0) draw.removeFeatures(others);
      const finished = polygons.find((feature) => feature.id === id);
      if (finished === undefined || finished.geometry.type !== "Polygon") return;
      const next = (finished.geometry.coordinates[0] ?? []).map(
        ([lng, lat]) => [lng, lat] as Position,
      );
      emitted.current = next;
      onChangeRef.current(next);
      if (draw.getMode() !== "select") {
        draw.setMode("select");
        draw.selectFeature(id);
        setDrawing(false);
      }
    });
    draw.on("ready", () => {
      const start = initialRing.current;
      if (start !== null) {
        const [added] = draw.addFeatures([polygonFeature(start)]);
        const bounds = ringBounds(start);
        if (bounds !== null) map.fitBounds(bounds, { padding: 32, duration: 0 });
        draw.setMode("select");
        if (added?.valid === true) draw.selectFeature(added.id as string);
      } else {
        draw.setMode("select");
      }
      setReady(true);
    });
    drawRef.current = draw;
    draw.start();
  };

  const startDrawing = () => {
    const draw = drawRef.current;
    if (draw === null) return;
    draw.setMode("polygon");
    setDrawing(true);
  };

  const clear = () => {
    const draw = drawRef.current;
    draw?.clear();
    draw?.setMode("select");
    setDrawing(false);
    emitted.current = null;
    onChangeRef.current(null);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          aria-pressed={drawing}
          disabled={!ready}
          icon={<PenLine aria-hidden="true" className="size-4" />}
          onClick={startDrawing}
        >
          {t("plots.boundary.draw")}
        </Button>
        <Button
          disabled={!ready || ring === null}
          icon={<Eraser aria-hidden="true" className="size-4" />}
          onClick={clear}
          variant="ghost"
        >
          {t("plots.boundary.clear")}
        </Button>
      </div>
      <p className="text-sm text-[var(--ar-text-muted)]">
        {drawing ? t("plots.boundary.drawingHint") : t("plots.boundary.editHint")}
      </p>
      <MapView
        className="h-80 overflow-hidden rounded-cards border border-[var(--ar-border)]"
        initial={
          center === null || center === undefined
            ? undefined
            : { lng: center.lng, lat: center.lat, zoom: 14 }
        }
        mapId="plot-boundary"
        onLoad={handleLoad}
        ref={mapRef}
      >
        {ready && satellite !== null ? (
          <Source id="plot-satellite" tileSize={256} tiles={[satellite]} type="raster">
            <Layer beforeId="td-fill" id="plot-satellite-layer" type="raster" />
          </Source>
        ) : null}
      </MapView>
    </div>
  );
}
