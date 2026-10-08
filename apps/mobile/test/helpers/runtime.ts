import { openUserDatabase } from "../../src/db/client";
import { createSyncRuntime, type SyncRuntime } from "../../src/sync/runtime";
import { createSyncStore } from "../../src/sync/store";
import { FakeServer } from "./fakeServer";
import { memoryHost } from "./nodeSqlite";

export const USER_ID = "01900000-0000-7000-8000-0000000000aa";
export const DEVICE_ID = "01900000-0000-7000-8000-0000000000dd";

let seq = 0;
export function testId(): string {
  seq += 1;
  return `01900000-0000-7000-8000-${seq.toString(16).padStart(12, "0")}`;
}

export interface TestRuntime {
  readonly runtime: SyncRuntime;
  readonly server: FakeServer;
  readonly clock: { now: () => number; set: (ms: number) => void; advance: (ms: number) => void };
}

export async function createTestRuntime(): Promise<TestRuntime> {
  const opened = await openUserDatabase({ userId: USER_ID, host: memoryHost() });
  const server = new FakeServer();
  let nowMs = Date.parse("2026-03-01T12:00:00.000Z");
  const clock = { now: () => nowMs, set: (ms: number) => (nowMs = ms), advance: (ms: number) => (nowMs += ms) };
  const runtime = createSyncRuntime({ db: opened.db, api: server, deviceId: DEVICE_ID, userId: USER_ID, store: createSyncStore(), clock, random: () => 0.5, newId: testId });
  return { runtime, server, clock };
}
