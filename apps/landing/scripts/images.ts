/**
 * Generates every raster asset of the public site from the SVG sources in `assets/`
 * (ARCHITECTURE §22.2). Static export cannot use the Next image optimizer, so this script
 * writes AVIF and WebP at three widths into `public/img/`, the Open Graph cards per locale,
 * the favicon set and `src/lib/images.generated.ts`, which the <Picture> component reads.
 *
 * Run with `pnpm --filter landing images`. The outputs are committed so `next build` never needs sharp.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import enSite from "../messages/en/site.json";
import ptSite from "../messages/pt-BR/site.json";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const assets = join(root, "assets");
const publicDir = join(root, "public");

export const IMAGE_WIDTHS = [640, 1024, 1600] as const;

interface Source {
  readonly name: string;
  readonly file: string;
  readonly width: number;
  readonly height: number;
}

const SOURCES: readonly Source[] = [
  { name: "hero-field", file: "hero-field.svg", width: 1600, height: 1000 },
  { name: "feature-f1", file: "feature-f1.svg", width: 1200, height: 800 },
  { name: "feature-f2", file: "feature-f2.svg", width: 1200, height: 800 },
  { name: "feature-f3", file: "feature-f3.svg", width: 1200, height: 800 },
  { name: "feature-f4", file: "feature-f4.svg", width: 1200, height: 800 },
  { name: "feature-f5", file: "feature-f5.svg", width: 1200, height: 800 },
];

interface ManifestEntry {
  width: number;
  height: number;
  color: string;
  avif: { src: string; width: number }[];
  webp: { src: string; width: number }[];
}

function hex(value: number): string {
  return Math.round(value).toString(16).padStart(2, "0");
}

async function renderSource(source: Source): Promise<ManifestEntry> {
  const svg = await readFile(join(assets, source.file));
  const entry: ManifestEntry = { width: source.width, height: source.height, color: "#f1f3f5", avif: [], webp: [] };
  for (const width of IMAGE_WIDTHS) {
    const height = Math.round((width * source.height) / source.width);
    const density = Math.max(72, Math.ceil((72 * width) / source.width));
    const base = sharp(svg, { density }).resize(width, height, { fit: "cover" });
    const avifName = `${source.name}-${width}.avif`;
    const webpName = `${source.name}-${width}.webp`;
    await base.clone().avif({ quality: 55, effort: 6 }).toFile(join(publicDir, "img", avifName));
    await base.clone().webp({ quality: 74 }).toFile(join(publicDir, "img", webpName));
    entry.avif.push({ src: `/img/${avifName}`, width });
    entry.webp.push({ src: `/img/${webpName}`, width });
  }
  const { dominant } = await sharp(svg).stats();
  entry.color = `#${hex(dominant.r)}${hex(dominant.g)}${hex(dominant.b)}`;
  return entry;
}

function escapeXml(value: string): string {
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
}

async function renderOg(locale: "pt-br" | "en", logo: string): Promise<void> {
  const messages = locale === "en" ? enSite : ptSite;
  const heroPng = await sharp(await readFile(join(assets, "hero-field.svg")))
    .resize(520, 630, { fit: "cover", position: "right" })
    .png()
    .toBuffer();
  const logoInner = logo.replace(/^[\s\S]*?<svg[^>]*>/u, "").replace(/<\/svg>\s*$/u, "");
  const card = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#FFFFFF"/>
  <rect x="680" y="0" width="520" height="630" fill="#F1F3F5"/>
  <g transform="translate(72 72) scale(1.25)">${logoInner}</g>
  <text x="168" y="128" font-family="Helvetica, Arial, sans-serif" font-size="44" font-weight="700" fill="#1C1F23">AgroRende</text>
  <rect x="72" y="214" width="56" height="6" rx="3" fill="#E8590C"/>
  <text font-family="Helvetica, Arial, sans-serif" font-weight="700" fill="#1C1F23" font-size="56">
    <tspan x="72" y="300">${escapeXml(messages.home.heroTitle)}</tspan>
  </text>
  <text font-family="Helvetica, Arial, sans-serif" font-weight="700" fill="#237032" font-size="56">
    <tspan x="72" y="372">${escapeXml(messages.home.heroSubtitle)}</tspan>
  </text>
  <text x="72" y="540" font-family="Helvetica, Arial, sans-serif" font-size="28" fill="#3D434B">${escapeXml(messages.cta.primary)}</text>
</svg>`;
  await sharp(Buffer.from(card))
    .composite([{ input: heroPng, left: 680, top: 0 }])
    .png({ compressionLevel: 9 })
    .toFile(join(publicDir, "og", `${locale}.png`));
}

/** An ICO file may embed a PNG image directly (Windows Vista and later, every current browser). */
function pngToIco(png: Buffer, size: number): Buffer {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt8(size >= 256 ? 0 : size, 6);
  header.writeUInt8(size >= 256 ? 0 : size, 7);
  header.writeUInt8(0, 8);
  header.writeUInt8(0, 9);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  return Buffer.concat([header, png]);
}

async function renderIcons(logo: string): Promise<void> {
  const svg = Buffer.from(logo);
  await writeFile(join(publicDir, "icon.svg"), logo);
  const favicon = await sharp(svg, { density: 144 }).resize(32, 32).png().toBuffer();
  await writeFile(join(publicDir, "favicon.ico"), pngToIco(favicon, 32));
  const padded = await sharp(svg, { density: 400 }).resize(148, 148).png().toBuffer();
  await sharp({ create: { width: 180, height: 180, channels: 4, background: "#FFFFFF" } })
    .composite([{ input: padded, left: 16, top: 16 }])
    .png()
    .toFile(join(publicDir, "apple-touch-icon.png"));
  await sharp(svg, { density: 400 }).resize(192, 192).png().toFile(join(publicDir, "icon-192.png"));
}

async function main(): Promise<void> {
  await mkdir(join(publicDir, "img"), { recursive: true });
  await mkdir(join(publicDir, "og"), { recursive: true });
  const manifest: Record<string, ManifestEntry> = {};
  for (const source of SOURCES) {
    manifest[source.name] = await renderSource(source);
    console.log(`images: ${source.name}`);
  }
  const logo = await readFile(join(assets, "logo.svg"), "utf8");
  await renderOg("pt-br", logo);
  await renderOg("en", logo);
  await renderIcons(logo);
  const body = `// Generated by scripts/images.ts. Do not edit by hand; run \`pnpm --filter landing images\`.
export interface ImageSource {
  readonly src: string;
  readonly width: number;
}

export interface ImageEntry {
  readonly width: number;
  readonly height: number;
  readonly color: string;
  readonly avif: readonly ImageSource[];
  readonly webp: readonly ImageSource[];
}

export const IMAGES = ${JSON.stringify(manifest, null, 2)} as const satisfies Record<string, ImageEntry>;

export type ImageName = keyof typeof IMAGES;
`;
  await writeFile(join(root, "src", "lib", "images.generated.ts"), body);
  console.log("images: done");
}

await main();
