import type { PlotBoundariesDTO } from "@agrorende/core/modules/ops/boundaries";

import type { OpsView } from "./filters";

/** `[[west, south], [east, north]]`, the shape MapLibre's `fitBounds` takes. */
export type LngLatBounds = readonly [readonly [number, number], readonly [number, number]];

export interface MapCenter {
  readonly longitude: number;
  readonly latitude: number;
  readonly zoom: number;
}

const BRAZIL: MapCenter = { longitude: -51.9, latitude: -14.2, zoom: 4 };

/**
 * Approximate centre of the agricultural region each Brazilian time zone covers. The organisation
 * has no address on file, so its time zone is the best hint of where the map should open when
 * nothing has a position yet.
 */
const TIMEZONE_CENTERS: Readonly<Record<string, MapCenter>> = {
  "America/Sao_Paulo": { longitude: -48.5, latitude: -22.0, zoom: 6 },
  "America/Campo_Grande": { longitude: -54.6, latitude: -20.5, zoom: 6 },
  "America/Cuiaba": { longitude: -55.9, latitude: -13.0, zoom: 5.5 },
  "America/Porto_Velho": { longitude: -63.0, latitude: -10.8, zoom: 6 },
  "America/Rio_Branco": { longitude: -70.0, latitude: -9.3, zoom: 6 },
  "America/Manaus": { longitude: -62.0, latitude: -4.0, zoom: 5 },
  "America/Boa_Vista": { longitude: -61.0, latitude: 2.5, zoom: 6 },
  "America/Belem": { longitude: -50.0, latitude: -3.5, zoom: 5.5 },
  "America/Santarem": { longitude: -54.7, latitude: -2.5, zoom: 6 },
  "America/Araguaina": { longitude: -48.3, latitude: -10.2, zoom: 6 },
  "America/Bahia": { longitude: -42.0, latitude: -12.5, zoom: 5.5 },
  "America/Fortaleza": { longitude: -42.0, latitude: -5.5, zoom: 5.5 },
  "America/Recife": { longitude: -37.5, latitude: -8.3, zoom: 6.5 },
  "America/Maceio": { longitude: -37.0, latitude: -10.0, zoom: 7 },
};

/** Where the map opens before any data has a position: the organisation's region, else Brazil. */
export function fallbackCenter(timezone: string | null | undefined): MapCenter {
  return (timezone === null || timezone === undefined ? undefined : TIMEZONE_CENTERS[timezone]) ?? BRAZIL;
}

function valid(lng: number, lat: number): boolean {
  return Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90 && !(lng === 0 && lat === 0);
}

/** Smallest box holding every positioned item and plot on the map, or null when nothing has a position. */
export function dataBounds(view: OpsView, boundaries: PlotBoundariesDTO | null = null): LngLatBounds | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  const add = (lng: number | null | undefined, lat: number | null | undefined) => {
    if (lng === null || lng === undefined || lat === null || lat === undefined || !valid(lng, lat)) return;
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  };
  for (const o of view.operators) add(o.lng, o.lat);
  for (const r of view.reports) add(r.lng, r.lat);
  for (const w of view.workOrders) add(w.lng, w.lat);
  for (const a of view.assets) add(a.lng, a.lat);
  for (const r of view.rentals) add(r.lng, r.lat);
  for (const feature of boundaries?.features ?? []) {
    for (const ring of feature.geometry.coordinates) {
      for (const position of ring) add(position[0], position[1]);
    }
  }
  if (!Number.isFinite(west)) return null;
  return [
    [west, south],
    [east, north],
  ];
}
