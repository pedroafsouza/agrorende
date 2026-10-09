import type { MediaMeta } from "@agrorende/contracts/sync";
import { uuidv7 } from "uuidv7";

import { bundledMigrations, latestMigrationWhen, type MigrationBundle } from "../../../src/db/migrate";
import { persistCapture } from "../../../src/media/capture";
import { createReport } from "../../../src/sync/mutators/reports";
import type { ChaosDevice } from "./device";
import { jpegBytes, mp4Bytes } from "./files";

export interface CaptureSpec {
  readonly kind: "PHOTO" | "VIDEO";
  readonly sizeBytes?: number;
  readonly wifiOnly?: boolean;
  readonly durationMs?: number;
  /** The thumbnail generator failed: no preview file (EC-SYN-26). */
  readonly noThumb?: boolean;
}

/** Captures one photo or video into durable storage, exactly like the capture sheet does. */
export async function capture(device: ChaosDevice, parent: { type: string; id: string }, spec: CaptureSpec, tag = "GENERAL"): Promise<MediaMeta> {
  const id = uuidv7();
  const video = spec.kind === "VIDEO";
  const bytes = video ? mp4Bytes(spec.sizeBytes ?? 256 * 1024) : jpegBytes(spec.sizeBytes ?? 4096, id.charCodeAt(30));
  const sourceUri = device.files.add(`file:///cache/capture-${id}`, bytes);
  const thumbSourceUri = spec.noThumb === true ? undefined : device.files.add(`file:///cache/thumb-${id}`, jpegBytes(1024, 9));
  const meta: MediaMeta = {
    id,
    kind: spec.kind,
    tag,
    mimeType: video ? "video/mp4" : "image/jpeg",
    sizeBytes: bytes.byteLength,
    ...(video ? { durationMs: spec.durationMs ?? 20_000 } : {}),
    capturedAt: new Date(device.clock.now()).toISOString(),
    lat: -15.79,
    lng: -47.88,
    parent,
  };
  const captured = await persistCapture(device.sqlDb, device.files, { meta, sourceUri, ...(thumbSourceUri === undefined ? {} : { thumbSourceUri }), ...(spec.wifiOnly === undefined ? {} : { wifiOnly: spec.wifiOnly }) });
  return captured.meta;
}

export interface OfflineReport {
  readonly id: string;
  readonly media: readonly MediaMeta[];
}

/** F1 report written offline with the given evidence (`fieldReport.create` + WAITING_PARENT media). */
export async function createOfflineReport(device: ChaosDevice, evidence: readonly CaptureSpec[] = [], title = "Vazamento hidráulico"): Promise<OfflineReport> {
  const id = uuidv7();
  const parent = { type: "FIELD_REPORT", id };
  const media: MediaMeta[] = [];
  for (const spec of evidence) media.push(await capture(device, parent, spec));
  await createReport(
    {
      id,
      unregisteredAssetDesc: "Trator azul do galpão 2",
      category: "HYDRAULIC",
      priority: "HIGH",
      machineOperable: true,
      suggestedAction: "REPAIR_SOON",
      title,
      media,
    },
    { runtime: device.rt, lat: -15.79, lng: -47.88 },
  );
  return { id, media };
}

export const PHOTO: CaptureSpec = { kind: "PHOTO" };
export const VIDEO: CaptureSpec = { kind: "VIDEO" };

export const MIB = 1024 * 1024;
export const HOUR_MS = 60 * 60_000;
export const DAY_MS = 24 * HOUR_MS;

/**
 * C9: `count` media metadata documents in the local mirror plus matching `media_files` rows that
 * are already uploaded (sparse: no bytes on disk), as a long-lived device accumulates.
 */
export async function seedMediaMetadata(device: ChaosDevice, count: number, sizeBytes: number): Promise<void> {
  const now = new Date(device.clock.now()).toISOString();
  const keepUntil = new Date(device.clock.now() + 365 * DAY_MS).toISOString();
  await device.sqlDb.transaction(async (tx) => {
    for (let i = 0; i < count; i += 1) {
      const id = uuidv7();
      const parent = JSON.stringify({ type: "ASSET", id: `018fd000-0000-7000-8000-${(0xa0000 + (i % 200)).toString(16).padStart(12, "0")}` });
      await tx.run(
        "INSERT INTO media (id, organizationId, syncVersion, createdAt, updatedAt, deletedAt, kind, status, tag, mimeType, sizeBytes, capturedAt, uploadedAt, parent) VALUES (?, NULL, 1, ?, ?, NULL, 'PHOTO', 'READY', 'GENERAL', 'image/jpeg', ?, ?, ?, ?)",
        [id, now, now, sizeBytes, now, now, parent],
      );
      await tx.run(
        "INSERT INTO media_files (mediaId, localUri, thumbUri, mimeType, sizeBytes, kind, priority, state, partsDone, bytesSent, attempts, wifiOnly, doneAt, deleteAfter) VALUES (?, ?, NULL, 'image/jpeg', ?, 'PHOTO', 3, 'DONE', NULL, ?, 0, 0, ?, ?)",
        [id, `file:///doc/media/sparse-${id}.jpg`, sizeBytes, sizeBytes, now, keepUntil],
      );
    }
  });
}

/** C11: the shipped bundle plus one newer migration, as the next app version would carry. */
export function bundleWithExtraMigration(): MigrationBundle {
  const latest = latestMigrationWhen(bundledMigrations);
  const entries = bundledMigrations.journal.entries;
  const idx = entries.length;
  const tag = `${String(idx).padStart(4, "0")}_chaos_update`;
  return {
    journal: { ...bundledMigrations.journal, entries: [...entries, { idx, when: latest + 1000, tag, breakpoints: true }] },
    migrations: { ...bundledMigrations.migrations, [`m${String(idx).padStart(4, "0")}`]: "CREATE INDEX `chaos_update_idx` ON `drafts` (`kind`);" },
  };
}
