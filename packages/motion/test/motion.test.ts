import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { campoClaroPalette } from "@agrorende/design-tokens";
import { describe, expect, it } from "vitest";
import { buildAll, serialize } from "../src/animations/registry";
import { ANIMATION_IDS, animations, loadAnimation, motionMeta, type LottieJson } from "../src/index";
import { palette } from "../src/lottie/builder";

const lottieDir = join(import.meta.dirname, "..", "lottie");
const fresh = buildAll();

const expectedLoop: Record<string, boolean> = {
  welcome: false,
  "report-offline": true,
  "flow-loop": true,
  "machine-cost": true,
  "office-live": true,
  "invite-team": false,
  "first-machine": false,
  "first-work-order": false,
  signature: false,
  success: false,
  empty: true,
  "saved-on-phone": true,
  "rental-handover": false,
  loading: true,
};

const allowed = new Set(Object.values(palette).map((hex) => hex.toUpperCase()));

function toHex(rgba: readonly unknown[]): string {
  return `#${rgba
    .slice(0, 3)
    .map((c) => Math.round(Number(c) * 255).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

/** Collects every colour used by fills and strokes, static or animated. */
function colours(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const item of node) colours(item, out);
    return out;
  }
  if (typeof node !== "object" || node === null) return out;
  const record = node as Record<string, unknown>;
  if ((record.ty === "fl" || record.ty === "st") && typeof record.c === "object" && record.c !== null) {
    const c = record.c as { a: number; k: unknown };
    if (c.a === 0) {
      out.push(toHex(c.k as unknown[]));
    } else {
      for (const key of c.k as { s: unknown[] }[]) out.push(toHex(key.s));
    }
  }
  for (const value of Object.values(record)) colours(value, out);
  return out;
}

describe("palette", () => {
  it("matches the Campo claro design tokens", () => {
    expect(palette.mata600).toBe(campoClaroPalette["mata-600"]);
    expect(palette.mata700).toBe(campoClaroPalette["mata-700"]);
    expect(palette.mata400).toBe(campoClaroPalette["mata-400"]);
    expect(palette.terra600).toBe(campoClaroPalette["terra-600"]);
    expect(palette.graphite900).toBe(campoClaroPalette["graphite-900"]);
    expect(palette.graphite500).toBe(campoClaroPalette["graphite-500"]);
    expect(palette.graphite200).toBe(campoClaroPalette["graphite-200"]);
  });
});

describe.each(ANIMATION_IDS)("%s", (id) => {
  const file = join(lottieDir, `${id}.json`);
  const text = readFileSync(file, "utf8");
  const json = JSON.parse(text) as LottieJson;
  const meta = motionMeta[id];

  it("is committed exactly as a fresh, deterministic generation", () => {
    expect(text).toBe(serialize(fresh[id]));
    expect(serialize(buildAll()[id])).toBe(text);
    expect(animations[id]).toEqual(json);
  });

  it("has a valid basic Lottie schema", () => {
    expect(typeof json.v).toBe("string");
    expect(json.fr).toBe(30);
    expect(json.ip).toBe(0);
    expect(json.op).toBeGreaterThan(json.ip);
    expect(json.w).toBeGreaterThan(0);
    expect(json.h).toBeGreaterThan(0);
    expect(json.layers.length).toBeGreaterThan(0);
  });

  it("lasts between 2 and 5 seconds and matches its metadata", () => {
    const seconds = json.op / json.fr;
    expect(seconds).toBeGreaterThanOrEqual(2);
    expect(seconds).toBeLessThanOrEqual(5);
    expect(meta.id).toBe(id);
    expect(meta.width).toBe(json.w);
    expect(meta.height).toBe(json.h);
    expect(meta.durationMs).toBe(Math.round(seconds * 1000));
  });

  it("uses only Campo claro palette colours", () => {
    const used = colours(json.layers);
    expect(used.length).toBeGreaterThan(0);
    for (const colour of used) expect(allowed).toContain(colour);
  });

  it("stays under 40 KB", () => {
    expect(statSync(file).size).toBeLessThan(40 * 1024);
  });

  it("has a poster frame inside the animation", () => {
    expect(meta.posterFrame).toBeGreaterThanOrEqual(json.ip);
    expect(meta.posterFrame).toBeLessThan(json.op);
  });

  it("has the specified loop flag", () => {
    expect(meta.loop).toBe(expectedLoop[id]);
  });

  it("loads lazily to the same document", async () => {
    expect(await loadAnimation(id)).toEqual(json);
  });
});

describe("lazy entry (@agrorende/motion/lazy)", () => {
  it("never imports animation JSON statically, so web bundles split every file", () => {
    const source = readFileSync(join(import.meta.dirname, "..", "src", "lazy.ts"), "utf8");
    expect(source).not.toMatch(/^import\s+\w+\s+from\s+"[^"]+\.json";/mu);
    expect(source).not.toMatch(/from\s+"\.\/index/u);
  });

  it("is the same loader the package index re-exports", async () => {
    const lazy = await import("../src/lazy");
    expect(lazy.loadAnimation).toBe(loadAnimation);
    expect(lazy.motionMeta).toBe(motionMeta);
  });
});
