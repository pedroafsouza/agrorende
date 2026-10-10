// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Button } from "./Button";

afterEach(cleanup);

describe("Button pending", () => {
  it("is disabled, busy and shows an inline spinner while keeping its label", () => {
    render(
      <Button pending variant="primary">
        Save
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveProperty("disabled", true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.hasAttribute("data-pending")).toBe(true);
    expect(button.querySelectorAll("[data-testid=button-spinner]")).toHaveLength(1);
    // The label stays in the layout (invisible, still named) so the width does not change.
    expect(screen.getByText("Save").className).toContain("opacity-0");
  });

  it("swaps the icon for the spinner in the same box", () => {
    render(
      <Button icon={<svg data-testid="icon" />} pending>
        Save
      </Button>,
    );
    const icon = screen.getByTestId("icon");
    expect(icon.parentElement?.className).toContain("invisible");
    expect(icon.parentElement?.parentElement?.querySelector("[data-testid=button-spinner]")).not.toBeNull();
    expect(screen.getByText("Save").className).not.toContain("opacity-0");
  });

  it("renders normally when idle and keeps the busy alias working", () => {
    const { rerender } = render(<Button>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveProperty("disabled", false);
    expect(button.getAttribute("aria-busy")).toBe("false");
    expect(button.querySelector("[data-testid=button-spinner]")).toBeNull();
    rerender(<Button busy>Save</Button>);
    expect(button).toHaveProperty("disabled", true);
    expect(button.getAttribute("aria-busy")).toBe("true");
  });

  it("uses a still spinner under reduced motion", () => {
    render(<Button pending>Save</Button>);
    expect(screen.getByTestId("button-spinner").className).toContain("motion-reduce:animate-none");
  });
});
