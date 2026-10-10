/*
 * Shared settings for the demo video pipeline (`docs/DEMO-VIDEO.md`).
 *
 * Every URL can be overridden with an environment variable so the pipeline also works against a stack
 * that runs on other ports.
 */
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

function findRoot(start: string): string {
  let dir = resolve(start);
  while (!existsSync(join(dir, "pnpm-workspace.yaml"))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error("Run the demo video pipeline from inside the AgroRende workspace.");
    dir = parent;
  }
  return dir;
}

export const ROOT = findRoot(process.cwd());
export const OUT_DIR = join(ROOT, ".data", "video");
export const WORK_DIR = join(OUT_DIR, "work");

export const paths = {
  root: ROOT,
  out: OUT_DIR,
  work: WORK_DIR,
  assets: join(WORK_DIR, "assets"),
  tts: join(WORK_DIR, "tts"),
  raw: join(WORK_DIR, "raw"),
  clips: join(WORK_DIR, "clips"),
  logs: join(WORK_DIR, "logs"),
  marks: join(WORK_DIR, "raw", "marks.json"),
  finalMp4: join(OUT_DIR, "agrorende-demo-pt-BR.mp4"),
  finalVtt: join(OUT_DIR, "agrorende-demo-pt-BR.vtt"),
  landingDir: join(ROOT, "apps", "landing", "public", "video"),
  logoSvg: join(ROOT, "packages", "design-tokens", "brand", "agrorende-logo.svg"),
  markSvg: join(ROOT, "packages", "design-tokens", "brand", "agrorende-mark.svg"),
  lottieDir: join(ROOT, "packages", "motion", "lottie"),
  lottiePlayer: join(ROOT, "node_modules", "lottie-web", "build", "player", "lottie_light.min.js"),
} as const;

export const urls = {
  landing: process.env.DEMO_LANDING_URL ?? "http://localhost:3300",
  admin: process.env.DEMO_ADMIN_URL ?? "http://localhost:3000",
  mobile: process.env.DEMO_MOBILE_URL ?? "http://localhost:8081",
  oidc: process.env.DEMO_OIDC_URL ?? "http://localhost:4003",
} as const;

export const PASSWORD = process.env.DEMO_PASSWORD ?? "agrorende123";

export const brand = {
  mata600: "#2B8A3E",
  mata700: "#237032",
  mata50: "#EBFBEE",
  terra600: "#E8590C",
  graphite900: "#1C1F23",
  graphite700: "#3A3F45",
  white: "#FFFFFF",
} as const;

/** Final video geometry. */
export const VIDEO = { width: 1920, height: 1080, fps: 30 } as const;
/** Admin web browser geometry; recorded at 1920x1080 so text stays readable at 1.25x. */
export const ADMIN_VIEWPORT = { width: 1536, height: 864 } as const;
/** Phone geometry used for the Expo web app. */
export const PHONE = { width: 390, height: 844, scale: 2 } as const;

export function ensureDirs(): void {
  for (const dir of [paths.out, paths.work, paths.assets, paths.tts, paths.raw, paths.clips, paths.logs]) mkdirSync(dir, { recursive: true });
}
