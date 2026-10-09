import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import {
  TerraDrawExtend,
  type GeoJSONStoreFeatures,
  type SetCursor,
  type TerraDrawAdapterStyling,
  type TerraDrawChanges,
  type TerraDrawStylingFunction,
} from "terra-draw";

type TerraDrawCallbacks = TerraDrawExtend.TerraDrawCallbacks;

const SOURCE_ID = "td-features";
const LAYERS = ["td-fill", "td-line", "td-point"] as const;

type StyledProperties = Record<string, unknown> & {
  readonly fillColor: string;
  readonly fillOpacity: number;
  readonly lineColor: string;
  readonly lineWidth: number;
  readonly pointColor: string;
  readonly pointRadius: number;
  readonly pointOutlineColor: string;
  readonly pointOutlineWidth: number;
};

function styled(feature: GeoJSONStoreFeatures, styling: TerraDrawStylingFunction) {
  const mode = typeof feature.properties.mode === "string" ? feature.properties.mode : "";
  const style: TerraDrawAdapterStyling | undefined = styling[mode]?.(feature);
  const isLine = feature.geometry.type === "LineString";
  const properties: StyledProperties = {
    ...feature.properties,
    fillColor: style?.polygonFillColor ?? "#000000",
    fillOpacity: style?.polygonFillOpacity ?? 0,
    lineColor: (isLine ? style?.lineStringColor : style?.polygonOutlineColor) ?? "#000000",
    lineWidth: (isLine ? style?.lineStringWidth : style?.polygonOutlineWidth) ?? 1,
    pointColor: style?.pointColor ?? "#000000",
    pointRadius: style?.pointWidth ?? 4,
    pointOutlineColor: style?.pointOutlineColor ?? "#ffffff",
    pointOutlineWidth: style?.pointOutlineWidth ?? 1,
  };
  return { type: "Feature" as const, id: feature.id, geometry: feature.geometry, properties };
}

/**
 * Minimal MapLibre adapter for terra-draw. terra-draw 1.x moved its adapters to separate
 * packages that are not in the frozen dependency set, so this renders the draw store into a
 * single GeoJSON source with data-driven fill, line and vertex layers.
 */
export class TerraDrawMapLibreAdapter extends TerraDrawExtend.TerraDrawBaseAdapter {
  private readonly map: MapLibreMap;
  private readonly container: HTMLElement;
  private readonly rendered = new Map<string | number, ReturnType<typeof styled>>();

  constructor(config: { readonly map: MapLibreMap } & TerraDrawExtend.BaseAdapterConfig) {
    super(config);
    this.map = config.map;
    this.container = config.map.getContainer();
  }

  override register(callbacks: TerraDrawCallbacks): void {
    super.register(callbacks);
    if (this.map.getSource(SOURCE_ID) === undefined) {
      this.map.addSource(SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      this.map.addLayer({
        id: "td-fill",
        type: "fill",
        source: SOURCE_ID,
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": ["get", "fillColor"], "fill-opacity": ["get", "fillOpacity"] },
      });
      this.map.addLayer({
        id: "td-line",
        type: "line",
        source: SOURCE_ID,
        filter: ["!=", ["geometry-type"], "Point"],
        paint: { "line-color": ["get", "lineColor"], "line-width": ["get", "lineWidth"] },
      });
      this.map.addLayer({
        id: "td-point",
        type: "circle",
        source: SOURCE_ID,
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-color": ["get", "pointColor"],
          "circle-radius": ["get", "pointRadius"],
          "circle-stroke-color": ["get", "pointOutlineColor"],
          "circle-stroke-width": ["get", "pointOutlineWidth"],
        },
      });
    }
    callbacks.onReady?.();
  }

  override unregister(): void {
    super.unregister();
    this.rendered.clear();
    if (this.map.getStyle() === undefined) return;
    for (const id of LAYERS) if (this.map.getLayer(id) !== undefined) this.map.removeLayer(id);
    if (this.map.getSource(SOURCE_ID) !== undefined) this.map.removeSource(SOURCE_ID);
  }

  getMapEventElement(): HTMLElement {
    return this.map.getCanvas();
  }

  project(lng: number, lat: number): { x: number; y: number } {
    const { x, y } = this.map.project({ lng, lat });
    return { x, y };
  }

  unproject(x: number, y: number): { lng: number; lat: number } {
    const { lng, lat } = this.map.unproject([x, y]);
    return { lng, lat };
  }

  setCursor(cursor: Parameters<SetCursor>[0]): void {
    const canvas = this.map.getCanvas();
    if (cursor === "unset") canvas.style.removeProperty("cursor");
    else canvas.style.cursor = cursor;
  }

  getLngLatFromEvent(event: PointerEvent | MouseEvent): { lng: number; lat: number } | null {
    const rect = this.container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
    return this.unproject(x, y);
  }

  setDraggability(enabled: boolean): void {
    if (enabled) this.map.dragPan.enable();
    else this.map.dragPan.disable();
  }

  setDoubleClickToZoom(enabled: boolean): void {
    if (enabled) this.map.doubleClickZoom.enable();
    else this.map.doubleClickZoom.disable();
  }

  render(changes: TerraDrawChanges, styling: TerraDrawStylingFunction): void {
    for (const id of changes.deletedIds) this.rendered.delete(id);
    for (const feature of [...changes.created, ...changes.updated, ...changes.unchanged]) {
      if (feature.id !== undefined && feature.id !== null)
        this.rendered.set(feature.id, styled(feature, styling));
    }
    this.flush();
  }

  clear(): void {
    this.rendered.clear();
    this.flush();
  }

  private flush(): void {
    const source = this.map.getSource<GeoJSONSource>(SOURCE_ID);
    source?.setData({ type: "FeatureCollection", features: [...this.rendered.values()] });
  }
}
