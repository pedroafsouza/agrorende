import { readFileSync } from "node:fs";

import { campoClaroPalette } from "@agrorende/design-tokens";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

function cssVar(name: string): string | undefined {
  return new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`, "u").exec(css)?.[1]?.toLowerCase();
}

describe("Campo claro palette (ARCHITECTURE §3.7)", () => {
  it("mirrors campoClaroPalette exactly", () => {
    const flat: Record<string, string> = {
      "mata-400": campoClaroPalette["mata-400"],
      "mata-600": campoClaroPalette["mata-600"],
      "mata-700": campoClaroPalette["mata-700"],
      "mata-800": campoClaroPalette["mata-800"],
      "terra-600": campoClaroPalette["terra-600"],
      "terra-700": campoClaroPalette["terra-700"],
      "graphite-950": campoClaroPalette["graphite-950"],
      "graphite-900": campoClaroPalette["graphite-900"],
      "graphite-700": campoClaroPalette["graphite-700"],
      "graphite-500": campoClaroPalette["graphite-500"],
      "graphite-200": campoClaroPalette["graphite-200"],
      "graphite-100": campoClaroPalette["graphite-100"],
      "graphite-50": campoClaroPalette["graphite-50"],
      "warning-text": campoClaroPalette.warning.text,
      "warning-fill": campoClaroPalette.warning.fill,
      "danger-light": campoClaroPalette.danger.light,
      "danger-dark": campoClaroPalette.danger.dark,
      "info-light": campoClaroPalette.info.light,
      "info-dark": campoClaroPalette.info.dark,
    };
    for (const [name, value] of Object.entries(flat)) expect(cssVar(name), name).toBe(value.toLowerCase());
  });

  it("uses no colour outside the palette, white and black", () => {
    const allowed = new Set([
      ...[...css.matchAll(/--[a-z0-9-]+:\s*(#[0-9a-fA-F]{6})/gu)].map((match) => match[1]?.toLowerCase()),
      "#ffffff",
      "#000000",
    ]);
    const used = [...css.matchAll(/#[0-9a-fA-F]{6}\b/gu)].map((match) => match[0].toLowerCase());
    for (const colour of used) expect(allowed.has(colour), colour).toBe(true);
  });
});
