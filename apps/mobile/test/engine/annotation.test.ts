import type { MediaMeta } from "@agrorende/contracts/sync";

import { annotateCapture, arrowHead, pruneAnnotationOriginals, scaleShape, shapeFromDrag, shapeToSvgPath } from "../../src/components/MediaCapture/annotation";
import { persistCapture } from "../../src/media/capture";
import { listMediaFiles } from "../../src/media/queue";
import { FakeFiles } from "../helpers/fakeFiles";
import { createTestRuntime, testId } from "../helpers/runtime";

class AnnotFiles extends FakeFiles {
  async writeTemp(fileName: string, base64: string) {
    return this.add(`file:///cache/${fileName}`, base64.length);
  }
}

describe("FR-04 photo annotation", () => {
  it("turns drags into shapes and ignores stray taps", () => {
    expect(shapeFromDrag("circle", [{ x: 10, y: 10 }, { x: 11, y: 11 }])).toBeUndefined();
    expect(shapeFromDrag("circle", [{ x: 10, y: 10 }, { x: 40, y: 50 }])).toEqual({ tool: "circle", center: { x: 10, y: 10 }, radius: 50 });
    expect(shapeFromDrag("arrow", [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 100, y: 0 }])).toEqual({ tool: "arrow", from: { x: 0, y: 0 }, to: { x: 100, y: 0 } });
    expect(shapeFromDrag("freehand", [{ x: 0, y: 0 }])).toBeUndefined();
    expect(shapeFromDrag("freehand", [])).toBeUndefined();
  });

  it("draws arrow heads behind the tip and scales shapes to photo pixels", () => {
    const [left, right] = arrowHead({ x: 0, y: 0 }, { x: 100, y: 0 }, 20);
    expect(left.x).toBeLessThan(100);
    expect(right.x).toBeLessThan(100);
    expect(left.y).toBeCloseTo(-right.y);
    expect(scaleShape({ tool: "circle", center: { x: 10, y: 20 }, radius: 5 }, 4)).toEqual({ tool: "circle", center: { x: 40, y: 80 }, radius: 20 });
    expect(shapeToSvgPath({ tool: "freehand", points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] })).toBe("M 1 2 L 3 4");
    expect(shapeToSvgPath({ tool: "circle", center: { x: 50, y: 50 }, radius: 10 })).toContain("a 10 10");
  });

  it("uploads the flattened copy and keeps the original until the upload is done", async () => {
    const { runtime } = await createTestRuntime();
    const files = new AnnotFiles();
    const meta: MediaMeta = { id: testId(), kind: "PHOTO", tag: "GENERAL", mimeType: "image/jpeg", capturedAt: "2026-03-01T11:00:00.000Z", parent: { type: "FIELD_REPORT", id: testId() } };
    const captured = await persistCapture(runtime.db, files, { meta, sourceUri: files.add("file:///tmp/a.jpg", 500_000) });
    const draft = { ...captured.meta, localUri: captured.localUri };

    const annotated = await annotateCapture({ db: runtime.db, files }, draft, "x".repeat(4000));
    expect(annotated.localUri).toBe(`file:///doc/media/${meta.id}_annotated.jpg`);
    const row = (await listMediaFiles(runtime.db))[0];
    expect(row?.localUri).toBe(annotated.localUri);
    expect(await files.exists(captured.localUri)).toBe(true);

    expect(await pruneAnnotationOriginals(runtime.db, files)).toBe(0);
    await runtime.db.run("UPDATE media_files SET state = 'DONE' WHERE mediaId = ?", [meta.id]);
    expect(await pruneAnnotationOriginals(runtime.db, files)).toBe(1);
    expect(await files.exists(captured.localUri)).toBe(false);
    expect(await files.exists(annotated.localUri)).toBe(true);
  });

  it("refuses to annotate once the photo is already queued", async () => {
    const { runtime } = await createTestRuntime();
    const files = new AnnotFiles();
    const meta: MediaMeta = { id: testId(), kind: "PHOTO", tag: "GENERAL", mimeType: "image/jpeg", capturedAt: "2026-03-01T11:00:00.000Z", parent: { type: "FIELD_REPORT", id: testId() } };
    const captured = await persistCapture(runtime.db, files, { meta, sourceUri: files.add("file:///tmp/b.jpg", 1000) });
    await runtime.db.run("UPDATE media_files SET state = 'QUEUED' WHERE mediaId = ?", [meta.id]);
    await expect(annotateCapture({ db: runtime.db, files }, { ...captured.meta, localUri: captured.localUri }, "abc")).rejects.toMatchObject({ code: "MEDIA_CAPTURE_FAILED" });
  });
});
