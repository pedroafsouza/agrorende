"use client";

import {
  CalendarRange,
  ChevronDown,
  LandPlot,
  Layers,
  type LucideIcon,
  Map as MapIcon,
  MessageSquareWarning,
  Satellite,
  Tractor,
  Users,
  Wrench,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { MAP_LAYERS, type BaseMap, type MapLayerKey } from "./filters";
import { LegendMark } from "./mapPins";

const ROW = "flex min-h-12 cursor-pointer items-center gap-3 rounded-[6px] px-3 text-sm hover:bg-[var(--ar-surface-muted)] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--ar-focus)]";
const BOX = "size-5 shrink-0 accent-[var(--ar-primary)] focus-visible:outline-none";
const ICON = "size-5 shrink-0 text-[var(--ar-text-muted)]";

/** What each layer shows; the map pin stays at the end of the row to match the map. */
export const LAYER_ICONS: Readonly<Record<MapLayerKey, LucideIcon>> = {
  operators: Users,
  reports: MessageSquareWarning,
  workOrders: Wrench,
  assets: Tractor,
  rentals: CalendarRange,
};

export interface LayerMenuProps {
  readonly layers: ReadonlySet<MapLayerKey>;
  readonly onToggleLayer: (layer: MapLayerKey) => void;
  readonly showBoundaries: boolean;
  readonly onToggleBoundaries: () => void;
  /** Satellite toggle is only offered when the deployment has a tile URL. */
  readonly satelliteAvailable: boolean;
  readonly baseMap: BaseMap;
  readonly onToggleBaseMap: () => void;
}

/**
 * One "Layers" button over the map that opens the layer checkboxes, so the controls never wrap
 * into a ragged row next to a narrow map. The checkboxes stay in the DOM for keyboard and screen
 * reader users; Escape or a click outside closes the panel.
 */
export function LayerMenu({ layers, onToggleLayer, showBoundaries, onToggleBoundaries, satelliteAvailable, baseMap, onToggleBaseMap }: LayerMenuProps) {
  const t = useTranslations("ops");
  const ref = useRef<HTMLDetailsElement>(null);
  const total = MAP_LAYERS.length + 1;
  const shown = MAP_LAYERS.filter((l) => layers.has(l)).length + (showBoundaries ? 1 : 0);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      const details = ref.current;
      if (details?.open === true && event.target instanceof Node && !details.contains(event.target)) details.open = false;
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  return (
    <details
      className="group relative w-fit"
      data-testid="layer-toggles"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || ref.current?.open !== true) return;
        ref.current.open = false;
        ref.current.querySelector("summary")?.focus();
      }}
      ref={ref}
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-controls border border-[var(--ar-border-strong)] bg-[var(--ar-surface)] px-3 text-sm font-semibold hover:bg-[var(--ar-surface-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ar-focus)] [&::-webkit-details-marker]:hidden">
        <Layers aria-hidden="true" className="size-5" />
        {t("layers.short")}
        <span className="rounded-full bg-[var(--ar-surface-muted)] px-2 text-xs font-medium text-[var(--ar-text-muted)] tabular-nums">{t("layers.count", { shown, total })}</span>
        <ChevronDown aria-hidden="true" className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <fieldset className="absolute top-full left-0 z-20 mt-1 flex w-64 flex-col rounded-cards border border-[var(--ar-border)] bg-[var(--ar-surface)] p-1 shadow-lg">
        <legend className="sr-only">{t("layers.label")}</legend>
        {MAP_LAYERS.map((layer) => {
          const Icon = LAYER_ICONS[layer];
          return (
            <label className={ROW} key={layer}>
              <input checked={layers.has(layer)} className={BOX} onChange={() => onToggleLayer(layer)} type="checkbox" />
              <Icon aria-hidden="true" className={ICON} data-testid={`layer-icon-${layer}`} />
              <span className="flex-1">{t(`layers.${layer}`)}</span>
              <span aria-hidden="true" className="flex w-5 justify-center text-xs text-[var(--ar-text-muted)]">
                <LegendMark fallback={t(`legend.glyph.${layer}`)} item={layer} />
              </span>
            </label>
          );
        })}
        <label className={ROW}>
          <input checked={showBoundaries} className={BOX} onChange={onToggleBoundaries} type="checkbox" />
          <LandPlot aria-hidden="true" className={ICON} />
          <span className="flex-1">{t("layers.boundaries")}</span>
        </label>
        {satelliteAvailable ? (
          <>
            <hr className="mx-2 my-1 border-[var(--ar-border)]" />
            <button aria-pressed={baseMap === "satellite"} className={`${ROW} text-left aria-pressed:bg-[var(--ar-primary-bg)] aria-pressed:text-[var(--ar-primary-text)]`} onClick={onToggleBaseMap} type="button">
              {baseMap === "satellite" ? <MapIcon aria-hidden="true" className="size-5" /> : <Satellite aria-hidden="true" className="size-5" />}
              <span>{t("layers.satellite")}</span>
            </button>
          </>
        ) : null}
      </fieldset>
    </details>
  );
}
