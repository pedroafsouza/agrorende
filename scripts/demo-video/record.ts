/*
 * Recorders: drive the real apps with Playwright and record one video per session.
 *
 * Each session writes `raw/<source>.webm` and adds its scene marks (seconds from the start of that
 * video) to `raw/marks.json`. A scene shows the stretch between `<mark>` and `<mark>/end`. After the
 * actions of a scene, the recorder holds the screen until the narration of that scene has had time
 * to play, so the composer rarely needs to speed anything up.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";

import type { Browser, BrowserContext, Page } from "playwright";

import { CAMERA_FEED } from "./assets.ts";
import { paths, PASSWORD, ROOT, urls } from "./config.ts";
import { click, createClock, launch, prepare, smoothScroll, tap, typeInto, writeJson, type Clock } from "./lib/browser.ts";
import { allScenes } from "./script.pt-BR.ts";
import type { SceneAudio } from "./tts.ts";

export const DESKTOP = { width: 1536, height: 864 } as const;
export const PHONE = { width: 390, height: 844 } as const;

type Marks = Record<string, Record<string, number>>;

function loadMarks(): Marks {
  return existsSync(paths.marks) ? (JSON.parse(readFileSync(paths.marks, "utf8")) as Marks) : {};
}

function sceneDurations(): Map<string, number> {
  const audio = JSON.parse(readFileSync(join(paths.tts, "durations.json"), "utf8")) as SceneAudio[];
  const byId = new Map(audio.map((a) => [a.id, a.duration]));
  const result = new Map<string, number>();
  for (const scene of allScenes()) {
    const v = scene.visual;
    const duration = byId.get(scene.id) ?? 8;
    if (v.kind === "clip" || v.kind === "phone") result.set(`${v.source}:${v.mark}`, duration);
    if (v.kind === "split") {
      result.set(`${v.phone}:${v.mark}`, duration);
      result.set(`${v.office}:${v.mark}`, duration);
    }
  }
  return result;
}

class Session {
  readonly clock: Clock;
  constructor(
    readonly source: string,
    readonly context: BrowserContext,
    readonly page: Page,
    private readonly durations: Map<string, number>,
  ) {
    this.clock = createClock();
  }

  start(mark: string): void {
    this.clock.mark(mark);
  }

  /** Waits until the scene has lasted as long as its narration, then closes the scene. */
  async hold(mark: string, extra = 0): Promise<void> {
    const want = (this.durations.get(`${this.source}:${mark}`) ?? 6) + extra;
    const started = this.clock.marks[mark] ?? 0;
    const elapsed = (Date.now() - this.clock.t0) / 1000 - started;
    if (elapsed < want) await this.page.waitForTimeout((want - elapsed) * 1000);
    this.clock.mark(`${mark}/end`);
  }

  async finish(): Promise<void> {
    const video = this.page.video();
    await this.context.close();
    if (video !== null) {
      const tmp = await video.path();
      renameSync(tmp, join(paths.raw, `${this.source}.webm`));
    }
    const marks = loadMarks();
    marks[this.source] = this.clock.marks;
    writeJson(paths.marks, marks);
  }
}

const PHONE_ARGS = [
  "--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests",
  "--use-fake-ui-for-media-stream",
  "--use-fake-device-for-media-stream",
  `--use-file-for-fake-video-capture=${CAMERA_FEED}`,
];

async function desktopContext(browser: Browser, record: boolean): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: DESKTOP,
    deviceScaleFactor: 1.25,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    ...(record ? { recordVideo: { dir: paths.raw, size: DESKTOP } } : {}),
  });
  await context.route(/\/api\/v1\/media\/[^/]+\/blob(\?|$)/u, async (route) => {
    const res = await route.fetch();
    if (res.ok()) {
      await route.fulfill({ response: res });
      return;
    }
    // The admin gallery requests blobs without a media token and gets 403, and the field app never
    // uploads thumbnails (see docs/DEMO-VIDEO.md), so the recorder serves the stored original straight from the local media folder instead.
    const id = /\/media\/([^/]+)\/blob/u.exec(route.request().url())?.[1] ?? "";
    const file = findStoredMedia(id);
    if (file === undefined) {
      await route.fulfill({ response: res });
      return;
    }
    await route.fulfill({ status: 200, contentType: "image/jpeg", body: readFileSync(file) });
  });
  await prepare(context);
  context.setDefaultTimeout(90_000);
  return context;
}

/** Finds `<id>.jpg` under the local media folder (MEDIA_ROOT, default `.data/media`). */
function findStoredMedia(id: string): string | undefined {
  if (id === "") return undefined;
  const root = join(process.env.MEDIA_ROOT ?? join(ROOT, ".data", "media"), "org");
  if (!existsSync(root)) return undefined;
  const entries = readdirSync(root, { recursive: true, encoding: "utf8" });
  const hit = entries.find((entry) => entry.endsWith(`${id}.jpg`));
  return hit === undefined ? undefined : join(root, hit);
}

async function phoneContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: PHONE,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    permissions: ["geolocation", "camera", "microphone"],
    geolocation: { latitude: -21.335, longitude: -47.73 },
    recordVideo: { dir: paths.raw, size: PHONE },
  });
  const mobileOrigin = new URL(urls.mobile).origin;
  await context.route(
    (u) => u.origin === mobileOrigin && !u.pathname.includes(".") && !u.pathname.startsWith("/api/"),
    async (route) => {
      const res = await route.fetch();
      await route.fulfill({
        response: res,
        headers: { ...res.headers(), "cross-origin-opener-policy": "same-origin", "cross-origin-embedder-policy": "credentialless" },
      });
    },
  );
  await prepare(context);
  return context;
}

async function adminLogin(context: BrowserContext, email: string): Promise<void> {
  await context.addCookies([{ name: "NEXT_LOCALE", value: "pt-BR", url: urls.admin }]);
  const res = await context.request.post(`${urls.admin}/api/v1/auth/login`, { data: { email, password: PASSWORD } });
  if (!res.ok()) throw new Error(`Admin login failed for ${email}: ${res.status()}`);
}

async function settle(page: Page, ms = 1200): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => undefined);
  await page.waitForTimeout(ms);
}

/** Opens the admin pages once without recording so the dev server has compiled them. */
export async function warmAdmin(browser: Browser): Promise<void> {
  const context = await desktopContext(browser, false);
  await adminLogin(context, "despacho@agrorende.dev");
  const page = await context.newPage();
  for (const route of ["/ops", "/attention", "/reports", "/work-orders", "/assets", "/rentals", "/costs", "/signup", "/signup/company", "/getting-started", "/team"]) {
    await page.goto(`${urls.admin}${route}`, { waitUntil: "load", timeout: 180_000 }).catch(() => undefined);
    await settle(page, 300);
  }
  await context.close();
  const landing = await browser.newPage();
  await landing.goto(`${urls.landing}/pt-BR/`, { waitUntil: "load", timeout: 180_000 }).catch(() => undefined);
  await landing.close();
}

async function mobileLogin(page: Page, email: string): Promise<void> {
  await page.goto(`${urls.mobile}/`, { waitUntil: "load", timeout: 240_000 });
  await page.getByLabel("E-mail").waitFor({ timeout: 60_000 });
  await page.waitForTimeout(800);
  await typeInto(page, page.getByLabel("E-mail"), email, 30);
  await typeInto(page, page.getByLabel("Senha"), PASSWORD, 30);
  await tap(page, page.getByText("Entrar", { exact: true }));
  await page.getByRole("button", { name: /Pular|Próximo|Começar/ }).first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(800);
}

/* ------------------------------------------------------------------------------------------------ */

async function recordLanding(browser: Browser, d: Map<string, number>): Promise<void> {
  const context = await desktopContext(browser, true);
  const page = await context.newPage();
  const s = new Session("landing", context, page, d);
  await page.goto(`${urls.landing}/pt-BR/`, { waitUntil: "load", timeout: 240_000 });
  await settle(page, 1500);
  s.start("hero");
  await page.mouse.move(700, 500);
  await page.waitForTimeout(4000);
  await smoothScroll(page, 260, 2500);
  await s.hold("hero");
  s.start("jobs");
  await page.locator("#steps-title").evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "start" }));
  await page.waitForTimeout(7000);
  await page.locator("#mission-title").evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
  await s.hold("jobs");
  await s.finish();
}

async function recordSignup(browser: Browser, d: Map<string, number>): Promise<void> {
  const context = await desktopContext(browser, true);
  await context.addCookies([{ name: "NEXT_LOCALE", value: "pt-BR", url: urls.admin }]);
  const page = await context.newPage();
  const s = new Session("signup", context, page, d);
  const stamp = Date.now().toString(36);
  await page.goto(`${urls.admin}/signup`, { waitUntil: "load", timeout: 120_000 });
  await settle(page);
  s.start("signup");
  await page.waitForTimeout(2500);
  await click(page, page.getByText("Continuar com Google"));
  await page.waitForURL(/4003/, { timeout: 60_000 });
  await settle(page, 600);
  await typeInto(page, page.locator("input[type=text], input:not([type])").first(), `dona-${stamp}`, 40);
  await page.locator("textarea").fill(JSON.stringify({ email: `dona.${stamp}@dourada.dev`, email_verified: true, name: "Dona Dourada" }));
  await page.waitForTimeout(1200);
  await click(page, page.locator("input[type=submit]"));
  await page.waitForURL(/signup\/company/, { timeout: 120_000 });
  await settle(page, 800);
  await s.hold("signup");

  s.start("company");
  await typeInto(page, page.locator("input[name=name]"), "Locadora Dourada", 45);
  await typeInto(page, page.locator("input[name=officePhone]"), "+55 16 99999-0101", 35);
  await typeInto(page, page.locator("input[name=taxId]"), "11.222.333/0001-81", 35);
  await typeInto(page, page.locator("input[name=city]"), "Ribeirão Preto", 45);
  await page.locator("select[name=state]").selectOption("SP");
  await click(page, page.locator("input[name=acceptTerms]"));
  await click(page, page.getByRole("button", { name: /Criar conta/ }));
  await page.waitForURL((u) => !u.pathname.startsWith("/signup"), { timeout: 180_000 });
  if (!page.url().includes("/getting-started")) await page.goto(`${urls.admin}/getting-started`, { waitUntil: "load", timeout: 240_000 });
  await settle(page, 1000);
  await s.hold("company");

  s.start("guide1");
  await page.waitForTimeout(3500);
  await page.mouse.move(600, 400);
  await s.hold("guide1", -1.5);
  await click(page, page.getByRole("button", { name: "Começar" }));
  await settle(page, 800);

  s.start("guide2");
  await typeInto(page, page.locator("main input[name=name]"), "Trator John Deere 6110J", 50);
  const category = page.locator("main select[name=category]");
  const options = await category.locator("option").evaluateAll((os) => os.map((o) => ({ v: (o as HTMLOptionElement).value, t: o.textContent ?? "" })));
  const tractor = options.find((o) => /trator/i.test(o.t)) ?? options.find((o) => o.v !== "");
  if (tractor) await category.selectOption(tractor.v);
  await page.waitForTimeout(1500);
  await click(page, page.getByRole("button", { name: "Salvar máquina" }));
  await settle(page, 1200);
  await s.hold("guide2");

  s.start("guide3");
  await typeInto(page, page.locator("main input[name=name]"), "Tiago Campo", 50);
  await typeInto(page, page.locator("main input[name=phone]"), "16 98888-7777", 50);
  await click(page, page.getByRole("button", { name: "Criar convite" }));
  await settle(page, 1500);
  await s.hold("guide3", -1.5);
  await click(page, page.getByRole("button", { name: "Continuar", exact: true }));
  await settle(page, 800);

  s.start("guide4");
  await typeInto(page, page.locator("main input[name=title]"), "Revisão de 500 horas", 50);
  const selects = page.locator("main select");
  const machineSelect = selects.nth((await selects.count()) - 1);
  await machineSelect.selectOption({ index: 1 }).catch(() => undefined);
  await page.waitForTimeout(1200);
  await click(page, page.getByRole("button", { name: "Criar ordem de serviço" }));
  await settle(page, 1500);
  await s.hold("guide4");

  s.start("guide5");
  await page.waitForTimeout(5000);
  const ops = page.getByRole("link", { name: /Visão geral|Abrir visão geral|Ir para/ }).first();
  if (await ops.isVisible().catch(() => false)) {
    await click(page, ops);
  } else {
    await page.goto(`${urls.admin}/ops`, { waitUntil: "load", timeout: 240_000 });
  }
  await settle(page, 1500);
  await s.hold("guide5");
  await s.finish();
}

async function recordJoana(browser: Browser, d: Map<string, number>): Promise<void> {
  const phone = await phoneContext(browser);
  const page = await phone.newPage();
  const s = new Session("joana", phone, page, d);
  const office = await desktopContext(browser, true);
  await adminLogin(office, "despacho@agrorende.dev");
  const officePage = await office.newPage();
  const o = new Session("joanaOffice", office, officePage, d);
  await officePage.goto(`${urls.admin}/reports`, { waitUntil: "load", timeout: 120_000 });

  await mobileLogin(page, "inspetor@agrorende.dev");
  s.start("intro");
  await page.waitForTimeout(3500);
  await tap(page, page.getByRole("button", { name: /Próximo/ }).first()).catch(() => undefined);
  await page.waitForTimeout(3500);
  await tap(page, page.getByRole("button", { name: /Próximo/ }).first()).catch(() => undefined);
  await page.waitForTimeout(3500);
  await s.hold("intro", -1);
  await tap(page, page.getByRole("button", { name: /Começar|Pular|Próximo/ }).first());
  await page.waitForTimeout(2000);
  const skip = page.getByRole("button", { name: /Pular/ }).first();
  if (await skip.isVisible().catch(() => false)) await tap(page, skip);
  await page.getByRole("button", { name: /Relatar problema/ }).first().waitFor({ timeout: 60_000 });
  await phone.setOffline(true);
  await page.waitForTimeout(4000);

  s.start("report1");
  await page.waitForTimeout(1500);
  await tap(page, page.getByRole("button", { name: /Relatar problema/ }));
  await page.waitForTimeout(1500);
  await tap(page, page.getByRole("radio", { name: "Buscar" }));
  const search = page.locator("[data-testid=asset-search] input, input[data-testid=asset-search]").first();
  await typeInto(page, search, "000012", 120);
  await page.waitForTimeout(1500);
  await tap(page, page.locator("[data-testid^=asset-option-]"));
  await page.waitForTimeout(800);
  await tap(page, page.getByRole("button", { name: "Próximo" }));
  await page.waitForTimeout(1200);
  await tap(page, page.locator("[data-testid=media-open-camera]"));
  await page.waitForTimeout(3500);
  await tap(page, page.locator("[data-testid=camera-shutter]"));
  await page.waitForTimeout(3500);
  await s.hold("report1");

  s.start("report2");
  await tap(page, page.locator("[data-testid=report-wizard-next]"));
  await page.waitForTimeout(800);
  await tap(page, page.locator("[data-testid=report-category-HYDRAULIC]"));
  await tap(page, page.getByRole("radio", { name: /Alta/ }));
  await tap(page, page.getByRole("radio", { name: /Não/ }));
  await tap(page, page.locator("[data-testid=report-action-REPAIR_NOW]"));
  await typeInto(page, page.locator("[data-testid=report-title] input, input[data-testid=report-title]"), "Mangueira hidráulica vazando", 45);
  await typeInto(page, page.locator("[data-testid=report-description] textarea, textarea[data-testid=report-description]"), "Óleo pingando perto da roda traseira. Trator parado no Talhão 2.", 30);
  await tap(page, page.locator("[data-testid=report-wizard-next]"));
  await page.waitForTimeout(800);
  await tap(page, page.locator("[data-testid=report-locate]"));
  await page.waitForTimeout(2500);
  await s.hold("report2");

  s.start("saved");
  await tap(page, page.locator("[data-testid=report-wizard-next]"));
  await page.waitForTimeout(4000);
  await s.hold("saved");

  s.start("reconnect");
  o.start("reconnect");
  await phone.setOffline(false);
  await page.waitForTimeout(1500);
  await tap(page, page.locator("[data-testid^=sync-badge]:visible"));
  await page.waitForTimeout(1500);
  const sendNow = page.getByRole("button", { name: /Enviar agora/ }).first();
  if (await sendNow.isVisible().catch(() => false)) await tap(page, sendNow);
  await page.waitForTimeout(5000);
  await officePage.reload({ waitUntil: "load", timeout: 240_000 });
  await settle(officePage, 800);
  const row = officePage.locator("tr", { hasText: "Mangueira hidráulica vazando" }).first();
  await row.evaluate((el) => {
    (el as HTMLElement).style.outline = "3px solid #E8590C";
    (el as HTMLElement).style.background = "#FFF4E6";
  }).catch(() => undefined);
  await s.hold("reconnect");
  await o.hold("reconnect");
  await o.finish();
  await s.finish();
}

async function recordOffice(browser: Browser, d: Map<string, number>): Promise<string> {
  const context = await desktopContext(browser, true);
  await adminLogin(context, "despacho@agrorende.dev");
  const page = await context.newPage();
  const s = new Session("office", context, page, d);
  await page.goto(`${urls.admin}/ops`, { waitUntil: "load", timeout: 120_000 });
  await settle(page, 2500);
  s.start("ops");
  await page.mouse.move(500, 300);
  await page.waitForTimeout(3000);
  await page.mouse.move(1000, 500, { steps: 30 });
  await page.waitForTimeout(3000);
  await smoothScroll(page, 400, 2500);
  await page.waitForTimeout(3000);
  await smoothScroll(page, -400, 2000);
  await s.hold("ops", -1.5);
  await click(page, page.getByRole("link", { name: /Pendências/ }).first());
  await page.waitForURL(/attention/u, { timeout: 15_000 }).catch(async () => page.goto(`${urls.admin}/attention`, { waitUntil: "load", timeout: 240_000 }));
  await settle(page, 1000);

  s.start("attention");
  await page.waitForTimeout(3500);
  await click(page, page.getByRole("link", { name: /^Relatos/ }).first());
  await page.waitForURL(/reports/u, { timeout: 15_000 }).catch(async () => page.goto(`${urls.admin}/reports`, { waitUntil: "load", timeout: 240_000 }));
  await settle(page, 800);
  await page.locator("tr", { hasText: "Mangueira hidráulica vazando" }).first().hover().catch(() => undefined);
  await s.hold("attention", -1.5);
  await click(page, page.locator("tr", { hasText: "Mangueira hidráulica vazando" }).first());
  await page.waitForURL(/reports\/.+/);
  await page.getByRole("button", { name: "Encaminhar para reparo" }).first().waitFor({ timeout: 120_000 });
  await settle(page, 1500);

  s.start("report");
  await page.waitForTimeout(3000);
  await smoothScroll(page, 350, 2500);
  await page.waitForTimeout(3000);
  await smoothScroll(page, -350, 2000);
  await s.hold("report");

  s.start("dispatch");
  await click(page, page.getByRole("button", { name: "Encaminhar para reparo" }).first());
  await page.waitForTimeout(3000);
  await click(page, page.locator("dialog[open] button:visible", { hasText: "Carlos" }).first());
  await page.waitForTimeout(2500);
  await click(page, page.locator("dialog[open] button:visible", { hasText: "Criar OS" }));
  await page.waitForTimeout(3500);
  const link = await page.getByText(/WO-\d{6}/).first().textContent().catch(() => null);
  await s.hold("dispatch");
  await s.finish();
  return link?.match(/WO-\d{6}/)?.[0] ?? "";
}

async function recordCarlos(browser: Browser, d: Map<string, number>): Promise<void> {
  const context = await phoneContext(browser);
  const page = await context.newPage();
  const s = new Session("carlos", context, page, d);
  await mobileLogin(page, "tecnico1@agrorende.dev");
  await tap(page, page.getByRole("button", { name: /Pular/ }).first());
  await page.waitForTimeout(1500);
  const skip = page.getByRole("button", { name: /Pular/ }).first();
  if (await skip.isVisible().catch(() => false)) await tap(page, skip);
  await page.waitForTimeout(6000);

  s.start("accept");
  await tap(page, page.getByText("Serviços", { exact: true }).last());
  await page.waitForTimeout(2500);
  await tap(page, page.locator("[data-testid^=job-row-]:visible", { hasText: "Mangueira" }));
  await page.waitForTimeout(3500);
  await tap(page, page.locator("[data-testid=job-action-accept]:visible"));
  await page.waitForTimeout(2000);
  await s.hold("accept");

  s.start("route");
  await tap(page, page.locator("[data-testid=job-action-startRoute]:visible"));
  await page.locator("[data-testid=job-arrival-confirm]:visible").waitFor({ timeout: 30_000 }).catch(() => undefined);
  await page.waitForTimeout(3500);
  const confirm = page.locator("[data-testid=job-arrival-confirm]:visible");
  if (await confirm.isVisible().catch(() => false)) await tap(page, confirm);
  else await tap(page, page.locator("[data-testid=job-action-arrive]:visible"));
  await page.waitForTimeout(2000);
  await tap(page, page.locator("[data-testid=job-action-startWork]:visible"));
  await page.waitForTimeout(1500);
  await s.hold("route");

  s.start("parts");
  await tap(page, page.locator("[data-testid=job-open-parts]:visible"));
  await page.waitForTimeout(1500);
  await tap(page, page.locator("[data-testid=job-parts-add]:visible"));
  await page.waitForTimeout(800);
  await typeInto(page, page.locator("[data-testid=job-part-name]:visible"), 'Mangueira hidráulica 1/2"', 45);
  await typeInto(page, page.locator("[data-testid=job-part-cost]:visible"), "185,00", 120);
  await tap(page, page.locator("[data-testid=job-part-submit]:visible"));
  await page.waitForTimeout(2500);
  await s.hold("parts");
  await page.goBack();
  await page.waitForTimeout(1500);

  s.start("checklist");
  await tap(page, page.locator("[data-testid=job-open-checklist]:visible, [data-testid=job-checklist]:visible"));
  await page.waitForTimeout(1500);
  for (let i = 1; i <= 10; i += 1) {
    await tap(page, page.locator(`[data-testid=checklist-answer-item_${i}-PASS]:visible`), 120);
  }
  await page.waitForTimeout(800);
  await tap(page, page.locator("[data-testid=job-checklist-done]:visible"));
  await page.waitForTimeout(1500);
  await s.hold("checklist");

  s.start("complete");
  await tap(page, page.locator("[data-testid=job-open-complete]:visible"));
  await page.waitForTimeout(1500);
  await typeInto(page, page.locator("[data-testid=job-complete-resolution]:visible"), "Troquei a mangueira hidráulica e testei. Sem vazamento.", 30);
  await tap(page, page.locator("[data-testid=media-open-camera]:visible"));
  await page.waitForTimeout(3000);
  await tap(page, page.locator("[data-testid=camera-shutter]"));
  await page.waitForTimeout(3000);
  await tap(page, page.locator("[data-testid=media-tag-AFTER]:visible")).catch(() => undefined);
  await page.waitForTimeout(800);
  await typeInto(page, page.locator("[data-testid=job-complete-hour-meter]:visible"), "4312", 150);
  await s.hold("complete");

  s.start("signature");
  await typeInto(page, page.locator("[data-testid=signature-name]:visible"), "Seu Antônio", 60);
  await tap(page, page.locator("[data-testid=signature-open]:visible"));
  await page.waitForTimeout(1500);
  const canvas = page.locator("[data-testid=signature-web-canvas]:visible, [data-testid=signature-canvas] canvas").first();
  const box = await canvas.boundingBox();
  if (box !== null) await drawSignature(page, box);
  await page.waitForTimeout(1000);
  await tap(page, page.locator("[data-testid=signature-save]:visible"));
  await page.waitForTimeout(1500);
  await s.hold("signature");

  s.start("success");
  await tap(page, page.locator("[data-testid=job-complete-submit]:visible"));
  await page.locator("[data-testid=job-complete-done]").waitFor({ timeout: 30_000 }).catch(() => undefined);
  await page.waitForTimeout(1500);
  await s.hold("success");
  await s.finish();
}

/** A cursive-looking "Antônio" written in a few strokes on a portrait canvas. */
async function drawSignature(page: Page, box: { x: number; y: number; width: number; height: number }): Promise<void> {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const w = Math.min(box.width, box.height) * 0.8;
  const strokes: Array<Array<[number, number]>> = [];
  const main: Array<[number, number]> = [];
  for (let i = 0; i <= 90; i += 1) {
    const t = i / 90;
    const x = -0.45 + 0.9 * t;
    const loop = Math.sin(t * Math.PI * 7) * 0.09 * (1 - Math.abs(t - 0.5));
    const y = 0.05 * Math.sin(t * Math.PI * 2) - loop + (t < 0.12 ? (0.12 - t) * 1.2 : 0);
    main.push([x, y]);
  }
  strokes.push(main);
  strokes.push([[-0.3, -0.02], [-0.1, -0.05], [0.1, -0.06]]);
  strokes.push(Array.from({ length: 20 }, (_, i) => [0.1 + i * 0.018, 0.13 + 0.02 * Math.sin(i / 3)] as [number, number]));
  for (const stroke of strokes) {
    const [first, ...rest] = stroke;
    if (first === undefined) continue;
    await page.mouse.move(cx + first[0] * w, cy + first[1] * w);
    await page.mouse.down();
    for (const [x, y] of rest) {
      await page.mouse.move(cx + x * w, cy + y * w);
      await page.waitForTimeout(12);
    }
    await page.mouse.up();
    await page.waitForTimeout(200);
  }
}

/** Looks up a work order id by its number in the local MongoDB container (demo machine only). */
function findWorkOrderId(number: string): string {
  const container = process.env.DEMO_MONGO_CONTAINER ?? "pedro-souza-expert-giggle-mongo-1";
  const out = execFileSync("docker", ["exec", container, "mongosh", "agrorende", "--quiet", "--eval", `print(db.work_orders.findOne({ number: "${number}" })?._id ?? "")`], { encoding: "utf8" }).trim();
  if (out === "") throw new Error(`Work order ${number} not found; record "office" and "carlos" first.`);
  return out;
}

/** Waits until the admin page has no loading skeletons or "Carregando" indicators left (slow dev server). */
async function contentReady(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () => document.querySelectorAll("[data-skeleton], .ar-skeleton, [data-testid='slow-loading'], [aria-busy='true']").length === 0 && !document.body.innerText.includes("Carregando"),
      undefined,
      { timeout: 90_000, polling: 250 },
    )
    .catch(() => undefined);
  await page.waitForTimeout(400);
}

async function recordCosts(browser: Browser, d: Map<string, number>): Promise<void> {
  const context = await desktopContext(browser, true);
  await adminLogin(context, "despacho@agrorende.dev");
  const page = await context.newPage();
  const s = new Session("costs", context, page, d);
  // The work-order board hides completed orders, so the scene opens the repaired order directly.
  const workOrderId = process.env.DEMO_WORK_ORDER_ID ?? findWorkOrderId("WO-000016");
  await page.goto(`${urls.admin}/work-orders/${workOrderId}`, { waitUntil: "load", timeout: 120_000 });
  await settle(page, 1000);
  await contentReady(page);
  s.start("verify");
  await page.waitForTimeout(1500);
  await smoothScroll(page, 500, 3000);
  await page.waitForTimeout(2000);
  await smoothScroll(page, -500, 2000);
  const verify = page.getByRole("button", { name: /^Verificar/ }).first();
  if (await verify.isVisible().catch(() => false)) {
    await click(page, verify);
    await page.waitForTimeout(1200);
    const confirm = page.locator("dialog[open] button", { hasText: /Verificar|Confirmar/ }).last();
    if (await confirm.isVisible().catch(() => false)) await click(page, confirm);
  }
  await page.waitForTimeout(2000);
  await s.hold("verify", -1.5);
  await page.goto(`${urls.admin}/assets`, { waitUntil: "load", timeout: 240_000 });
  await settle(page, 600);

  await contentReady(page);
  s.start("asset");
  await click(page, page.locator("tr", { hasText: "AGR-000012" }).first());
  await settle(page, 1500);
  await contentReady(page);
  await smoothScroll(page, 450, 3000);
  await s.hold("asset", -1.5);
  await page.goto(`${urls.admin}/rentals`, { waitUntil: "load", timeout: 240_000 });
  await settle(page, 600);

  await contentReady(page);
  s.start("rental");
  await page.waitForTimeout(1500);
  await click(page, page.locator("tr", { hasText: "RN-000005" }).first());
  await settle(page, 1500);
  await contentReady(page);
  await smoothScroll(page, 350, 2500);
  await s.hold("rental", -1.5);
  await page.goto(`${urls.admin}/costs`, { waitUntil: "load", timeout: 240_000 });
  await settle(page, 800);
  await contentReady(page);

  s.start("costs");
  await page.waitForTimeout(2500);
  await smoothScroll(page, 350, 2500);
  await s.hold("costs");
  await s.finish();
}

export const RECORDERS = ["landing", "signup", "joana", "office", "carlos", "costs"] as const;
export type RecorderName = (typeof RECORDERS)[number];

export async function record(which: readonly RecorderName[]): Promise<void> {
  const d = sceneDurations();
  const desktop = await launch();
  const phone = await launch(PHONE_ARGS);
  try {
    console.log("  warming admin and landing pages");
    if (process.env.DEMO_SKIP_WARM !== "1") await warmAdmin(desktop);
    for (const name of which) {
      console.log(`  recording ${name}`);
      if (name === "landing") await recordLanding(desktop, d);
      if (name === "signup") await recordSignup(desktop, d);
      if (name === "joana") {
        // The office half of the split screen needs the same browser as the desktop recordings,
        // while the phone half needs the fake camera; both run in the phone browser here.
        await recordJoana(phone, d);
      }
      if (name === "office") console.log(`  dispatched ${await recordOffice(desktop, d)}`);
      if (name === "carlos") await recordCarlos(phone, d);
      if (name === "costs") await recordCosts(desktop, d);
    }
  } finally {
    await desktop.close();
    await phone.close();
  }
}
