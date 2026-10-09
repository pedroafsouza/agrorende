import type { AppErrorCode } from "@agrorende/contracts/errors";
import { describe, expect, it } from "vitest";

import { countUnsentFixes, LOCATION_BUFFER_CAP, LOCATION_RECENT_KEEP_MS } from "../../../src/location/buffer";
import { syncAttention, type AttentionInput } from "../../../src/sync/attention";
import { setDuty } from "../../../src/sync/mutators/user";
import type { ChaosDevice } from "./device";
import { createOfflineReport, DAY_MS, PHOTO } from "./scenario";
import { useChaosSuite } from "./suite";

const suite = useChaosSuite();
const at = { lat: -15.79, lng: -47.88 };
const FIX_EVERY_MS = 12_000;
const WEEK_FIXES = (7 * DAY_MS) / FIX_EVERY_MS;

async function attentionCodes(device: ChaosDevice, extra: Partial<AttentionInput> = {}): Promise<AppErrorCode[]> {
  const items = await syncAttention(device.sqlDb, { nowMs: device.clock.now(), snapshot: device.store.getState(), wifi: device.files.wifi, ...extra });
  return items.map((item) => item.code);
}

/** One fix every 12 s for a day, as the background location task would buffer them. */
async function bufferDay(device: ChaosDevice, dayStartMs: number): Promise<void> {
  await device.sqlDb.transaction(async (tx) => {
    for (let t = dayStartMs; t < dayStartMs + DAY_MS; t += FIX_EVERY_MS) {
      await tx.run("INSERT INTO location_buffer (recordedAt, lat, lng, accuracyM) VALUES (?, ?, ?, 10)", [new Date(t).toISOString(), -15.79 + (t % 1000) / 1e6, -47.88]);
    }
  });
}

describe("T12.12 endurance: 7 days on duty offline", () => {
  it("caps and thins the 50,000-point buffer, flags stale media and device, survives a kill mid-upload and drains everything once", async () => {
    const device = await suite.device("week");
    const server = suite.server();
    await setDuty({ status: "ON_DUTY", consent: true }, { runtime: device.rt, ...at });
    expect((await device.syncUntilIdle()).ok).toBe(true);

    device.online = false;
    const weekStart = device.clock.now();
    const reports: string[] = [];
    for (let day = 0; day < 7; day += 1) {
      const evidence = day === 0 ? [{ kind: "VIDEO" as const, sizeBytes: 20 * 1000 * 1000 }] : day % 2 === 0 ? [PHOTO] : [];
      reports.push((await createOfflineReport(device, evidence, `Dia ${day + 1} no campo`)).id);
      await bufferDay(device, weekStart + day * DAY_MS);
      device.clock.advance(DAY_MS);
    }
    expect(await device.count("SELECT COUNT(*) AS n FROM location_buffer")).toBe(WEEK_FIXES);
    expect(WEEK_FIXES).toBeGreaterThan(LOCATION_BUFFER_CAP);

    const offlineCodes = await attentionCodes(device);
    expect(offlineCodes).toContain("DEVICE_UNSYNCED_STALE");
    // Attachments wait for their parents; only the device-level card shows while nothing can be sent.
    expect(offlineCodes).not.toContain("MEDIA_PENDING_STALE");

    // Back in coverage: the first cycle is cut while the video is mid-way, then the app is killed.
    device.online = true;
    server.inject({ kind: "network", match: /^PUT \/media\/[^/]+\/blob\/parts\/2$/, times: 1 });
    await device.sync();
    const trimmed = device.store.getState().locationTrimmed;
    expect(trimmed).toBeGreaterThan(0);
    const afterCut = await attentionCodes(device);
    expect(afterCut).toContain("LOCATION_BUFFER_TRIMMED");
    // The parents are applied, the week-old video is still not on the server (EC-SYN-27).
    expect(afterCut).toContain("MEDIA_PENDING_STALE");
    expect(await device.count("SELECT COUNT(*) AS n FROM location_buffer")).toBeLessThanOrEqual(LOCATION_BUFFER_CAP);
    const recentCutoff = new Date(device.clock.now() - LOCATION_RECENT_KEEP_MS).toISOString();
    expect(await device.count("SELECT COUNT(*) AS n FROM location_buffer WHERE recordedAt >= ?", [recentCutoff])).toBeGreaterThanOrEqual((2 * DAY_MS) / FIX_EVERY_MS - 5);

    await device.kill();
    await device.restart();
    expect(await attentionCodes(device, { coldStart: true })).toContain("UPLOAD_RESUME_AFTER_RESTART");

    const pendingFixes = await countUnsentFixes(device.sqlDb);
    const batchesBefore = server.log.filter((entry) => entry.key === "POST /locations/batch" && entry.status === 200).length;
    expect((await device.syncUntilIdle()).ok).toBe(true);
    for (let i = 0; i < 20 && (await countUnsentFixes(device.sqlDb)) > 0; i += 1) await device.sync();
    expect(await countUnsentFixes(device.sqlDb)).toBe(0);
    // The server judges fixes against its own wall clock, so the simulated week is accepted
    // or dropped there; the device's duty is to deliver every batch once with a 200.
    const batches = server.log.filter((entry) => entry.key === "POST /locations/batch" && entry.status === 200);
    expect(batches.length - batchesBefore).toBe(Math.ceil(pendingFixes / 500));

    for (const id of reports) expect(await server.seeded.raw("field_reports").countDocuments({ _id: id })).toBe(1);
    expect(await device.count("SELECT COUNT(*) AS n FROM outbox")).toBe(0);
    expect(await device.count("SELECT COUNT(*) AS n FROM media_files WHERE state <> 'DONE'")).toBe(0);
    const media = await device.count("SELECT COUNT(*) AS n FROM media_files");
    expect(await server.seeded.raw("media").countDocuments({ uploadedAt: { $ne: null }, _id: { $in: (await device.sqlDb.all<{ mediaId: string }>("SELECT mediaId FROM media_files")).map((row) => row.mediaId) } })).toBe(media);
    const codes = await attentionCodes(device);
    expect(codes).not.toContain("DEVICE_UNSYNCED_STALE");
    expect(codes).not.toContain("MEDIA_PENDING_STALE");
  }, 120_000);
});
