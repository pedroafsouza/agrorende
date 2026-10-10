import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

export const PHOTO_MAX_EDGE = 2048;
export const PHOTO_QUALITY = 0.8;
export const THUMB_EDGE = 320;

export interface ProcessedPhoto {
  readonly uri: string;
  readonly width: number;
  readonly height: number;
  readonly thumbUri: string;
}

function fit(width: number, height: number, maxEdge: number): { width?: number; height?: number } {
  if (Math.max(width, height) <= maxEdge) return {};
  return width >= height ? { width: maxEdge } : { height: maxEdge };
}

/** Photo processing of §7.7 step 2: 2048 px JPEG q0.8 plus a 320 px thumbnail. */
export async function processPhoto(uri: string, width: number, height: number): Promise<ProcessedPhoto> {
  const main = await ImageManipulator.manipulate(uri).resize(fit(width, height, PHOTO_MAX_EDGE)).renderAsync();
  const saved = await main.saveAsync({ format: SaveFormat.JPEG, compress: PHOTO_QUALITY });
  const thumbRef = await ImageManipulator.manipulate(saved.uri).resize(fit(saved.width, saved.height, THUMB_EDGE)).renderAsync();
  const thumb = await thumbRef.saveAsync({ format: SaveFormat.JPEG, compress: 0.7 });
  return { uri: saved.uri, width: saved.width, height: saved.height, thumbUri: thumb.uri };
}

/** Video poster of §7.7 step 2: the first-second frame, 320 px JPEG, uploaded as the `poster` variant. */
export async function processVideoPoster(uri: string): Promise<string> {
  const { createVideoPlayer } = await import("expo-video");
  const player = createVideoPlayer(uri);
  try {
    const [frame] = await player.generateThumbnailsAsync(1, { maxWidth: THUMB_EDGE, maxHeight: THUMB_EDGE });
    if (frame === undefined) throw new Error("no poster frame");
    const rendered = await ImageManipulator.manipulate(frame).renderAsync();
    const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.7 });
    return saved.uri;
  } finally {
    player.release();
  }
}
