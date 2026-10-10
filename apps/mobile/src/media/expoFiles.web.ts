import { appConfig } from "../lib/app/config";
import type { FileStore } from "./files";

/**
 * Web variant of `expoFiles.ts` (development web preview only). Captured media is kept in memory
 * as blobs and addressed by object URLs, which `<img>` and expo-image can display directly.
 * Uploads use `fetch`. Native builds keep using expo-file-system and background upload tasks.
 */
const blobs = new Map<string, Blob>();

async function blobFor(uri: string): Promise<Blob> {
  const known = blobs.get(uri);
  if (known !== undefined) return known;
  const response = await fetch(uri);
  return response.blob();
}

function keep(blob: Blob): string {
  const uri = URL.createObjectURL(blob);
  blobs.set(uri, blob);
  return uri;
}

/** Upload URLs may name the API origin directly; the preview reaches the API through its own origin. */
function sameOrigin(url: string): string {
  const api = new URL(appConfig.apiUrl);
  const target = new URL(url, api);
  if (typeof window !== "undefined" && target.pathname.startsWith("/api/")) {
    return `${window.location.origin}${target.pathname}${target.search}`;
  }
  return target.toString();
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * The browser camera returns PNG data URLs while the app records photos as JPEG (as the native
 * camera produces), so photos are re-encoded before they are kept; the API checks the file header.
 */
async function asJpeg(blob: Blob): Promise<Blob> {
  if (blob.type === "image/jpeg" || !blob.type.startsWith("image/")) return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (context === null) return blob;
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return new Promise((resolve) => {
    canvas.toBlob((result) => resolve(result ?? blob), "image/jpeg", 0.85);
  });
}

export const expoFileStore: FileStore = {
  async persist(sourceUri, fileName) {
    const blob = await blobFor(sourceUri);
    return keep(/\.jpe?g$/iu.test(fileName) ? await asJpeg(blob) : blob);
  },
  async exists(uri) {
    if (blobs.has(uri)) return true;
    // Camera and picker results on the web are `data:` or `blob:` URLs that never went through `persist`.
    if (!uri.startsWith("data:") && !uri.startsWith("blob:")) return false;
    try {
      return (await blobFor(uri)).size > 0;
    } catch {
      return false;
    }
  },
  async size(uri) {
    return (await blobFor(uri)).size;
  },
  async remove(uri) {
    if (blobs.delete(uri)) URL.revokeObjectURL(uri);
  },
  async slice(uri, offset, length) {
    return keep((await blobFor(uri)).slice(offset, offset + length));
  },
  async upload(url, uri, options) {
    const response = await fetch(sameOrigin(url), {
      method: "PUT",
      headers: { "Content-Type": options.mimeType, ...(options.headers ?? {}) },
      body: await blobFor(uri),
    });
    const headers: Record<string, string> = {};
    response.headers.forEach((value, name) => {
      headers[name] = value;
    });
    return { status: response.status, headers, body: await response.text() };
  },
  async freeBytes() {
    return 8 * 1024 * 1024 * 1024;
  },
  async writeTemp(fileName, base64) {
    const type = fileName.endsWith(".png") ? "image/png" : "application/octet-stream";
    return keep(new Blob([base64ToBytes(base64)], { type }));
  },
};
