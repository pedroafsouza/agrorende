export type Position = [number, number];

const EARTH_RADIUS_M = 6_371_008.8;

/**
 * Planar ring area in hectares with the same local equirectangular projection as the server
 * (`packages/core/src/modules/sites/geometry.ts`), so the preview matches the saved value.
 */
export function ringAreaHa(ring: readonly Position[]): number {
  if (ring.length < 4) return 0;
  const lat0 = (ring.reduce((sum, [, lat]) => sum + lat, 0) / ring.length) * (Math.PI / 180);
  const points = ring.map(
    ([lng, lat]) =>
      [
        EARTH_RADIUS_M * ((lng * Math.PI) / 180) * Math.cos(lat0),
        EARTH_RADIUS_M * ((lat * Math.PI) / 180),
      ] as const,
  );
  let area2 = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const [x1, y1] = points[index] ?? [0, 0];
    const [x2, y2] = points[index + 1] ?? [0, 0];
    area2 += x1 * y2 - x2 * y1;
  }
  return Math.abs(area2 / 2) / 10_000;
}

export function closeRing(points: readonly Position[]): Position[] {
  const ring = points.map(([lng, lat]) => [lng, lat] as Position);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first !== undefined && last !== undefined && (first[0] !== last[0] || first[1] !== last[1]))
    ring.push([first[0], first[1]]);
  return ring;
}

export type ParseResult =
  { ok: true; ring: Position[] } | { ok: false; problem: "format" | "range" | "tooFew" };

/** Parses one "longitude, latitude" pair per line (comma, semicolon or space separated) into a closed ring. */
export function parseRing(text: string): ParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const points: Position[] = [];
  for (const line of lines) {
    const parts = line.split(/[\s,;]+/).filter((part) => part.length > 0);
    if (parts.length !== 2) return { ok: false, problem: "format" };
    const lng = Number(parts[0]);
    const lat = Number(parts[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return { ok: false, problem: "format" };
    if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return { ok: false, problem: "range" };
    points.push([lng, lat]);
  }
  const ring = closeRing(points);
  if (ring.length < 4) return { ok: false, problem: "tooFew" };
  return { ok: true, ring };
}

/** Formats a closed ring back to text, dropping the repeated closing vertex. */
export function formatRing(ring: readonly Position[]): string {
  const open = ring.length > 1 ? ring.slice(0, -1) : ring;
  return open.map(([lng, lat]) => `${lng.toFixed(6)}, ${lat.toFixed(6)}`).join("\n");
}

export function ringBounds(ring: readonly Position[]): [number, number, number, number] | null {
  if (ring.length === 0) return null;
  const lngs = ring.map(([lng]) => lng);
  const lats = ring.map(([, lat]) => lat);
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}
