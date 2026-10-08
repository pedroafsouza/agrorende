export type Ring = readonly (readonly [number, number])[];

export interface PlotGeometry {
  readonly areaHa: number | null;
  readonly centroidLat: number | null;
  readonly centroidLng: number | null;
}

export type GeometryProblem = "coordinates" | "ring" | "area" | "centroid";

const EARTH_RADIUS_M = 6_371_008.8;

function validPoint(lng: number, lat: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/**
 * Planar area and centroid of a GeoJSON ring using a local equirectangular projection.
 * Accurate enough for farm plots (a few km across); returns hectares.
 */
export function ringMetrics(ring: Ring): { areaHa: number; centroidLat: number; centroidLng: number } {
  const lat0 = (ring.reduce((sum, [, lat]) => sum + lat, 0) / ring.length) * (Math.PI / 180);
  const project = ([lng, lat]: readonly [number, number]): [number, number] => [
    EARTH_RADIUS_M * (lng * Math.PI / 180) * Math.cos(lat0),
    EARTH_RADIUS_M * (lat * Math.PI / 180),
  ];
  const points = ring.map(project);
  let area2 = 0;
  let cx = 0;
  let cy = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const [x1, y1] = points[index] ?? [0, 0];
    const [x2, y2] = points[index + 1] ?? [0, 0];
    const cross = x1 * y2 - x2 * y1;
    area2 += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  const area = area2 / 2;
  const centroidX = area === 0 ? 0 : cx / (6 * area);
  const centroidY = area === 0 ? 0 : cy / (6 * area);
  return {
    areaHa: Math.abs(area) / 10_000,
    centroidLat: (centroidY / EARTH_RADIUS_M) * (180 / Math.PI),
    centroidLng: (centroidX / (EARTH_RADIUS_M * Math.cos(lat0))) * (180 / Math.PI),
  };
}

/** EC-ERP-03: validates a plot's boundary, area and centroid and derives missing values. */
export function validatePlotGeometry(input: {
  readonly boundary?: { readonly coordinates: readonly Ring[] } | null;
  readonly areaHa?: number | null;
  readonly centroidLat?: number | null;
  readonly centroidLng?: number | null;
}): { ok: true; geometry: PlotGeometry } | { ok: false; problem: GeometryProblem } {
  if (input.areaHa !== undefined && input.areaHa !== null && (!Number.isFinite(input.areaHa) || input.areaHa <= 0)) {
    return { ok: false, problem: "area" };
  }
  const hasLat = input.centroidLat !== undefined && input.centroidLat !== null;
  const hasLng = input.centroidLng !== undefined && input.centroidLng !== null;
  if (hasLat !== hasLng) return { ok: false, problem: "centroid" };
  if (hasLat && hasLng && !validPoint(input.centroidLng ?? Number.NaN, input.centroidLat ?? Number.NaN)) {
    return { ok: false, problem: "centroid" };
  }
  const outer = input.boundary?.coordinates[0];
  if (input.boundary !== undefined && input.boundary !== null) {
    if (outer === undefined || outer.length < 4) return { ok: false, problem: "ring" };
    if (!outer.every(([lng, lat]) => validPoint(lng, lat))) return { ok: false, problem: "coordinates" };
    const first = outer[0];
    const last = outer[outer.length - 1];
    if (first === undefined || last === undefined || first[0] !== last[0] || first[1] !== last[1]) {
      return { ok: false, problem: "ring" };
    }
    const metrics = ringMetrics(outer);
    if (!(metrics.areaHa > 0)) return { ok: false, problem: "area" };
    return {
      ok: true,
      geometry: {
        areaHa: input.areaHa ?? Math.round(metrics.areaHa * 100) / 100,
        centroidLat: hasLat ? (input.centroidLat ?? null) : metrics.centroidLat,
        centroidLng: hasLng ? (input.centroidLng ?? null) : metrics.centroidLng,
      },
    };
  }
  return {
    ok: true,
    geometry: { areaHa: input.areaHa ?? null, centroidLat: input.centroidLat ?? null, centroidLng: input.centroidLng ?? null },
  };
}
