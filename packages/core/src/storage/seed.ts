import { access, mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { collections, getDb } from "@agrorende/db";
import type { MediaTag } from "@agrorende/contracts/enums";
import sharp from "sharp";

import { initStorage, mediaRootFromEnv } from "./init";

export interface StorageSeedResult {
  readonly seeded: number;
  readonly skipped: number;
}

const TAG_COLOURS = {
  GENERAL: "#2F855A",
  BEFORE: "#2B6CB0",
  AFTER: "#38A169",
  WALKAROUND_FRONT: "#4C51BF",
  WALKAROUND_REAR: "#553C9A",
  WALKAROUND_LEFT: "#805AD5",
  WALKAROUND_RIGHT: "#6B46C1",
  WALKAROUND_CAB: "#3182CE",
  HOUR_METER: "#DD6B20",
  FUEL_GAUGE: "#D69E2E",
  DAMAGE: "#C53030",
  PLATE: "#2D3748",
  CHECKLIST_ITEM: "#319795",
  SIGNATURE_CUSTOMER: "#718096",
  SIGNATURE_AGENT: "#4A5568",
  SIGNATURE_TECHNICIAN: "#1A202C",
  FUEL_PUMP: "#B7791F",
} as const satisfies Record<MediaTag, string>;

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function insideRoot(root: string, key: string): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(root, key);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Storage key escapes MEDIA_ROOT: ${key}`);
  }
  return resolved;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function placeholderSvg(input: { readonly id: string; readonly tag: MediaTag; readonly caption: string | null | undefined }): string {
  const title = escapeXml(input.id);
  const caption = escapeXml(input.caption ?? input.tag);
  const colour = TAG_COLOURS[input.tag];
  return `<svg width="1280" height="960" viewBox="0 0 1280 960" xmlns="http://www.w3.org/2000/svg">
  <rect width="1280" height="960" fill="${colour}"/>
  <rect x="64" y="64" width="1152" height="832" rx="48" fill="rgba(255,255,255,0.16)" stroke="rgba(255,255,255,0.45)" stroke-width="6"/>
  <text x="640" y="395" text-anchor="middle" font-family="Arial, sans-serif" font-size="74" font-weight="700" fill="#FFFFFF">AgroRende</text>
  <text x="640" y="495" text-anchor="middle" font-family="Arial, sans-serif" font-size="46" fill="#FFFFFF">${title}</text>
  <text x="640" y="585" text-anchor="middle" font-family="Arial, sans-serif" font-size="38" fill="#FFFFFF">${caption}</text>
  <text x="640" y="680" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" fill="#F7FAFC">${input.tag}</text>
</svg>`;
}

export async function seedStorage(root = mediaRootFromEnv()): Promise<StorageSeedResult> {
  if (process.env.APP_ENV === "production") {
    throw new Error("storage-seed refuses to run when APP_ENV=production.");
  }

  await initStorage(root);
  const db = await getDb();
  const media = await collections.media(db).find({ mimeType: "image/jpeg" }).toArray();
  let seeded = 0;
  let skipped = 0;

  for (const row of media) {
    const originalPath = insideRoot(root, row.storageKey);
    const thumbnailPath = row.thumbnailKey === null || row.thumbnailKey === undefined ? null : insideRoot(root, row.thumbnailKey);
    if ((await exists(originalPath)) && (thumbnailPath === null || (await exists(thumbnailPath)))) {
      skipped += 1;
      continue;
    }

    await mkdir(path.dirname(originalPath), { recursive: true, mode: 0o750 });
    const svg = placeholderSvg({ id: row._id, tag: row.tag, caption: row.caption });
    const image = await sharp(Buffer.from(svg)).jpeg({ quality: 82 }).resize(1280, 960, { fit: "cover" }).toBuffer();
    await writeFile(originalPath, image, { mode: 0o640 });

    if (thumbnailPath !== null) {
      await mkdir(path.dirname(thumbnailPath), { recursive: true, mode: 0o750 });
      const thumbTmp = `${thumbnailPath}.tmp-${process.pid}`;
      await sharp(image).resize({ width: 320 }).jpeg({ quality: 82 }).toFile(thumbTmp);
      await rename(thumbTmp, thumbnailPath);
    }
    seeded += 1;
  }

  return { seeded, skipped };
}
