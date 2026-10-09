import type { SqlDb } from "../../db/sql";
import { LocalError } from "../../lib/errors";
import type { FileStore } from "../../media/files";
import type { MediaDraft } from "./drafts";

/** FR-04 tools: a circle around the problem, an arrow pointing at it, or a free line. */
export type AnnotationTool = "circle" | "arrow" | "freehand";

export interface Point {
  readonly x: number;
  readonly y: number;
}

export type AnnotationShape =
  | { readonly tool: "circle"; readonly center: Point; readonly radius: number }
  | { readonly tool: "arrow"; readonly from: Point; readonly to: Point }
  | { readonly tool: "freehand"; readonly points: readonly Point[] };

/** Drags shorter than this many points are taps, not marks. */
export const MIN_MARK_LENGTH = 8;

/** Turns one drag (all touch points, first to last) into a shape, or undefined for a stray tap. */
export function shapeFromDrag(tool: AnnotationTool, points: readonly Point[]): AnnotationShape | undefined {
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined) return undefined;
  const length = Math.hypot(last.x - first.x, last.y - first.y);
  if (tool === "circle") return length < MIN_MARK_LENGTH ? undefined : { tool, center: first, radius: length };
  if (tool === "arrow") return length < MIN_MARK_LENGTH ? undefined : { tool, from: first, to: last };
  return points.length < 2 ? undefined : { tool, points: [...points] };
}

/** The two barbs of an arrow head at `to`, `size` long and 30° off the shaft. */
export function arrowHead(from: Point, to: Point, size: number): readonly [Point, Point] {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const spread = Math.PI / 6;
  return [
    { x: to.x - size * Math.cos(angle - spread), y: to.y - size * Math.sin(angle - spread) },
    { x: to.x - size * Math.cos(angle + spread), y: to.y - size * Math.sin(angle + spread) },
  ];
}

/** Maps a shape drawn on the on-screen preview to the photo's own pixel size. */
export function scaleShape(shape: AnnotationShape, factor: number): AnnotationShape {
  const p = (point: Point): Point => ({ x: point.x * factor, y: point.y * factor });
  if (shape.tool === "circle") return { tool: "circle", center: p(shape.center), radius: shape.radius * factor };
  if (shape.tool === "arrow") return { tool: "arrow", from: p(shape.from), to: p(shape.to) };
  return { tool: "freehand", points: shape.points.map(p) };
}

/** SVG path for a shape; Skia draws it with `Skia.Path.MakeFromSVGString`. */
export function shapeToSvgPath(shape: AnnotationShape, headSize = 24): string {
  const n = (value: number) => Number(value.toFixed(1));
  if (shape.tool === "circle") {
    const { center, radius } = shape;
    return `M ${n(center.x - radius)} ${n(center.y)} a ${n(radius)} ${n(radius)} 0 1 0 ${n(radius * 2)} 0 a ${n(radius)} ${n(radius)} 0 1 0 ${n(-radius * 2)} 0`;
  }
  if (shape.tool === "arrow") {
    const [left, right] = arrowHead(shape.from, shape.to, headSize);
    return `M ${n(shape.from.x)} ${n(shape.from.y)} L ${n(shape.to.x)} ${n(shape.to.y)} M ${n(left.x)} ${n(left.y)} L ${n(shape.to.x)} ${n(shape.to.y)} L ${n(right.x)} ${n(right.y)}`;
  }
  const [head, ...rest] = shape.points;
  if (head === undefined) return "";
  return [`M ${n(head.x)} ${n(head.y)}`, ...rest.map((point) => `L ${n(point.x)} ${n(point.y)}`)].join(" ");
}

const ANNOTATED_SUFFIX = "_annotated.jpg";
const ORIGINAL_EXTENSIONS = ["jpg", "heic", "png"] as const;

/** Where the untouched original may sit while the flattened copy waits to upload (`media/<id>.<ext>`). */
export function originalUrisFor(annotatedUri: string): readonly string[] {
  if (!annotatedUri.endsWith(ANNOTATED_SUFFIX)) return [];
  const base = annotatedUri.slice(0, -ANNOTATED_SUFFIX.length);
  return ORIGINAL_EXTENSIONS.map((ext) => `${base}.${ext}`);
}

/**
 * FR-04: the flattened JPEG (photo plus marks) becomes the file that uploads for this media id; the
 * original photo stays on the phone, untouched, until the upload of the annotated copy is done
 * (`pruneAnnotationOriginals`). Annotating again replaces the previous flattened copy.
 */
export async function annotateCapture(deps: { readonly db: SqlDb; readonly files: FileStore }, draft: MediaDraft, flattenedJpegBase64: string): Promise<MediaDraft> {
  if (draft.kind !== "PHOTO") throw new LocalError("MEDIA_CAPTURE_FAILED");
  const row = await deps.db.get<{ localUri: string; state: string }>("SELECT localUri, state FROM media_files WHERE mediaId = ?", [draft.id]);
  if (row === undefined || row.state !== "WAITING_PARENT" || deps.files.writeTemp === undefined) throw new LocalError("MEDIA_CAPTURE_FAILED");
  const fileName = `${draft.id}${ANNOTATED_SUFFIX}`;
  const temp = await deps.files.writeTemp(fileName, flattenedJpegBase64);
  const annotatedUri = await deps.files.persist(temp, fileName);
  const sizeBytes = await deps.files.size(annotatedUri);
  if (sizeBytes === 0) throw new LocalError("MEDIA_CAPTURE_FAILED");
  await deps.db.run("UPDATE media_files SET localUri = ?, thumbUri = ?, sizeBytes = ?, mimeType = 'image/jpeg' WHERE mediaId = ?", [annotatedUri, annotatedUri, sizeBytes, draft.id]);
  const { thumbUri: _thumbUri, ...rest } = draft;
  return { ...rest, mimeType: "image/jpeg", sizeBytes, localUri: annotatedUri };
}

/**
 * Removes the originals of annotated photos whose annotated upload is DONE (the report synced).
 * Must run before `pruneMediaFiles` deletes the DONE rows (change request T17-004). Returns the
 * number of originals removed.
 */
export async function pruneAnnotationOriginals(db: SqlDb, files: FileStore): Promise<number> {
  const rows = await db.all<{ localUri: string }>("SELECT localUri FROM media_files WHERE state = 'DONE' AND localUri LIKE ?", [`%${ANNOTATED_SUFFIX}`]);
  let removed = 0;
  for (const row of rows) {
    for (const original of originalUrisFor(row.localUri)) {
      if (await files.exists(original)) {
        await files.remove(original);
        removed += 1;
      }
    }
  }
  return removed;
}
