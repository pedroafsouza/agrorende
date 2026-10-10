/*
 * Generated assets: the fake camera feed (a drawn tractor with a leaking hose, so the "photo" in the demo
 * is ours and not a downloaded image) and the phone bezel overlay used by the composer.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { launch, renderHtml } from "./lib/browser.ts";
import { brand, paths, PHONE } from "./config.ts";

export const TRACTOR_PNG = join(paths.assets, "tractor.png");
export const CAMERA_FEED = join(paths.assets, "camera-feed.y4m");
export const PHONE_BEZEL = join(paths.assets, "phone-bezel.png");

/** Phone frame geometry inside the 1920x1080 video, in output pixels. */
export const PHONE_FRAME = (() => {
  const screenH = 900;
  const screenW = Math.round((screenH * PHONE.width) / PHONE.height);
  const border = 16;
  return { screenW, screenH, border, frameW: screenW + border * 2, frameH: screenH + border * 2, radius: 54 };
})();

const tractorSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="960" viewBox="0 0 1280 960">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8EC5F0"/><stop offset="1" stop-color="#DCEFFB"/></linearGradient>
    <linearGradient id="field" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9BBF5A"/><stop offset="1" stop-color="#6E8F35"/></linearGradient>
    <linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3FA34D"/><stop offset="1" stop-color="#257A33"/></linearGradient>
    <radialGradient id="puddle" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#2B2116" stop-opacity=".85"/><stop offset="1" stop-color="#2B2116" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1280" height="960" fill="url(#sky)"/>
  <circle cx="1080" cy="150" r="70" fill="#FFF3C4" opacity=".9"/>
  <path d="M0 470 Q 320 400 640 450 T 1280 430 L1280 960 L0 960 Z" fill="#7FA046"/>
  <path d="M0 520 L1280 500 L1280 960 L0 960 Z" fill="url(#field)"/>
  ${Array.from({ length: 14 }, (_, i) => `<path d="M${-200 + i * 120} 960 L${560 + i * 18} 520" stroke="#5E7C2C" stroke-width="6" opacity=".45"/>`).join("")}
  <ellipse cx="610" cy="800" rx="210" ry="38" fill="url(#puddle)"/>
  <ellipse cx="650" cy="790" rx="420" ry="40" fill="#000" opacity=".18"/>
  <!-- tractor -->
  <rect x="330" y="470" width="420" height="170" rx="22" fill="url(#body)"/>
  <rect x="700" y="510" width="230" height="130" rx="18" fill="url(#body)"/>
  <rect x="905" y="520" width="34" height="110" rx="8" fill="#1F5F29"/>
  ${Array.from({ length: 6 }, (_, i) => `<rect x="${730 + i * 30}" y="535" width="16" height="80" rx="4" fill="#1C4F23" opacity=".55"/>`).join("")}
  <rect x="360" y="300" width="250" height="185" rx="16" fill="none" stroke="#1C1F23" stroke-width="16"/>
  <rect x="368" y="308" width="234" height="169" rx="12" fill="#BFE3F5" opacity=".55"/>
  <rect x="340" y="282" width="290" height="30" rx="10" fill="#FFD43B"/>
  <rect x="840" y="400" width="22" height="120" rx="6" fill="#3A3F45"/>
  <rect x="834" y="390" width="34" height="18" rx="5" fill="#1C1F23"/>
  <text x="560" y="600" font-family="Arial, sans-serif" font-weight="700" font-size="40" fill="#FFD43B">6110J</text>
  <!-- wheels -->
  <circle cx="440" cy="690" r="150" fill="#1C1F23"/>
  <circle cx="440" cy="690" r="112" fill="#2C3036"/>
  ${Array.from({ length: 18 }, (_, i) => { const a = (i / 18) * Math.PI * 2; return `<rect x="${440 + Math.cos(a) * 140 - 10}" y="${690 + Math.sin(a) * 140 - 18}" width="20" height="36" rx="5" fill="#111" transform="rotate(${(a * 180) / Math.PI + 90} ${440 + Math.cos(a) * 140} ${690 + Math.sin(a) * 140})"/>`; }).join("")}
  <circle cx="440" cy="690" r="62" fill="#FFD43B"/>
  <circle cx="440" cy="690" r="22" fill="#B8860B"/>
  <circle cx="840" cy="715" r="92" fill="#1C1F23"/>
  <circle cx="840" cy="715" r="66" fill="#2C3036"/>
  <circle cx="840" cy="715" r="38" fill="#FFD43B"/>
  <circle cx="840" cy="715" r="13" fill="#B8860B"/>
  <!-- leaking hydraulic hose -->
  <path d="M600 600 C 640 680, 700 640, 690 720" stroke="#111" stroke-width="16" fill="none" stroke-linecap="round"/>
  <path d="M690 720 q 6 30 -4 60" stroke="#3B2A14" stroke-width="7" fill="none" opacity=".8"/>
  <circle cx="686" cy="790" r="7" fill="#3B2A14" opacity=".85"/>
  <circle cx="676" cy="770" r="4" fill="#3B2A14" opacity=".75"/>
  <!-- inspection tag -->
  <g transform="translate(980 300) rotate(4)">
    <rect width="230" height="96" rx="14" fill="#fff" stroke="${brand.terra600}" stroke-width="6"/>
    <text x="115" y="44" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="30" fill="${brand.graphite900}">AGR-000012</text>
    <text x="115" y="78" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" fill="${brand.graphite700}">Talhão 2</text>
  </g>
</svg>`;

function phoneBezelHtml(): string {
  const f = PHONE_FRAME;
  return `<!doctype html><html><body style="margin:0;background:transparent">
  <div style="position:absolute;left:0;top:0;width:${f.frameW}px;height:${f.frameH}px;box-sizing:border-box;border:${f.border}px solid #111418;border-radius:${f.radius}px;
    box-shadow: inset 0 0 0 2px #2c3138"></div>
  <div style="position:absolute;left:${f.frameW / 2 - 60}px;top:${f.border + 10}px;width:120px;height:30px;border-radius:16px;background:#111418"></div>
  <svg width="${f.frameW}" height="${f.frameH}" style="position:absolute;left:0;top:0">
    <defs><mask id="m"><rect width="100%" height="100%" fill="white"/><rect x="${f.border}" y="${f.border}" width="${f.screenW}" height="${f.screenH}" rx="${f.radius - f.border}" fill="black"/></mask></defs>
    <rect width="100%" height="100%" fill="#111418" mask="url(#m)" rx="${f.radius}"/>
  </svg></body></html>`;
}

export async function buildAssets(force = false): Promise<void> {
  const browser = await launch();
  try {
    if (force || !existsSync(TRACTOR_PNG)) {
      await renderHtml(browser, `<!doctype html><html><body style="margin:0">${tractorSvg}</body></html>`, TRACTOR_PNG, { width: 1280, height: 960 });
    }
    if (force || !existsSync(PHONE_BEZEL)) {
      await renderHtml(browser, phoneBezelHtml(), PHONE_BEZEL, { width: PHONE_FRAME.frameW, height: PHONE_FRAME.frameH }, true);
    }
  } finally {
    await browser.close();
  }
  if (force || !existsSync(CAMERA_FEED)) {
    // A slow hand-held drift so the viewfinder looks alive; Chromium loops the file as the fake webcam.
    execFileSync("ffmpeg", [
      "-y", "-loglevel", "error", "-loop", "1", "-i", TRACTOR_PNG, "-t", "4",
      "-vf", "scale=1440:1080,zoompan=z='1.08+0.02*sin(on/12)':x='iw/2-(iw/zoom/2)+12*sin(on/9)':y='ih/2-(ih/zoom/2)+8*cos(on/11)':d=1:s=640x480:fps=15,format=yuv420p",
      "-f", "yuv4mpegpipe", CAMERA_FEED,
    ]);
  }
}
