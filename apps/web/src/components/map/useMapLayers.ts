"use client";

import { useSyncExternalStore, type ReactNode } from "react";

/**
 * Registry so feature tasks (T09 live map, T16 geofences) add layers to `MapView` without
 * editing the base. A layer is any react-map-gl child: `<Source>`/`<Layer>` pairs or markers.
 */
export interface MapLayerDefinition {
  readonly id: string;
  readonly order?: number;
  readonly render: () => ReactNode;
}

type Listener = () => void;

const registries = new Map<string, { layers: MapLayerDefinition[]; listeners: Set<Listener> }>();

function registry(mapId: string) {
  let entry = registries.get(mapId);
  if (entry === undefined) {
    entry = { layers: [], listeners: new Set() };
    registries.set(mapId, entry);
  }
  return entry;
}

export function registerMapLayer(mapId: string, layer: MapLayerDefinition): () => void {
  const entry = registry(mapId);
  entry.layers = [...entry.layers.filter((l) => l.id !== layer.id), layer].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  entry.listeners.forEach((l) => l());
  return () => {
    entry.layers = entry.layers.filter((l) => l.id !== layer.id);
    entry.listeners.forEach((l) => l());
  };
}

export function useMapLayers(mapId: string): readonly MapLayerDefinition[] {
  const entry = registry(mapId);
  return useSyncExternalStore(
    (listener) => {
      entry.listeners.add(listener);
      return () => entry.listeners.delete(listener);
    },
    () => entry.layers,
    () => entry.layers,
  );
}
