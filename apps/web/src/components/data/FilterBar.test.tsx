// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { intlErrors, renderWithProviders } from "@/features/ops/testing";

import { FilterBar, FilterSearch } from "./FilterBar";

beforeEach(() => {
  intlErrors.length = 0;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function box(): HTMLInputElement {
  return screen.getByLabelText("Search") as HTMLInputElement;
}

function type(text: string): void {
  fireEvent.change(box(), { target: { value: text } });
}

function wait(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("FilterBar", () => {
  it("keeps the clear button mounted but hidden and out of the tab order while no filter is active", () => {
    renderWithProviders(<FilterBar active={false} count={undefined} onClear={vi.fn()} />);
    const clear = screen.getByTestId("filter-bar-clear");
    expect(clear.className).toContain("invisible");
    expect(clear.getAttribute("aria-hidden")).toBe("true");
    expect(clear.tabIndex).toBe(-1);
    expect(screen.getByTestId("filter-bar-count").className).toContain("invisible");
  });

  it("shows the clear button and the count once filters apply", () => {
    const onClear = vi.fn();
    renderWithProviders(<FilterBar active count={50} hasMore onClear={onClear} />);
    const clear = screen.getByTestId("filter-bar-clear");
    expect(clear.className).not.toContain("invisible");
    expect(clear.tabIndex).toBe(0);
    fireEvent.click(clear);
    expect(onClear).toHaveBeenCalledOnce();
    expect(screen.getByTestId("filter-bar-count").textContent).toBe("50+ results");
  });

  it.each([
    [0, "No results"],
    [1, "1 result"],
    [3, "3 results"],
  ])("counts %i rows in English", (count, text) => {
    renderWithProviders(<FilterBar active={false} count={count} onClear={vi.fn()} />);
    expect(screen.getByTestId("filter-bar-count").textContent).toBe(text);
    expect(intlErrors).toEqual([]);
  });

  it.each([
    [0, false, "Nenhum resultado"],
    [1, false, "1 resultado"],
    [3, false, "3 resultados"],
    [50, true, "50+ resultados"],
  ])("counts %i rows in pt-BR (more pages: %s)", (count, hasMore, text) => {
    renderWithProviders(<FilterBar active={false} count={count} hasMore={hasMore} onClear={vi.fn()} />, { locale: "pt-BR" });
    expect(screen.getByTestId("filter-bar-count").textContent).toBe(text);
    expect(intlErrors).toEqual([]);
  });

  it("derives the count and the 'more' marker from a list page", () => {
    const { rerender } = renderWithProviders(<FilterBar active={false} onClear={vi.fn()} page={{ items: [1, 2, 3], nextCursor: "next" }} />);
    expect(screen.getByTestId("filter-bar-count").textContent).toBe("3+ results");
    rerender(<FilterBar active={false} onClear={vi.fn()} page={{ items: [1, 2, 3], nextCursor: null }} />);
    expect(screen.getByTestId("filter-bar-count").textContent).toBe("3 results");
    rerender(<FilterBar active={false} onClear={vi.fn()} page={{ items: [1] }} />);
    expect(screen.getByTestId("filter-bar-count").textContent).toBe("1 result");
    rerender(<FilterBar active={false} onClear={vi.fn()} page={undefined} />);
    expect(screen.getByTestId("filter-bar-count").className).toContain("invisible");
  });

  it("hides the counter with showCount=false but keeps the clear button", () => {
    renderWithProviders(<FilterBar active count={3} onClear={vi.fn()} showCount={false} />);
    expect(screen.queryByTestId("filter-bar-count")).toBeNull();
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeTruthy();
  });
});

describe("FilterSearch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("reports the search once typing pauses", () => {
    const onSearch = vi.fn();
    renderWithProviders(<FilterSearch aria-label="Search" onSearch={onSearch} value="" />);
    type("t");
    type("tr");
    expect(onSearch).not.toHaveBeenCalled();
    wait(300);
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("tr");
  });

  it("restarts the pause on every keystroke", () => {
    const onSearch = vi.fn();
    renderWithProviders(<FilterSearch aria-label="Search" onSearch={onSearch} value="" />);
    type("t");
    wait(200);
    type("tr");
    wait(200);
    expect(onSearch).not.toHaveBeenCalled();
    wait(100);
    expect(onSearch).toHaveBeenCalledOnce();
    expect(onSearch).toHaveBeenCalledWith("tr");
  });

  it("reports null when the box is cleared", () => {
    const onSearch = vi.fn();
    renderWithProviders(<FilterSearch aria-label="Search" onSearch={onSearch} value="trator" />);
    type("");
    wait(300);
    expect(onSearch).toHaveBeenCalledWith(null);
  });

  it("trims the search and ignores whitespace-only changes", () => {
    const onSearch = vi.fn();
    renderWithProviders(<FilterSearch aria-label="Search" onSearch={onSearch} value="" />);
    type("   ");
    wait(300);
    expect(onSearch).not.toHaveBeenCalled();
    type("  tr ");
    wait(300);
    expect(onSearch).toHaveBeenCalledExactlyOnceWith("tr");
  });

  it("does not let a late URL echo overwrite newer typing", () => {
    const onSearch = vi.fn();
    const { rerender } = renderWithProviders(<FilterSearch aria-label="Search" onSearch={onSearch} value="" />);
    type("t");
    wait(300);
    type("tr");
    wait(300);
    type("tra");
    // The URL now catches up with the first search, then the second, while "tra" is still pending.
    rerender(<FilterSearch aria-label="Search" onSearch={onSearch} value="t" />);
    expect(box().value).toBe("tra");
    rerender(<FilterSearch aria-label="Search" onSearch={onSearch} value="tr" />);
    expect(box().value).toBe("tra");
    wait(300);
    expect(onSearch.mock.calls).toEqual([["t"], ["tr"], ["tra"]]);
  });

  it("adopts an outside change such as clearing the filters and drops the pending search", () => {
    const onSearch = vi.fn();
    const { rerender } = renderWithProviders(<FilterSearch aria-label="Search" onSearch={onSearch} value="trator" />);
    expect(box().value).toBe("trator");
    type("trat");
    rerender(<FilterSearch aria-label="Search" onSearch={onSearch} value="" />);
    expect(box().value).toBe("");
    wait(300);
    expect(onSearch).not.toHaveBeenCalled();
  });

  it("sends the pending search at once on Enter and on blur", () => {
    const onSearch = vi.fn();
    renderWithProviders(<FilterSearch aria-label="Search" onSearch={onSearch} value="" />);
    type("tr");
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(onSearch).toHaveBeenCalledExactlyOnceWith("tr");
    type("trator");
    fireEvent.blur(box());
    expect(onSearch).toHaveBeenLastCalledWith("trator");
    wait(300);
    expect(onSearch).toHaveBeenCalledTimes(2);
  });

  it("drops the pending search on unmount and never calls back afterwards", () => {
    const onSearch = vi.fn();
    const { unmount } = renderWithProviders(<FilterSearch aria-label="Search" onSearch={onSearch} value="" />);
    type("tr");
    unmount();
    wait(1_000);
    expect(onSearch).not.toHaveBeenCalled();
  });

  it("calls the latest onSearch passed in", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderWithProviders(<FilterSearch aria-label="Search" onSearch={first} value="" />);
    type("tr");
    rerender(<FilterSearch aria-label="Search" onSearch={second} value="" />);
    wait(300);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledExactlyOnceWith("tr");
  });
});
