import { existsSync } from "node:fs";
import path from "node:path";

/** The product video and its captions are produced separately and dropped into public/video. */
export const DEMO_VIDEO_FILES = {
  src: "/video/agrorende-demo-pt-BR.mp4",
  captions: "/video/agrorende-demo-pt-BR.vtt",
  poster: "/video/agrorende-demo-pt-BR.jpg",
} as const;

function publicFileExists(publicPath: string): boolean {
  return existsSync(path.join(process.cwd(), "public", publicPath));
}

/** Read at build time: the static export only links to or ships a player when the video file is there. */
export function hasDemoVideo(): boolean {
  return publicFileExists(DEMO_VIDEO_FILES.src);
}
