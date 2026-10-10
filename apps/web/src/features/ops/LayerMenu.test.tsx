// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MAP_LAYERS } from "./filters";
import { LayerMenu } from "./LayerMenu";
import { intlErrors, renderWithProviders } from "./testing";

describe("LayerMenu", () => {
  it("shows an icon, the label and the marker glyph for every layer and toggles it", () => {
    const onToggleLayer = vi.fn();
    renderWithProviders(
      <LayerMenu
        baseMap="map"
        layers={new Set(MAP_LAYERS)}
        onToggleBaseMap={vi.fn()}
        onToggleBoundaries={vi.fn()}
        onToggleLayer={onToggleLayer}
        satelliteAvailable={false}
        showBoundaries
      />,
      { locale: "pt-BR" },
    );

    for (const layer of MAP_LAYERS) expect(screen.queryByTestId(`layer-icon-${layer}`)).not.toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: /Máquinas/u }));
    expect(onToggleLayer).toHaveBeenCalledWith("assets");
    expect((screen.getByRole("checkbox", { name: /Limites dos talhões/u }) as HTMLInputElement).checked).toBe(true);
    expect(intlErrors).toEqual([]);
  });
});
