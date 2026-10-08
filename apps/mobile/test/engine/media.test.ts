import type { MediaMeta } from "@agrorende/contracts/sync";

import { persistCapture, discardCapture } from "../../src/media/capture";
import { drainMediaQueue, listMediaFiles, mediaBackoffMs, MEDIA_BACKOFF_MAX_MS, pruneMediaFiles } from "../../src/media/queue";
import { canCapture, storageLevel } from "../../src/media/storage";
import { pushPendingMutations } from "../../src/sync/push";
import { registerMedia } from "../../src/sync/mutators/media";
import type { UploadUrlResponse } from "../../src/sync/transport";
import { TransportError } from "../../src/sync/transport";
import { FakeFiles } from "../helpers/fakeFiles";
import { createTestRuntime, testId } from "../helpers/runtime";

function meta(kind: string, overrides: Partial<MediaMeta> = {}): MediaMeta {
  return { id: testId(), kind, tag: "GENERAL", mimeType: kind === "VIDEO" ? "video/mp4" : "image/jpeg", capturedAt: "2026-03-01T11:00:00.000Z", parent: { type: "ASSET", id: testId() }, ...overrides };
}

function mediaApi(responses: (mediaId: string, variant: string) => UploadUrlResponse) {
  const calls: string[] = [];
  return {
    calls,
    api: {
      uploadUrl: async (mediaId: string, body: { variant: string }) => {
        calls.push(`url:${body.variant}`);
        return responses(mediaId, body.variant);
      },
      multipartParts: async (_id: string, body: { partNumbers: readonly number[] }) => {
        calls.push(`parts:${body.partNumbers.join(",")}`);
        return { parts: body.partNumbers.map((n) => ({ n, url: `https://api/parts/${n}` })) };
      },
      completeUpload: async (_id: string, body: { variant: string; parts?: readonly unknown[] }) => {
        calls.push(`complete:${body.variant}:${body.parts?.length ?? 0}`);
        return {};
      },
    },
  };
}

describe("media pipeline", () => {
  test("a capture waits for its parent command, then uploads thumbnail before original", async () => {
    const { runtime } = await createTestRuntime();
    const files = new FakeFiles();
    const m = meta("PHOTO");
    const captured = await persistCapture(runtime.db, files, { meta: m, sourceUri: files.add("file:///tmp/a.jpg", 500_000), thumbSourceUri: files.add("file:///tmp/a_t.jpg", 20_000) });
    expect(captured.meta.sizeBytes).toBe(500_000);
    expect((await listMediaFiles(runtime.db))[0]?.state).toBe("WAITING_PARENT");

    const { api, calls } = mediaApi(() => ({ mode: "single", url: "https://api/blob" }));
    const deps = { db: runtime.db, api, files, now: runtime.clock.now, isWifi: async () => true };
    expect((await drainMediaQueue(deps)).done).toBe(0);

    await registerMedia(captured.meta, { runtime });
    await pushPendingMutations(runtime);
    expect((await listMediaFiles(runtime.db))[0]?.state).toBe("QUEUED");

    expect((await drainMediaQueue(deps)).done).toBe(1);
    expect(calls).toEqual(["url:thumb", "complete:thumb:0", "url:original", "complete:original:0"]);
    const [row] = await listMediaFiles(runtime.db);
    expect(row?.state).toBe("DONE");
  });

  test("uploads follow priority: signature before photo before video, and videos wait for Wi-Fi", async () => {
    const { runtime } = await createTestRuntime();
    const files = new FakeFiles();
    const order: string[] = [];
    for (const kind of ["VIDEO", "PHOTO", "SIGNATURE"]) {
      const m = meta(kind);
      await persistCapture(runtime.db, files, { meta: m, sourceUri: files.add(`file:///tmp/${kind}`, 1000), wifiOnly: true });
      await runtime.db.run("UPDATE media_files SET state = 'QUEUED' WHERE mediaId = ?", [m.id]);
    }
    const { api } = mediaApi(() => ({ mode: "single", url: "https://api/blob" }));
    files.respond = (_url, uri) => {
      order.push(uri);
      return { status: 200, headers: {}, body: "" };
    };
    await drainMediaQueue({ db: runtime.db, api, files, now: runtime.clock.now, isWifi: async () => false });
    expect(order).toHaveLength(2);
    expect(order.some((u) => u.endsWith(".mp4"))).toBe(false);
    const rows = await listMediaFiles(runtime.db);
    expect(rows.map((r) => r.kind)).toEqual(["SIGNATURE", "PHOTO", "VIDEO"]);
    expect(rows.find((r) => r.kind === "VIDEO")?.state).toBe("QUEUED");
    expect(rows.filter((r) => r.state === "DONE").map((r) => r.kind).sort()).toEqual(["PHOTO", "SIGNATURE"]);
  });

  test("multipart uploads record part ETags and resume from the first missing part", async () => {
    const { runtime } = await createTestRuntime();
    const files = new FakeFiles();
    const m = meta("VIDEO");
    const size = 20 * 1024 * 1024;
    await persistCapture(runtime.db, files, { meta: m, sourceUri: files.add("file:///tmp/v.mp4", size) });
    await runtime.db.run("UPDATE media_files SET state = 'QUEUED' WHERE mediaId = ?", [m.id]);
    const partSize = 8 * 1024 * 1024;
    const { api, calls } = mediaApi(() => ({ mode: "multipart", uploadId: "up1", partSize, parts: [1, 2, 3].map((n) => ({ n, url: `https://api/parts/${n}` })) }));
    let failOn: string | undefined = "https://api/parts/2";
    files.respond = (url) => (url === failOn ? { status: 410, headers: {}, body: JSON.stringify({ error: { code: "UPLOAD_URL_EXPIRED" } }) } : { status: 200, headers: { etag: `"e${url.slice(-1)}"` }, body: "" });
    const deps = { db: runtime.db, api, files, now: runtime.clock.now, random: () => 0.5, isWifi: async () => true };
    expect((await drainMediaQueue(deps)).retried).toBe(1);
    let [row] = await listMediaFiles(runtime.db);
    expect(row?.state).toBe("QUEUED");
    expect(row?.uploadId).toBe("up1");
    expect(row?.progress.parts).toEqual([{ n: 1, etag: "e1" }]);

    failOn = undefined;
    runtime.clock.advance(60_000);
    expect((await drainMediaQueue(deps)).done).toBe(1);
    expect(calls).toContain("parts:2,3");
    expect(calls[calls.length - 1]).toBe("complete:original:3");
    [row] = await listMediaFiles(runtime.db);
    expect(row?.state).toBe("DONE");
    expect([...files.files.keys()].some((k) => k.includes("#"))).toBe(false);
  });

  test("terminal codes fail the row, other errors retry with capped backoff", async () => {
    const { runtime } = await createTestRuntime();
    const files = new FakeFiles();
    const m = meta("PHOTO");
    await persistCapture(runtime.db, files, { meta: m, sourceUri: files.add("file:///tmp/p.jpg", 10) });
    await runtime.db.run("UPDATE media_files SET state = 'QUEUED' WHERE mediaId = ?", [m.id]);
    const api = {
      uploadUrl: async (): Promise<UploadUrlResponse> => {
        throw new TransportError("http", { status: 413, code: "MEDIA_TOO_LARGE" });
      },
      multipartParts: async () => ({ parts: [] }),
      completeUpload: async () => ({}),
    };
    expect((await drainMediaQueue({ db: runtime.db, api, files, now: runtime.clock.now, isWifi: async () => true })).failed).toBe(1);
    expect((await listMediaFiles(runtime.db))[0]).toMatchObject({ state: "FAILED", progress: { error: "MEDIA_TOO_LARGE" } });
    expect(files.files.size).toBe(1);
    expect(mediaBackoffMs(1, () => 0.5)).toBe(5_000);
    expect(mediaBackoffMs(40, () => 0.5)).toBe(MEDIA_BACKOFF_MAX_MS);
  });

  test("storage guard, pruning and discarding an unsent capture", async () => {
    expect(storageLevel(5 * 1024 ** 3)).toBe("ok");
    expect(canCapture("VIDEO", 900 * 1024 ** 2)).toBe(false);
    expect(canCapture("PHOTO", 900 * 1024 ** 2)).toBe(true);
    expect(canCapture("PHOTO", 100 * 1024 ** 2)).toBe(false);

    const { runtime } = await createTestRuntime();
    const files = new FakeFiles();
    files.free = 100 * 1024 ** 2;
    await expect(persistCapture(runtime.db, files, { meta: meta("PHOTO"), sourceUri: files.add("file:///tmp/x", 1) })).rejects.toMatchObject({ code: "STORAGE_FULL" });
    files.free = 10 * 1024 ** 3;
    files.files.clear();

    const done = meta("PHOTO");
    await persistCapture(runtime.db, files, { meta: done, sourceUri: files.add("file:///tmp/d", 1) });
    await runtime.db.run("UPDATE media_files SET state = 'DONE', deleteAfter = ? WHERE mediaId = ?", ["2026-03-02T00:00:00.000Z", done.id]);
    expect(await pruneMediaFiles(runtime.db, files, runtime.clock.now(), files.free)).toBe(0);
    expect(await pruneMediaFiles(runtime.db, files, runtime.clock.now(), 500 * 1024 ** 2)).toBe(1);

    const draft = meta("PHOTO");
    await persistCapture(runtime.db, files, { meta: draft, sourceUri: files.add("file:///tmp/e", 1) });
    await discardCapture(runtime.db, files, draft.id);
    expect(await listMediaFiles(runtime.db)).toHaveLength(0);
    expect(files.files.size).toBe(0);
  });
});
