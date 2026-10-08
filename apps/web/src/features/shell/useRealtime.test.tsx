// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RealtimeServerEvents } from "@agrorende/contracts/realtime";

import { dispatchRealtimeEvent, useRealtimeEvent, useRealtimeStatus } from "./useRealtime";

describe("shared realtime subscriptions (T09-002)", () => {
  it("delivers events to subscribers and stops after unmount", () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useRealtimeEvent(RealtimeServerEvents.activityNew, handler));
    dispatchRealtimeEvent(RealtimeServerEvents.activityNew, { id: "a1" });
    expect(handler).toHaveBeenCalledWith({ id: "a1" });
    unmount();
    dispatchRealtimeEvent(RealtimeServerEvents.activityNew, { id: "a2" });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("records the last message time in the status", () => {
    const { result } = renderHook(() => useRealtimeStatus());
    act(() => dispatchRealtimeEvent(RealtimeServerEvents.notificationNew, {}));
    expect(result.current.lastMessageAt).toBeInstanceOf(Date);
  });
});
