/** WO-06 / EC-WO-21: asks "Arrived at X?" near the site; never changes the status by itself. */

export const DEFAULT_SITE_RADIUS_M = 200;
export const ARRIVAL_DECLINE_SUPPRESS_MS = 10 * 60_000;
/** A fix this imprecise cannot say the worker is inside a 200 m circle. */
export const ARRIVAL_MAX_ACCURACY_M = 150;

export interface GeoPoint {
  readonly lat: number;
  readonly lng: number;
}

export interface ArrivalFix extends GeoPoint {
  readonly accuracyM?: number | null;
}

export interface ArrivalTarget extends GeoPoint {
  readonly workOrderId: string;
  readonly status: string;
  readonly radiusM?: number | null;
}

/** Per work order: when it was shown and when the worker last said "Not here yet". */
export interface ArrivalMemory {
  readonly shown: Readonly<Record<string, number>>;
  readonly declinedAt: Readonly<Record<string, number>>;
}

export const EMPTY_ARRIVAL_MEMORY: ArrivalMemory = { shown: {}, declinedAt: {} };

const EARTH_RADIUS_M = 6_371_000;

export function distanceM(a: GeoPoint, b: GeoPoint): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isInsideSite(fix: ArrivalFix, target: ArrivalTarget): boolean {
  if (fix.accuracyM !== undefined && fix.accuracyM !== null && fix.accuracyM > ARRIVAL_MAX_ACCURACY_M) return false;
  const radius = typeof target.radiusM === "number" && target.radiusM > 0 ? target.radiusM : DEFAULT_SITE_RADIUS_M;
  return distanceM(fix, target) <= radius;
}

/**
 * True when the prompt should open for this fix: the job is EN_ROUTE, the fix is inside the site
 * radius, the prompt was not already shown for this work order, or it was declined more than ten
 * minutes ago.
 */
export function shouldPromptArrival(fix: ArrivalFix, target: ArrivalTarget, memory: ArrivalMemory, nowMs: number): boolean {
  if (target.status !== "EN_ROUTE" || !isInsideSite(fix, target)) return false;
  const declinedAt = memory.declinedAt[target.workOrderId];
  if (declinedAt !== undefined) return nowMs - declinedAt >= ARRIVAL_DECLINE_SUPPRESS_MS;
  return memory.shown[target.workOrderId] === undefined;
}

export function rememberShown(memory: ArrivalMemory, workOrderId: string, nowMs: number): ArrivalMemory {
  const { [workOrderId]: _declined, ...declinedAt } = memory.declinedAt;
  return { shown: { ...memory.shown, [workOrderId]: nowMs }, declinedAt };
}

export function rememberDeclined(memory: ArrivalMemory, workOrderId: string, nowMs: number): ArrivalMemory {
  return { shown: { ...memory.shown, [workOrderId]: nowMs }, declinedAt: { ...memory.declinedAt, [workOrderId]: nowMs } };
}

/** Text the office reads in the job's comments when the worker says the pin is wrong. */
export function pointUpdateText(fix: ArrivalFix): string {
  return `${fix.lat.toFixed(6)}, ${fix.lng.toFixed(6)}${fix.accuracyM === undefined || fix.accuracyM === null ? "" : ` (±${Math.round(fix.accuracyM)} m)`}`;
}
