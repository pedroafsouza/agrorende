// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { campoClaroPalette } from "@agrorende/design-tokens";

import { addAllMapPins, addMapPin, glyphMarkup, isMapPinId, LegendMark, MAP_PINS, MapPinGlyph, pinSvg } from "./mapPins";

function fakeMap() {
  const images = new Set<string>();
  return {
    images,
    hasImage: (id: string) => images.has(id),
    addImage: vi.fn((id: string) => {
      images.add(id);
    }),
  };
}

function stubCanvas() {
  const context = { scale: vi.fn(), drawImage: vi.fn(), getImageData: vi.fn(() => ({ width: 80, height: 96, data: new Uint8ClampedArray(4) })) };
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
  return { getContext, context };
}

// jsdom images never load, so decoding resolves at once.
beforeEach(() => {
  HTMLImageElement.prototype.decode = () => Promise.resolve();
});
afterEach(() => vi.restoreAllMocks());

describe("map pins", () => {
  it("knows every image id the layers use", () => {
    for (const id of ["report", "report-critical", "wo-ok", "wo-risk", "wo-breached", "asset", "asset-rented", "rental", "rental-overdue"]) {
      expect(isMapPinId(id)).toBe(true);
    }
    expect(isMapPinId("toString")).toBe(false);
    expect(isMapPinId("square")).toBe(false);
  });

  it("builds a pin SVG with the tone fill, a white outline and the lucide glyph", () => {
    const svg = pinSvg(MAP_PINS["wo-breached"]);
    expect(svg).toContain(`fill="${campoClaroPalette.danger.light}"`);
    expect(svg).toContain('stroke="#FFFFFF"');
    expect(svg).toContain("lucide-wrench");
    expect(svg.match(/<svg/gu)).toHaveLength(2);
  });

  it("uses a dark glyph on the yellow warning pin for contrast", () => {
    expect(pinSvg(MAP_PINS["wo-risk"])).toContain(`color="${campoClaroPalette.warning.onFill}"`);
    expect(pinSvg(MAP_PINS["wo-ok"])).toContain('color="#FFFFFF"');
  });

  it("caches the glyph markup per icon", () => {
    expect(glyphMarkup(MAP_PINS.asset.icon)).toBe(glyphMarkup(MAP_PINS["asset-rented"].icon));
  });

  it("rasterises at 2x and registers each pin once, even when requested concurrently", async () => {
    const { context } = stubCanvas();
    const map = fakeMap();
    await Promise.all([addMapPin(map, "rental"), addMapPin(map, "rental")]);
    await addMapPin(map, "rental");
    expect(map.addImage).toHaveBeenCalledTimes(1);
    expect(map.addImage).toHaveBeenCalledWith("rental", expect.anything(), { pixelRatio: 2 });
    expect(context.scale).toHaveBeenCalledWith(2, 2);
  });

  it("adds every pin", async () => {
    stubCanvas();
    const map = fakeMap();
    await addAllMapPins(map);
    expect([...map.images].sort()).toEqual(Object.keys(MAP_PINS).sort());
  });

  it("skips quietly when the canvas has no 2D context", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const map = fakeMap();
    await addMapPin(map, "asset");
    expect(map.addImage).not.toHaveBeenCalled();
  });

  it("draws the same pin inline for the legend and falls back to the text glyph", () => {
    const { container } = render(
      <>
        <MapPinGlyph id="report-critical" />
        <LegendMark fallback="◯" item="operators" />
        <LegendMark fallback="■" item="workOrders" />
      </>,
    );
    expect(container.querySelector('[data-pin="report-critical"] path')?.getAttribute("fill")).toBe(campoClaroPalette.danger.light);
    expect(container.querySelector('[data-pin="wo-ok"]')).not.toBeNull();
    expect(container.textContent).toContain("◯");
    expect(container.textContent).not.toContain("■");
  });
});
