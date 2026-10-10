import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/** The unicode ranges the Geist subsets in src/fonts were cut with (docs/LANDING.md). */
const RANGES: readonly [number, number][] = [
  [0x0000, 0x00ff],
  [0x0131, 0x0131],
  [0x0152, 0x0153],
  [0x02bb, 0x02bc],
  [0x02c6, 0x02c6],
  [0x02da, 0x02da],
  [0x02dc, 0x02dc],
  [0x0304, 0x0304],
  [0x0308, 0x0308],
  [0x0329, 0x0329],
  [0x2000, 0x206f],
  [0x20ac, 0x20ac],
  [0x2122, 0x2122],
  [0x2190, 0x2193],
  [0x2212, 0x2212],
  [0x2215, 0x2215],
  [0xfeff, 0xfeff],
  [0xfffd, 0xfffd],
];

function covered(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return RANGES.some(([from, to]) => code >= from && code <= to);
}

function files(dir: URL): URL[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(new URL(`${entry.name}/`, dir)) : [new URL(entry.name, dir)],
  );
}

describe("font subset", () => {
  it("covers every character of the site copy, the legal content and the error catalogue", () => {
    const sources = [
      ...files(new URL("../messages/", import.meta.url)),
      ...files(new URL("../content/", import.meta.url)),
      new URL("../../../packages/i18n/locales/pt-BR/errors.json", import.meta.url),
      new URL("../../../packages/i18n/locales/en/errors.json", import.meta.url),
    ];
    const missing = new Set<string>();
    for (const source of sources) for (const char of readFileSync(source, "utf8")) if (!covered(char)) missing.add(char);
    expect([...missing]).toEqual([]);
  });
});
