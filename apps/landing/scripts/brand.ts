/**
 * Rasterises the AgroRende brand SVGs in packages/design-tokens/brand into the icons that
 * the site, the admin web app and the mobile app ship. Run with `pnpm --filter landing brand`
 * after packages/design-tokens/brand/generate.py has changed an SVG.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const brand = join(root, "packages/design-tokens/brand");
const source = (name: string): Buffer => readFileSync(join(brand, name));

async function png(svg: string, size: number, out: string, height = size): Promise<Buffer> {
  const buffer = await sharp(source(svg), { density: 600 }).resize(size, height).png().toBuffer();
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, buffer);
  return buffer;
}

/** An ICO file whose entries are PNG images, which every current browser accepts. */
async function ico(svg: string, sizes: readonly number[], out: string): Promise<void> {
  const images = await Promise.all(sizes.map((size) => sharp(source(svg), { density: 600 }).resize(size, size).png().toBuffer()));
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach((image, index) => {
    const size = sizes[index] ?? 0;
    const entry = 6 + 16 * index;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(image.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += image.length;
  });
  writeFileSync(out, Buffer.concat([header, ...images]));
}

const site = join(root, "apps/landing/public");
const web = join(root, "apps/web/src/app");
const mobile = join(root, "apps/mobile/assets/images");

mkdirSync(join(site, "brand"), { recursive: true });
copyFileSync(join(brand, "agrorende-mark.svg"), join(site, "icon.svg"));
copyFileSync(join(brand, "agrorende-logo.svg"), join(site, "brand/agrorende-logo.svg"));
copyFileSync(join(brand, "agrorende-logo-dark.svg"), join(site, "brand/agrorende-logo-dark.svg"));
await png("agrorende-mark.svg", 192, join(site, "icon-192.png"));
await png("agrorende-mark.svg", 512, join(site, "icon-512.png"));
await png("agrorende-mark.svg", 180, join(site, "apple-touch-icon.png"));
await ico("agrorende-mark.svg", [16, 32, 48], join(site, "favicon.ico"));

copyFileSync(join(brand, "agrorende-mark.svg"), join(web, "icon.svg"));
await png("agrorende-mark.svg", 180, join(web, "apple-icon.png"));
await ico("agrorende-mark.svg", [16, 32, 48], join(web, "favicon.ico"));

await png("app-icon.svg", 1024, join(mobile, "icon.png"));
await png("adaptive-foreground.svg", 1024, join(mobile, "adaptive-icon.png"));
await png("splash-icon.svg", 1024, join(mobile, "splash-icon.png"));
await png("agrorende-logo.svg", 888, join(mobile, "logo.png"), 192);
await png("agrorende-logo-dark.svg", 888, join(mobile, "logo-dark.png"), 192);

console.log("brand assets written");
