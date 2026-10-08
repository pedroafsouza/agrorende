import { statfsSync } from "node:fs";
import { Socket } from "node:net";
import { rootDir } from "./env.ts";
import { serviceOwnsPort } from "./docker.ts";

export async function portReachable(port: number, host = "127.0.0.1", timeoutMs = 1_000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket();
    let settled = false;
    const finish = (value: boolean): void => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve(value);
      }
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

export async function portFreeOrComposeOwned(port: number): Promise<{ readonly ok: boolean; readonly detail: string }> {
  const reachable = await portReachable(port);
  if (!reachable) {
    return { ok: true, detail: "free" };
  }
  if (await serviceOwnsPort(port)) {
    return { ok: true, detail: "used by docker compose" };
  }
  return { ok: false, detail: "in use by a non-compose process" };
}

export function freeDiskGb(): number {
  const stats = statfsSync(rootDir);
  return (stats.bavail * stats.bsize) / 1_000_000_000;
}

export async function fetchHealth(url: string, timeoutMs = 3_000): Promise<{ readonly ok: boolean; readonly detail: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return { ok: response.ok, detail: `${response.status} ${response.statusText}` };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : "unknown fetch error" };
  } finally {
    clearTimeout(timer);
  }
}
