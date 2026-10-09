// @vitest-environment jsdom
import type { Map as MapLibreMap } from "maplibre-gl";
import { TerraDraw, TerraDrawPolygonMode, TerraDrawSelectMode } from "terra-draw";
import { describe, expect, it, vi } from "vitest";

import { TerraDrawMapLibreAdapter } from "./terraDrawMapLibre";

function fakeMap() {
  const canvas = document.createElement("canvas");
  const container = document.createElement("div");
  container.appendChild(canvas);
  const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>();
  const layers = new Set<string>();
  const map = {
    getCanvas: () => canvas,
    getContainer: () => container,
    getStyle: () => ({}),
    getSource: (id: string) => sources.get(id),
    addSource: (id: string) => sources.set(id, { setData: vi.fn() }),
    removeSource: (id: string) => sources.delete(id),
    getLayer: (id: string) => (layers.has(id) ? { id } : undefined),
    addLayer: (layer: { id: string }) => layers.add(layer.id),
    removeLayer: (id: string) => layers.delete(id),
    project: ({ lng, lat }: { lng: number; lat: number }) => ({ x: lng * 10, y: -lat * 10 }),
    unproject: ([x, y]: [number, number]) => ({ lng: x / 10, lat: -y / 10 }),
    dragPan: { enable: vi.fn(), disable: vi.fn() },
    doubleClickZoom: { enable: vi.fn(), disable: vi.fn() },
  };
  return { map, sources, layers, canvas };
}

describe("TerraDrawMapLibreAdapter", () => {
  it("renders the draw store into one styled GeoJSON source and cleans up on stop", () => {
    const { map, sources, layers, canvas } = fakeMap();
    const draw = new TerraDraw({
      adapter: new TerraDrawMapLibreAdapter({
        map: map as unknown as MapLibreMap,
        coordinatePrecision: 6,
      }),
      modes: [
        new TerraDrawPolygonMode({
          styles: {
            fillColor: "#a04020",
            fillOpacity: 0.2,
            outlineColor: "#a04020",
            outlineWidth: 3,
          },
        }),
        new TerraDrawSelectMode(),
      ],
    });
    const ready = vi.fn();
    draw.on("ready", ready);
    draw.start();
    expect(ready).toHaveBeenCalledOnce();
    expect([...layers]).toEqual(["td-fill", "td-line", "td-point"]);
    draw.setMode("polygon");
    const [result] = draw.addFeatures([
      {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-47, -22],
              [-46.99, -22],
              [-46.99, -21.99],
              [-47, -22],
            ],
          ],
        },
        properties: { mode: "polygon" },
      },
    ]);
    expect(result?.valid).toBe(true);
    const setData = sources.get("td-features")?.setData;
    const last = setData?.mock.calls.at(-1)?.[0] as {
      features: { geometry: { type: string }; properties: Record<string, unknown> }[];
    };
    const polygon = last.features.find((feature) => feature.geometry.type === "Polygon");
    expect(polygon?.properties).toMatchObject({
      fillColor: "#a04020",
      fillOpacity: 0.2,
      lineColor: "#a04020",
      lineWidth: 3,
    });

    const adapter = new TerraDrawMapLibreAdapter({ map: map as unknown as MapLibreMap });
    expect(adapter.project(-47, -22)).toEqual({ x: -470, y: 220 });
    expect(adapter.unproject(-470, 220)).toEqual({ lng: -47, lat: -22 });
    adapter.setCursor("crosshair");
    expect(canvas.style.cursor).toBe("crosshair");
    adapter.setCursor("unset");
    expect(canvas.style.cursor).toBe("");
    adapter.setDraggability(false);
    expect(map.dragPan.disable).toHaveBeenCalled();
    adapter.setDoubleClickToZoom(true);
    expect(map.doubleClickZoom.enable).toHaveBeenCalled();

    draw.stop();
    expect(layers.size).toBe(0);
    expect(sources.size).toBe(0);
  });
});
