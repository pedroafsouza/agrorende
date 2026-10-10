/**
 * MapLibre GL 6 ships as ES modules only and finds its worker through `import.meta.url`, which
 * does not point at the worker file once webpack or Turbopack has bundled the library. This
 * `new URL(..., import.meta.url)` pattern makes Next.js emit `maplibre-gl-worker.mjs` as a hashed
 * same-origin asset; every `<Map>` passes it through the react-map-gl `workerUrl` prop.
 */
export const MAPLIBRE_WORKER_URL = new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString();
