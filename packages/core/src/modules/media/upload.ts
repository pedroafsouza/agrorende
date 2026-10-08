import { randomUUID } from "node:crypto";

import { AppError } from "@agrorende/contracts/errors";
import { collections, getDb, type Media } from "@agrorende/db";
import { z } from "zod";
import type { MediaMeta } from "@agrorende/contracts/sync";

import { authConfig } from "../../auth/config.js";
import { signMediaUrlToken, verifyMediaUrlToken, type MediaUrlTokenClaims } from "../../auth/jwt.js";
import type { Ctx } from "../../context.js";
import { mediaStore, type BlobRange, type MediaVariant } from "../../storage/index.js";
import { loadScopedRow } from "../../sync/pull.js";
import { txDb } from "../../sync/touch.js";
import { withSyncTx } from "../../sync/withSyncTx.js";
import { toMediaDto, type MediaDTO } from "./dto.js";
import { MULTIPART_PART_BYTES, posterKeyFor, registerMedia, SINGLE_UPLOAD_MAX_BYTES, thumbnailKeyFor, updateMedia } from "./service.js";

export const UPLOAD_URL_TTL_S = 60 * 60;
export const READ_URL_TTL_S = 5 * 60;
export const VARIANT_MAX_BYTES = 2 * 1024 * 1024;

/** Server-side ceilings per media kind (ARCHITECTURE §7.7: 60 s 720p video, 2048 px photos). */
export const MEDIA_MAX_BYTES: Record<Media["kind"], number> = {
  PHOTO: 25 * 1024 * 1024,
  SIGNATURE: 5 * 1024 * 1024,
  AUDIO: 50 * 1024 * 1024,
  VIDEO: 300 * 1024 * 1024,
  DOCUMENT: 50 * 1024 * 1024,
};

const VariantSchema = z.enum(["original", "thumb", "poster"]);

export const UploadUrlRequestSchema = z.object({
  variant: VariantSchema.default("original"),
  sizeBytes: z.number().int().positive(),
  mimeType: z.string().trim().min(1).max(100),
});

export const PartUrlsRequestSchema = z
  .object({
    variant: VariantSchema.default("original"),
    uploadId: z.string().uuid(),
    parts: z.array(z.number().int().positive()).max(10_000).optional(),
    partNumbers: z.array(z.number().int().positive()).max(10_000).optional(),
  })
  .transform((value) => ({ variant: value.variant, uploadId: value.uploadId, parts: value.parts ?? value.partNumbers ?? [] }));

export const CompleteRequestSchema = z.object({
  variant: VariantSchema.default("original"),
  uploadId: z.string().uuid().optional(),
  parts: z.array(z.object({ n: z.number().int().positive(), etag: z.string().min(1) })).optional(),
});

export interface SignedPartUrl {
  readonly n: number;
  readonly url: string;
}

export interface UploadInstructions {
  readonly mode: "single" | "multipart";
  readonly url?: string;
  readonly headers?: Record<string, string>;
  readonly uploadId?: string;
  readonly partSize?: number;
  readonly parts?: readonly SignedPartUrl[];
  readonly expiresAt: string;
}

function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new AppError("VALIDATION_FAILED", { fieldErrors: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })) });
  }
  return parsed.data;
}

const isOffice = (ctx: Pick<Ctx, "role">): boolean => ctx.role === "ADMIN" || ctx.role === "MANAGER";

async function loadMedia(organizationId: string | null, mediaId: string): Promise<Media> {
  const media = await collections.media(await getDb()).findOne(organizationId === null ? { _id: mediaId } : { _id: mediaId, organizationId });
  if (media === null || (media.deletedAt !== null && media.deletedAt !== undefined)) throw new AppError("NOT_FOUND", { details: { entityType: "MEDIA", id: mediaId } });
  return media;
}

/** Only the capturer or the office may upload bytes; others get NOT_FOUND so ids do not leak. */
async function loadForUpload(ctx: Ctx, mediaId: string): Promise<Media> {
  const media = await loadMedia(ctx.organizationId, mediaId);
  if (!isOffice(ctx) && media.capturedById !== ctx.userId) throw new AppError("NOT_FOUND", { details: { entityType: "MEDIA", id: mediaId } });
  return media;
}

export function variantKey(media: Pick<Media, "storageKey" | "thumbnailKey">, variant: MediaVariant): string {
  if (variant === "original") return media.storageKey;
  if (variant === "thumb") return media.thumbnailKey ?? thumbnailKeyFor(media.storageKey);
  return posterKeyFor(media.storageKey);
}

function variantMime(media: Pick<Media, "mimeType">, variant: MediaVariant): string {
  return variant === "original" ? media.mimeType.toLowerCase() : "image/jpeg";
}

function variantStatus(media: Pick<Media, "variants">, variant: MediaVariant): string | undefined {
  return media.variants[variant]?.status;
}

function apiUrl(pathname: string, query: Record<string, string>): string {
  const url = new URL(`/api/v1${pathname}`, authConfig().appUrl);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return url.toString();
}

async function signToken(claims: Omit<MediaUrlTokenClaims, "tokenUse">, ttlS: number): Promise<string> {
  return signMediaUrlToken({ tokenUse: "media-url", ...claims }, { secret: authConfig().mediaUrlSecret, expiresIn: `${ttlS}s` });
}

function expiresAt(now: Date, ttlS: number): string {
  return new Date(now.getTime() + ttlS * 1000).toISOString();
}

async function partUrls(mediaId: string, variant: MediaVariant, uploadId: string, partSize: number, mimeType: string, parts: readonly number[]): Promise<SignedPartUrl[]> {
  return Promise.all(
    parts.map(async (n) => {
      const t = await signToken({ sub: mediaId, v: variant, op: "part", uid: uploadId, n, max: partSize, ct: mimeType }, UPLOAD_URL_TTL_S);
      return { n, url: apiUrl(`/media/${mediaId}/blob/parts/${n}`, { uploadId, t }) };
    }),
  );
}

/** `POST /media/:id/upload-url` (ARCHITECTURE §7.7 step 5). */
export async function issueUploadUrl(ctx: Ctx, mediaId: string, input: unknown, now: Date = new Date()): Promise<UploadInstructions> {
  const body = parse(UploadUrlRequestSchema, input);
  const media = await loadForUpload(ctx, mediaId);
  return instructionsFor(media, body, now);
}

async function instructionsFor(media: Media, body: z.infer<typeof UploadUrlRequestSchema>, now: Date): Promise<UploadInstructions> {
  const variant = body.variant;
  if (variantStatus(media, variant) === "UPLOADED") throw new AppError("MEDIA_LOCKED", { details: { id: media._id, variant } });
  const expected = variantMime(media, variant);
  if (body.mimeType.toLowerCase() !== expected) throw new AppError("MEDIA_TYPE_MISMATCH", { details: { expected, received: body.mimeType } });
  const max = variant === "original" ? MEDIA_MAX_BYTES[media.kind] : VARIANT_MAX_BYTES;
  if (body.sizeBytes > max) throw new AppError("MEDIA_TOO_LARGE", { details: { maxBytes: max, sizeBytes: body.sizeBytes } });
  await mediaStore().assertSpace(body.sizeBytes);
  if (body.sizeBytes <= SINGLE_UPLOAD_MAX_BYTES) {
    const t = await signToken({ sub: media._id, v: variant, op: "put", max: body.sizeBytes, ct: expected }, UPLOAD_URL_TTL_S);
    return {
      mode: "single",
      url: apiUrl(`/media/${media._id}/blob`, { variant, t }),
      headers: { "content-type": expected },
      expiresAt: expiresAt(now, UPLOAD_URL_TTL_S),
    };
  }
  const partCount = Math.ceil(body.sizeBytes / MULTIPART_PART_BYTES);
  const session = await mediaStore().createUpload({ mediaId: media._id, variant, sizeBytes: body.sizeBytes, mimeType: expected, partSize: MULTIPART_PART_BYTES, partCount });
  const numbers = Array.from({ length: partCount }, (_, index) => index + 1);
  return {
    mode: "multipart",
    uploadId: session.uploadId,
    partSize: MULTIPART_PART_BYTES,
    parts: await partUrls(media._id, variant, session.uploadId, MULTIPART_PART_BYTES, expected, numbers),
    expiresAt: expiresAt(now, UPLOAD_URL_TTL_S),
  };
}

/** `POST /media/:id/multipart/parts`: fresh URLs after an interruption or `UPLOAD_URL_EXPIRED`. */
export async function issuePartUrls(ctx: Ctx, mediaId: string, input: unknown, now: Date = new Date()): Promise<{ urls: SignedPartUrl[]; expiresAt: string }> {
  const body = parse(PartUrlsRequestSchema, input);
  await loadForUpload(ctx, mediaId);
  const session = await mediaStore().getUpload(body.uploadId);
  if (session.mediaId !== mediaId || session.variant !== body.variant) throw new AppError("NOT_FOUND", { details: { uploadId: body.uploadId } });
  const wanted = body.parts.length === 0 ? Array.from({ length: session.partCount }, (_, index) => index + 1) : body.parts;
  const outOfRange = wanted.filter((n) => n > session.partCount);
  if (outOfRange.length > 0) throw new AppError("VALIDATION_FAILED", { fieldErrors: [{ path: "parts", code: "out_of_range" }], details: { partCount: session.partCount } });
  return { urls: await partUrls(mediaId, body.variant, body.uploadId, session.partSize, session.mimeType, wanted), expiresAt: expiresAt(now, UPLOAD_URL_TTL_S) };
}

function isExpired(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ERR_JWT_EXPIRED";
}

/**
 * Verifies a `t=` blob token. An expired upload token is `UPLOAD_URL_EXPIRED` (410) so the
 * client fetches a fresh URL; any other mismatch is FORBIDDEN (403).
 */
export async function verifyBlobToken(token: string | null, mediaId: string, op: MediaUrlTokenClaims["op"], variant?: string): Promise<MediaUrlTokenClaims> {
  if (token === null || token.length === 0) throw new AppError("FORBIDDEN", { details: { reason: "media_token" } });
  let claims: MediaUrlTokenClaims;
  try {
    claims = await verifyMediaUrlToken(token, { secret: authConfig().mediaUrlSecret });
  } catch (error) {
    if (isExpired(error)) {
      if (op === "get") throw new AppError("FORBIDDEN", { details: { reason: "media_token_expired" } });
      throw new AppError("UPLOAD_URL_EXPIRED");
    }
    throw new AppError("FORBIDDEN", { details: { reason: "media_token" } });
  }
  if (claims.sub !== mediaId || claims.op !== op || (variant !== undefined && claims.v !== variant)) {
    throw new AppError("FORBIDDEN", { details: { reason: "media_token" } });
  }
  return claims;
}

const stagingKey = (mediaId: string, variant: MediaVariant): string => `${mediaId}/${variant}.blob`;

/** `PUT /media/:id/blob?variant=&t=`: streams one single-mode upload into staging. */
export async function putBlob(mediaId: string, variant: string | null, token: string | null, body: ReadableStream<Uint8Array> | Uint8Array | null): Promise<{ sizeBytes: number; etag: string }> {
  const claims = await verifyBlobToken(token, mediaId, "put", variant ?? undefined);
  const media = await loadMedia(null, mediaId);
  if (variantStatus(media, claims.v) === "UPLOADED") throw new AppError("MEDIA_LOCKED", { details: { id: mediaId, variant: claims.v } });
  return mediaStore().stage(stagingKey(mediaId, claims.v), body, claims.max ?? SINGLE_UPLOAD_MAX_BYTES);
}

/** `PUT /media/:id/blob/parts/:n?uploadId=&t=`. Returns the part ETag for the client to record. */
export async function putPart(mediaId: string, partNumber: number, uploadId: string | null, token: string | null, body: ReadableStream<Uint8Array> | Uint8Array | null): Promise<{ n: number; etag: string }> {
  const claims = await verifyBlobToken(token, mediaId, "part");
  if (claims.uid !== uploadId || claims.n !== partNumber || uploadId === null) throw new AppError("FORBIDDEN", { details: { reason: "media_token" } });
  const session = await mediaStore().getUpload(uploadId);
  if (session.mediaId !== mediaId) throw new AppError("FORBIDDEN", { details: { reason: "media_token" } });
  const part = await mediaStore().writePart(uploadId, partNumber, body, claims.max ?? session.partSize);
  return { n: part.n, etag: part.etag };
}

interface Signature {
  readonly offset: number;
  readonly bytes: readonly number[];
}

const ascii = (text: string): number[] => Array.from(text, (char) => char.charCodeAt(0));
const FTYP: Signature = { offset: 4, bytes: ascii("ftyp") };

const SIGNATURES: Record<string, readonly (readonly Signature[])[]> = {
  "image/jpeg": [[{ offset: 0, bytes: [0xff, 0xd8, 0xff] }]],
  "image/jpg": [[{ offset: 0, bytes: [0xff, 0xd8, 0xff] }]],
  "image/png": [[{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }]],
  "image/webp": [[{ offset: 0, bytes: ascii("RIFF") }, { offset: 8, bytes: ascii("WEBP") }]],
  "image/heic": [[FTYP]],
  "video/mp4": [[FTYP]],
  "audio/mp4": [[FTYP]],
  "video/quicktime": [[FTYP], [{ offset: 4, bytes: ascii("moov") }], [{ offset: 4, bytes: ascii("wide") }], [{ offset: 4, bytes: ascii("mdat") }], [{ offset: 4, bytes: ascii("free") }]],
  "audio/aac": [[{ offset: 0, bytes: [0xff, 0xf1] }], [{ offset: 0, bytes: [0xff, 0xf9] }], [{ offset: 0, bytes: ascii("ADIF") }]],
  "audio/mpeg": [[{ offset: 0, bytes: ascii("ID3") }], [{ offset: 0, bytes: [0xff, 0xfb] }], [{ offset: 0, bytes: [0xff, 0xf3] }], [{ offset: 0, bytes: [0xff, 0xf2] }]],
  "application/pdf": [[{ offset: 0, bytes: ascii("%PDF-") }]],
};

/** Magic-byte check for the declared MIME type (EC-SYN-23). Unknown types are accepted. */
export function matchesMime(mimeType: string, head: Uint8Array): boolean {
  const alternatives = SIGNATURES[mimeType.toLowerCase()];
  if (alternatives === undefined) return true;
  return alternatives.some((all) => all.every((sig) => sig.bytes.every((byte, index) => head[sig.offset + index] === byte)));
}

/** `POST /media/:id/complete`: validates, promotes atomically and marks the variant UPLOADED. */
export async function completeUpload(ctx: Ctx, mediaId: string, input: unknown): Promise<{ media: MediaDTO }> {
  const body = parse(CompleteRequestSchema, input);
  const media = await loadForUpload(ctx, mediaId);
  const variant = body.variant;
  const store = mediaStore();
  if (variantStatus(media, variant) === "UPLOADED") {
    return { media: toMediaDto(media) };
  }
  const mimeType = variantMime(media, variant);
  let file: string;
  let declared: number | null = variant === "original" ? (media.sizeBytes ?? null) : null;
  if (body.uploadId !== undefined) {
    const session = await store.getUpload(body.uploadId);
    if (session.mediaId !== mediaId || session.variant !== variant) throw new AppError("NOT_FOUND", { details: { uploadId: body.uploadId } });
    const stored = await store.listParts(body.uploadId);
    const byNumber = new Map(stored.map((part) => [part.n, part]));
    const expected = Array.from({ length: session.partCount }, (_, index) => index + 1);
    const missing = expected.filter((n) => {
      const part = byNumber.get(n);
      if (part === undefined) return true;
      const claimed = body.parts?.find((item) => item.n === n);
      return claimed !== undefined && claimed.etag.replace(/"/gu, "") !== part.etag;
    });
    if (missing.length > 0) throw new AppError("MEDIA_PART_MISSING", { details: { missing } });
    await store.assertSpace(session.sizeBytes);
    file = await store.assembleUpload(body.uploadId, expected);
    declared = session.sizeBytes;
  } else {
    const staged = await store.stagedPath(stagingKey(mediaId, variant));
    if (staged === null) throw new AppError("MEDIA_PART_MISSING", { details: { missing: [1] } });
    file = staged;
  }
  const sizeBytes = await store.fileSize(file);
  if (declared !== null && declared > 0 && sizeBytes !== declared && body.uploadId !== undefined) {
    await store.discard(file);
    throw new AppError("MEDIA_PART_MISSING", { details: { expectedBytes: declared, receivedBytes: sizeBytes } });
  }
  const head = await store.readHead(file, 16);
  if (!matchesMime(mimeType, head)) {
    await store.discard(file);
    throw new AppError("MEDIA_TYPE_MISMATCH", { details: { expected: mimeType } });
  }
  const key = variantKey(media, variant);
  await store.promote(file, key);
  if (body.uploadId !== undefined) await store.abortUpload(body.uploadId);
  const now = new Date();
  const updated = await withSyncTx(ctx, async (tx) => {
    const db = txDb(tx);
    const current = await db.media.findOne({ _id: mediaId });
    if (current === null) throw new AppError("NOT_FOUND", { details: { entityType: "MEDIA", id: mediaId } });
    const variants = { ...current.variants, [variant]: { status: "UPLOADED" as const, key, sizeBytes, uploadedAt: now.toISOString() } };
    const set: Partial<Media> = { variants, syncVersion: tx.syncVersion, updatedAt: now };
    if (variant === "original") {
      set.status = "UPLOADED";
      set.uploadedAt = now;
      set.sizeBytes = sizeBytes;
    }
    await db.media.updateOne({ _id: mediaId }, { $set: set });
    return { ...current, ...set };
  });
  return { media: toMediaDto(updated) };
}

/** Authorizes a read: office, the capturer, or anyone whose pull scope includes the row. */
async function loadForRead(ctx: Ctx, mediaId: string): Promise<Media> {
  const media = await loadMedia(ctx.organizationId, mediaId);
  if (isOffice(ctx) || media.capturedById === ctx.userId) return media;
  const scoped = await loadScopedRow(ctx, "media", mediaId);
  if (scoped === null) throw new AppError("NOT_FOUND", { details: { entityType: "MEDIA", id: mediaId } });
  return media;
}

/** `GET /media/:id/url`: a 5-minute signed absolute blob URL for the 302 redirect. */
export async function readUrl(ctx: Ctx, mediaId: string, variantInput: string | null, now: Date = new Date()): Promise<{ url: string; expiresAt: string }> {
  const variant = VariantSchema.safeParse(variantInput ?? "original");
  if (!variant.success) throw new AppError("VALIDATION_FAILED", { fieldErrors: [{ path: "variant", code: "invalid_enum_value" }] });
  const media = await loadForRead(ctx, mediaId);
  if (variantStatus(media, variant.data) !== "UPLOADED") throw new AppError("MEDIA_NOT_IN_STORAGE", { details: { id: mediaId, variant: variant.data } });
  const t = await signToken({ sub: mediaId, v: variant.data, op: "get" }, READ_URL_TTL_S);
  return { url: apiUrl(`/media/${mediaId}/blob`, { variant: variant.data, t }), expiresAt: expiresAt(now, READ_URL_TTL_S) };
}

export interface BlobRead {
  readonly status: 200 | 206 | 416;
  readonly headers: Record<string, string>;
  readonly body: ReadableStream<Uint8Array> | null;
}

/** Parses a single `bytes=` range; `null` means "whole file", `"invalid"` means 416. */
export function parseRange(header: string | null, size: number): BlobRange | null | "invalid" {
  if (header === null || header.trim() === "") return null;
  const match = /^bytes=(\d*)-(\d*)$/u.exec(header.trim());
  if (match === null) return "invalid";
  const [, startText = "", endText = ""] = match;
  if (startText === "" && endText === "") return "invalid";
  if (startText === "") {
    const suffix = Number(endText);
    if (suffix === 0) return "invalid";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(startText);
  const end = endText === "" ? size - 1 : Math.min(Number(endText), size - 1);
  if (start >= size || end < start) return "invalid";
  return { start, end };
}

/** `GET /media/:id/blob?variant=&t=`: token-authorized read with `Accept-Ranges: bytes`. */
export async function readBlob(mediaId: string, variantInput: string | null, token: string | null, rangeHeader: string | null): Promise<BlobRead> {
  const claims = await verifyBlobToken(token, mediaId, "get", variantInput ?? undefined);
  const media = await loadMedia(null, mediaId);
  const key = variantKey(media, claims.v);
  const store = mediaStore();
  const info = variantStatus(media, claims.v) === "UPLOADED" ? await store.head(key) : null;
  if (info === null) throw new AppError("MEDIA_NOT_IN_STORAGE", { details: { id: mediaId, variant: claims.v } });
  const base: Record<string, string> = {
    "accept-ranges": "bytes",
    "content-type": variantMime(media, claims.v),
    "cache-control": "private, max-age=300",
    "x-content-type-options": "nosniff",
  };
  const range = parseRange(rangeHeader, info.sizeBytes);
  if (range === "invalid") return { status: 416, headers: { ...base, "content-range": `bytes */${info.sizeBytes}` }, body: null };
  if (range === null) return { status: 200, headers: { ...base, "content-length": String(info.sizeBytes) }, body: await store.read(key) };
  return {
    status: 206,
    headers: { ...base, "content-length": String(range.end - range.start + 1), "content-range": `bytes ${range.start}-${range.end}/${info.sizeBytes}` },
    body: await store.read(key, range),
  };
}

export const WebMediaCreateSchema = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(["PHOTO", "VIDEO", "AUDIO", "SIGNATURE", "DOCUMENT"]),
  tag: z.string().min(1).default("GENERAL"),
  mimeType: z.string().trim().min(1).max(100),
  sizeBytes: z.number().int().positive(),
  width: z.number().int().nonnegative().optional(),
  height: z.number().int().nonnegative().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  capturedAt: z.string().datetime({ offset: true }).optional(),
  caption: z.string().max(500).optional(),
  parent: z.object({ type: z.string().min(1), id: z.string().uuid() }),
});

/** `POST /media` (web): registers a Media row and returns the upload instructions for its original. */
export async function createWebMedia(ctx: Ctx, input: unknown, now: Date = new Date()): Promise<{ media: MediaDTO; upload: UploadInstructions }> {
  const body = parse(WebMediaCreateSchema, input);
  const id = body.id ?? randomUUID();
  const meta: MediaMeta = {
    id,
    kind: body.kind,
    tag: body.tag,
    mimeType: body.mimeType,
    sizeBytes: body.sizeBytes,
    capturedAt: body.capturedAt ?? now.toISOString(),
    parent: body.parent,
    ...(body.width === undefined ? {} : { width: body.width }),
    ...(body.height === undefined ? {} : { height: body.height }),
    ...(body.durationMs === undefined ? {} : { durationMs: body.durationMs }),
  };
  await withSyncTx(ctx, async (tx) => {
    await registerMedia(tx, ctx, meta);
    if (body.caption !== undefined) await updateMedia(tx, ctx, { id, caption: body.caption });
  });
  const media = await loadMedia(ctx.organizationId, id);
  return { media: toMediaDto(media), upload: await instructionsFor(media, { variant: "original", sizeBytes: body.sizeBytes, mimeType: body.mimeType }, now) };
}
