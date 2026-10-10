import { captureToDraft, type CaptureDeps } from "../../src/components/MediaCapture/drafts";
import { persistCapture } from "../../src/media/capture";
import { drainMediaQueue, listMediaFiles, PREVIEW_MAX_BYTES } from "../../src/media/queue";
import type { UploadUrlResponse } from "../../src/sync/transport";
import { FakeFiles } from "../helpers/fakeFiles";
import { createTestRuntime, testId } from "../helpers/runtime";

const parent = { type: "FIELD_REPORT", id: "018fd000-0000-7000-8000-0000000003fb" } as const;

function mediaApi() {
  const calls: string[] = [];
  return {
    calls,
    api: {
      uploadUrl: async (_mediaId: string, body: { variant: string }): Promise<UploadUrlResponse> => {
        calls.push(`url:${body.variant}`);
        return { mode: "single", url: `https://api/blob/${body.variant}` };
      },
      multipartParts: async () => ({ parts: [] }),
      completeUpload: async (_id: string, body: { variant: string }) => {
        calls.push(`complete:${body.variant}`);
        return {};
      },
    },
  };
}

async function setup() {
  const { runtime } = await createTestRuntime();
  const files = new FakeFiles();
  const base: CaptureDeps = { db: runtime.db, files, newId: testId, now: runtime.clock.now };
  return { runtime, files, base };
}

describe("capture previews (ARCHITECTURE §7.7 step 2)", () => {
  test("a photo is resized and its 320 px thumbnail is stored and uploaded before the original", async () => {
    const { runtime, files, base } = await setup();
    files.add("file:///cache/camera.jpg", 4_000_000);
    const preparePhoto = jest.fn(async (uri: string) => ({ uri: files.add(`${uri}.2048.jpg`, 600_000), thumbUri: files.add(`${uri}.thumb.jpg`, 18_000), width: 2048, height: 1536 }));
    const draft = await captureToDraft({ ...base, preparePhoto }, parent, { kind: "PHOTO", tag: "GENERAL", mimeType: "image/heic", sourceUri: "file:///cache/camera.jpg", width: 4032, height: 3024 });

    expect(preparePhoto).toHaveBeenCalledWith("file:///cache/camera.jpg", 4032, 3024);
    expect(draft.thumbUri).toBe(`file:///doc/media/${draft.id}_thumb.jpg`);
    expect(draft.mimeType).toBe("image/jpeg");
    expect(draft.sizeBytes).toBe(600_000);
    expect(draft.width).toBe(2048);

    await runtime.db.run("UPDATE media_files SET state = 'QUEUED' WHERE mediaId = ?", [draft.id]);
    const { api, calls } = mediaApi();
    expect((await drainMediaQueue({ db: runtime.db, api, files, now: runtime.clock.now, isWifi: async () => true })).done).toBe(1);
    expect(calls).toEqual(["url:thumb", "complete:thumb", "url:original", "complete:original"]);
  });

  test("a video gets its poster frame uploaded as the poster variant", async () => {
    const { runtime, files, base } = await setup();
    files.add("file:///cache/clip.mp4", 3_000_000);
    const prepareVideoPoster = jest.fn(async () => files.add("file:///cache/clip.poster.jpg", 25_000));
    const draft = await captureToDraft({ ...base, prepareVideoPoster }, parent, { kind: "VIDEO", tag: "GENERAL", mimeType: "video/mp4", sourceUri: "file:///cache/clip.mp4", durationMs: 4000 });
    expect(draft.thumbUri).toBeDefined();

    await runtime.db.run("UPDATE media_files SET state = 'QUEUED' WHERE mediaId = ?", [draft.id]);
    const { api, calls } = mediaApi();
    await drainMediaQueue({ db: runtime.db, api, files, now: runtime.clock.now, isWifi: async () => true });
    expect(calls.slice(0, 2)).toEqual(["url:poster", "complete:poster"]);
  });

  test("a failed preview never loses the capture: the original is kept without a thumbnail", async () => {
    const { files, base } = await setup();
    files.add("file:///cache/camera.jpg", 900_000);
    const preparePhoto = jest.fn(async () => {
      throw new Error("manipulator unavailable");
    });
    const draft = await captureToDraft({ ...base, preparePhoto }, parent, { kind: "PHOTO", tag: "GENERAL", mimeType: "image/jpeg", sourceUri: "file:///cache/camera.jpg" });
    expect(draft.thumbUri).toBeUndefined();
    expect(draft.sizeBytes).toBe(900_000);
  });

  test("signatures are stored as captured", async () => {
    const { files, base } = await setup();
    files.add("file:///cache/sig.png", 4_000);
    const preparePhoto = jest.fn();
    const draft = await captureToDraft({ ...base, preparePhoto }, parent, { kind: "SIGNATURE", tag: "SIGNATURE", mimeType: "image/png", sourceUri: "file:///cache/sig.png" });
    expect(preparePhoto).not.toHaveBeenCalled();
    expect(draft.mimeType).toBe("image/png");
  });

  test("an oversized preview is skipped instead of failing the whole upload", async () => {
    const { runtime, files } = await setup();
    const id = testId();
    await persistCapture(runtime.db, files, {
      meta: { id, kind: "PHOTO", tag: "GENERAL", mimeType: "image/jpeg", capturedAt: "2026-03-01T11:00:00.000Z", parent },
      sourceUri: files.add("file:///cache/annotated.jpg", 3_000_000),
      thumbSourceUri: files.add("file:///cache/annotated-copy.jpg", PREVIEW_MAX_BYTES + 1),
    });
    await runtime.db.run("UPDATE media_files SET state = 'QUEUED' WHERE mediaId = ?", [id]);
    const { api, calls } = mediaApi();
    expect((await drainMediaQueue({ db: runtime.db, api, files, now: runtime.clock.now, isWifi: async () => true })).done).toBe(1);
    expect(calls).toEqual(["url:original", "complete:original"]);
    expect((await listMediaFiles(runtime.db))[0]?.state).toBe("DONE");
  });
});
