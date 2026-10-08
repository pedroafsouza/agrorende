import { countUnsentFixes, flushViaRest, flushViaSocket, maintainLocationBuffer, recordFix } from "../../src/location/buffer";
import { hasLocationConsent, recordLocationConsent, shouldTrack } from "../../src/location/consent";
import { createTestRuntime } from "../helpers/runtime";

const base = Date.parse("2026-03-01T12:00:00.000Z");
const at = (ms: number) => new Date(ms).toISOString();

describe("location buffer", () => {
  test("socket flush marks fixes sent only after the ack", async () => {
    const { runtime } = await createTestRuntime();
    for (let i = 0; i < 60; i += 1) await recordFix(runtime.db, { recordedAt: at(base + i * 1000), lat: -23, lng: -46 });
    expect(await flushViaSocket(runtime.db, async () => false, at(base))).toBe(0);
    expect(await countUnsentFixes(runtime.db)).toBe(60);
    const emit = jest.fn(async () => true);
    expect(await flushViaSocket(runtime.db, emit, at(base))).toBe(50);
    expect(emit.mock.calls[0]?.[0]).toHaveLength(50);
    expect(await countUnsentFixes(runtime.db)).toBe(10);
  });

  test("REST fallback sends everything in batches of 500", async () => {
    const { runtime, server } = await createTestRuntime();
    for (let i = 0; i < 700; i += 1) await recordFix(runtime.db, { recordedAt: at(base + i * 1000), lat: -23, lng: -46, accuracyM: 5 });
    expect(await flushViaRest(runtime.db, server, runtime.deviceId, at(base))).toBe(700);
    expect(server.locations).toHaveLength(700);
    expect(server.locations[0]).toEqual({ recordedAt: at(base), lat: -23, lng: -46, accuracyM: 5 });
  });

  test("the cap thins old points but never the last 48 hours", async () => {
    const { runtime } = await createTestRuntime();
    const now = base;
    for (let i = 0; i < 40; i += 1) await recordFix(runtime.db, { recordedAt: at(now - 72 * 3600_000 + i * 30_000), lat: 0, lng: 0 });
    for (let i = 0; i < 10; i += 1) await recordFix(runtime.db, { recordedAt: at(now - i * 1000), lat: 0, lng: 0 });
    await maintainLocationBuffer(runtime.db, now, 20);
    const rows = await runtime.db.all<{ recordedAt: string }>("SELECT recordedAt FROM location_buffer");
    expect(rows.filter((r) => Date.parse(r.recordedAt) > now - 48 * 3600_000)).toHaveLength(10);
    expect(rows.length).toBe(10 + 4);
  });

  test("tracking needs consent and ON_DUTY", async () => {
    const { runtime } = await createTestRuntime();
    expect(await hasLocationConsent(runtime.db)).toBe(false);
    await recordLocationConsent(runtime.db, at(base));
    expect(await hasLocationConsent(runtime.db)).toBe(true);
    expect(shouldTrack({ dutyStatus: "ON_DUTY", consent: true, signedIn: true })).toBe(true);
    expect(shouldTrack({ dutyStatus: "OFF_DUTY", consent: true, signedIn: true })).toBe(false);
    expect(shouldTrack({ dutyStatus: "ON_DUTY", consent: false, signedIn: true })).toBe(false);
  });
});
