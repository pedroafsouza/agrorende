/**
 * Small JSON store for the development web preview (`*.web.ts` variants only). It uses
 * `localStorage` under the `agrorende.web.` prefix; native builds never import this module.
 */
const PREFIX = "agrorende.web.";

export function readWebJson<T>(name: string): T | undefined {
  try {
    const raw = globalThis.localStorage?.getItem(PREFIX + name);
    return raw === null || raw === undefined ? undefined : (JSON.parse(raw) as T);
  } catch (_error) {
    return undefined;
  }
}

export function writeWebJson(name: string, value: unknown): void {
  globalThis.localStorage?.setItem(PREFIX + name, JSON.stringify(value));
}

export function listWebJson<T>(prefix: string): T[] {
  const storage = globalThis.localStorage;
  if (storage === undefined) return [];
  const values: T[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const name = storage.key(i);
    if (name === null || !name.startsWith(PREFIX + prefix)) continue;
    const value = readWebJson<T>(name.slice(PREFIX.length));
    if (value !== undefined) values.push(value);
  }
  return values;
}
