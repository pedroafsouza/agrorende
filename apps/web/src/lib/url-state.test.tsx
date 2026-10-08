// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { mergeSearch, readUrlState, useUrlState } from "./url-state";

const navigation = vi.hoisted(() => ({ replace: vi.fn(), search: "status=ACTIVE&cursor=abc" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace }),
  usePathname: () => "/assets",
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

describe("DataTable URL state", () => {
  beforeEach(() => {
    navigation.replace.mockClear();
    navigation.search = "status=ACTIVE&cursor=abc";
  });

  it("merges a patch, drops empty values and resets the cursor when a filter changes", () => {
    expect(mergeSearch("status=ACTIVE&cursor=abc&q=trator", { status: "RETIRED", q: "" })).toBe("status=RETIRED");
    expect(mergeSearch("status=ACTIVE", { cursor: "next" })).toBe("status=ACTIVE&cursor=next");
  });

  it("reads keys with defaults", () => {
    expect(readUrlState(new URLSearchParams("q=x"), ["q", "status"] as const, { status: "ACTIVE" })).toEqual({ q: "x", status: "ACTIVE" });
  });

  it("useUrlState exposes the URL filters and replaces the URL on change", () => {
    const keys = ["status", "q"] as const;
    const { result } = renderHook(() => useUrlState(keys));
    expect(result.current[0]).toEqual({ status: "ACTIVE", q: "" });

    act(() => {
      result.current[1]({ q: "trator" });
    });
    expect(navigation.replace).toHaveBeenCalledWith("/assets?status=ACTIVE&q=trator", { scroll: false });

    act(() => {
      result.current[1]({ status: null });
    });
    expect(navigation.replace).toHaveBeenLastCalledWith("/assets", { scroll: false });
  });
});
