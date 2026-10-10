"use client";

import { CalendarRange, type LucideIcon, MessageSquareWarning, Tractor, Wrench } from "lucide-react";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";

import { campoClaroPalette } from "@agrorende/design-tokens";

/** Map pin colours follow the status palette; the glyph colour keeps contrast on the fill (§3.7). */
const PIN_TONES = {
  info: { fill: campoClaroPalette.info.light, glyph: "#FFFFFF" },
  warning: { fill: campoClaroPalette.warning.fill, glyph: campoClaroPalette.warning.onFill },
  danger: { fill: campoClaroPalette.danger.light, glyph: "#FFFFFF" },
  neutral: { fill: campoClaroPalette.neutral, glyph: "#FFFFFF" },
  primary: { fill: campoClaroPalette["mata-700"], glyph: "#FFFFFF" },
} as const;

export type PinTone = keyof typeof PIN_TONES;

export interface PinSpec {
  readonly icon: LucideIcon;
  readonly tone: PinTone;
}

/** Every map image id used by the symbol layers of the Ops map. */
export const MAP_PINS = {
  report: { icon: MessageSquareWarning, tone: "warning" },
  "report-critical": { icon: MessageSquareWarning, tone: "danger" },
  "wo-ok": { icon: Wrench, tone: "info" },
  "wo-risk": { icon: Wrench, tone: "warning" },
  "wo-breached": { icon: Wrench, tone: "danger" },
  asset: { icon: Tractor, tone: "neutral" },
  "asset-rented": { icon: Tractor, tone: "info" },
  rental: { icon: CalendarRange, tone: "primary" },
  "rental-overdue": { icon: CalendarRange, tone: "danger" },
} as const satisfies Record<string, PinSpec>;

export type MapPinId = keyof typeof MAP_PINS;

export function isMapPinId(id: string): id is MapPinId {
  return Object.hasOwn(MAP_PINS, id);
}

/** Pin geometry in CSS pixels: a 32×40 teardrop whose tip is the map position. */
export const PIN_WIDTH = 32;
export const PIN_HEIGHT = 40;
const PIN_PATH = "M16 38.5C16 38.5 3 25 3 16a13 13 0 0 1 26 0c0 9-13 22.5-13 22.5Z";
const GLYPH_SIZE = 16;
const GLYPH_OFFSET = (PIN_WIDTH - GLYPH_SIZE) / 2;

/** Room around the pin for the drop shadow; the symbol layer offsets the icon by `PIN_PAD`. */
export const PIN_PAD = 4;
const PIXEL_RATIO = 2;

const glyphCache = new Map<LucideIcon, string>();

/** The lucide icon as SVG markup, rendered once per icon. */
export function glyphMarkup(icon: LucideIcon): string {
  const cached = glyphCache.get(icon);
  if (cached !== undefined) return cached;
  const host = document.createElement("div");
  const root = createRoot(host);
  flushSync(() => root.render(createElement(icon, { size: GLYPH_SIZE, strokeWidth: 2.5, color: "currentColor", "aria-hidden": true })));
  const markup = host.innerHTML;
  root.unmount();
  glyphCache.set(icon, markup);
  return markup;
}

/** Standalone SVG of one pin: tone fill, white outline and the glyph centred in the head. */
export function pinSvg(spec: PinSpec, glyph: string = glyphMarkup(spec.icon)): string {
  const tone = PIN_TONES[spec.tone];
  const positioned = glyph.replace("<svg", `<svg x="${GLYPH_OFFSET}" y="${GLYPH_OFFSET - 3}"`);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PIN_WIDTH}" height="${PIN_HEIGHT}" viewBox="0 0 ${PIN_WIDTH} ${PIN_HEIGHT}" color="${tone.glyph}">` +
    `<path d="${PIN_PATH}" fill="${tone.fill}" stroke="#FFFFFF" stroke-width="2.5" stroke-linejoin="round"/>` +
    positioned +
    `</svg>`
  );
}

interface PinTarget {
  hasImage(id: string): boolean;
  addImage(id: string, image: ImageData, options: { pixelRatio: number }): void;
}

const pending = new WeakMap<PinTarget, Set<string>>();

/** Rasterises a pin with a soft shadow at 2× and registers it on the map; repeated calls are no-ops. */
export async function addMapPin(map: PinTarget, id: MapPinId): Promise<void> {
  if (map.hasImage(id)) return;
  const inFlight = pending.get(map) ?? new Set<string>();
  pending.set(map, inFlight);
  if (inFlight.has(id)) return;
  inFlight.add(id);
  try {
    const image = new Image(PIN_WIDTH, PIN_HEIGHT);
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pinSvg(MAP_PINS[id]))}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = (PIN_WIDTH + PIN_PAD * 2) * PIXEL_RATIO;
    canvas.height = (PIN_HEIGHT + PIN_PAD * 2) * PIXEL_RATIO;
    const context = canvas.getContext("2d");
    if (context === null) return;
    context.scale(PIXEL_RATIO, PIXEL_RATIO);
    context.shadowColor = "rgba(17, 19, 21, 0.35)";
    context.shadowBlur = 3;
    context.shadowOffsetY = 1.5;
    context.drawImage(image, PIN_PAD, PIN_PAD, PIN_WIDTH, PIN_HEIGHT);
    if (!map.hasImage(id)) map.addImage(id, context.getImageData(0, 0, canvas.width, canvas.height), { pixelRatio: PIXEL_RATIO });
  } finally {
    inFlight.delete(id);
  }
}

export function addAllMapPins(map: PinTarget): Promise<void> {
  return Promise.all((Object.keys(MAP_PINS) as MapPinId[]).map((id) => addMapPin(map, id))).then(() => undefined);
}

/** The same pin as inline SVG, for legends and menus next to the map. */
export function MapPinGlyph({ id, className = "" }: { readonly id: MapPinId; readonly className?: string }) {
  const spec = MAP_PINS[id];
  const tone = PIN_TONES[spec.tone];
  const Icon = spec.icon;
  return (
    <svg aria-hidden="true" className={className} color={tone.glyph} data-pin={id} height={PIN_HEIGHT / 2} viewBox={`0 0 ${PIN_WIDTH} ${PIN_HEIGHT}`} width={PIN_WIDTH / 2}>
      <path d={PIN_PATH} fill={tone.fill} stroke="#FFFFFF" strokeLinejoin="round" strokeWidth={2.5} />
      <Icon color="currentColor" height={GLYPH_SIZE} strokeWidth={2.5} width={GLYPH_SIZE} x={GLYPH_OFFSET} y={GLYPH_OFFSET - 3} />
    </svg>
  );
}

/** Legend and layer-menu rows that are drawn as pins; operators keep their ring glyph. */
export const LEGEND_PINS: Readonly<Partial<Record<string, MapPinId>>> = {
  reports: "report",
  reportsCritical: "report-critical",
  workOrders: "wo-ok",
  workOrdersRisk: "wo-risk",
  assets: "asset",
  rentals: "rental",
};

/** The pin for a legend row, or its text glyph when the row has no pin. */
export function LegendMark({ item, fallback }: { readonly item: string; readonly fallback: string }) {
  const pin = LEGEND_PINS[item];
  return pin === undefined ? <>{fallback}</> : <MapPinGlyph className="inline-block" id={pin} />;
}
