import { describe, expect, it } from "vitest";

import { RealtimeClientEvents, RealtimeServerEvents } from "@agrorende/contracts/realtime";

const expectedClientEvents = ["location:batch", "presence:ping"] as const;
const expectedServerEvents = [
  "operator:location",
  "operator:presence",
  "entity:changed",
  "activity:new",
  "org:status",
  "notification:new",
  "sync:poke",
] as const;

describe("realtime event names", () => {
  it("matches the contracts module", () => {
    expect(Object.values(RealtimeClientEvents)).toEqual([...expectedClientEvents]);
    expect(Object.values(RealtimeServerEvents)).toEqual([...expectedServerEvents]);
  });
});
