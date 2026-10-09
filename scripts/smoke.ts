/*
 * `pnpm smoke`: end-to-end smoke test of a running AgroRende stack (ARCHITECTURE §16, DELIVERY-PLAN §5 T10).
 *
 * It talks to the stack over HTTP and WebSocket only (no database access, no `@agrorende/core` import), so
 * the same script runs against the local dev loop, the E2E stack and staging (`deploy.yml`). Every check
 * prints one line, every step has a timeout, and any failure stops the run with a non-zero exit code.
 *
 *   tsx scripts/smoke.ts [--base-url http://localhost:3000] [--ws-url http://localhost:4001]
 *                        [--worker-url http://localhost:4002] [--email inspetor@agrorende.dev]
 *                        [--password agrorende123] [--office-email despacho@agrorende.dev]
 *                        [--office-password <password>] [--asset-code AGR-000001]
 *
 * Defaults come from `SMOKE_*` environment variables, then from the root `.env` (`APP_URL`,
 * `NEXT_PUBLIC_REALTIME_URL`), then from the local dev loop ports.
 */
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";

import type { Socket } from "socket.io-client";

import { OpsLiveDTOSchema } from "../packages/contracts/src/dto/ops.ts";
import { EntityChangedPayloadSchema, RealtimeServerEvents, type EntityChangedPayload } from "../packages/contracts/src/realtime.ts";
import { loadRootEnv, rootPath } from "./devloop/env.ts";

// `socket.io-client` is a dependency of the web app, not of the workspace root, so it is resolved from there.
const { io } = createRequire(rootPath("apps", "web", "package.json"))("socket.io-client") as typeof import("socket.io-client");

const STEP_TIMEOUT_MS = 15_000;
const REALTIME_WAIT_MS = 10_000;
const EXPORT_TIMEOUT_MS = 90_000;
const EXPORT_POLL_MS = 1_000;

// Stable installation ids, so repeated runs reuse one Device row per user instead of creating new ones.
const FIELD_DEVICE_ID = "5e0c4d1a-7b2f-4c3e-9a1d-2f6b8c0d5e01";
const OFFICE_DEVICE_ID = "5e0c4d1a-7b2f-4c3e-9a1d-2f6b8c0d5e02";

// An 8 × 8 baseline JPEG (green), small enough to embed and valid for any image decoder.
const SMOKE_JPEG = Buffer.from(
  "/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABQb/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCQACJl/9k=",
  "base64",
);

// ───────── Configuration ─────────

interface SmokeConfig {
  readonly baseUrl: string;
  readonly wsUrl: string;
  readonly workerUrl: string | undefined;
  readonly fieldEmail: string;
  readonly fieldPassword: string;
  readonly officeEmail: string;
  readonly officePassword: string;
  readonly assetCode: string | undefined;
}

const USAGE = `Usage: tsx scripts/smoke.ts [options]

  --base-url <url>         Admin web / API origin (default SMOKE_BASE_URL, APP_URL or http://localhost:3000)
  --ws-url <url>           Realtime gateway origin (default SMOKE_WS_URL, NEXT_PUBLIC_REALTIME_URL or http://localhost:4001)
  --worker-url <url>       Worker health origin; checked only when given (default SMOKE_WORKER_URL)
  --email <email>          Field user (default SMOKE_FIELD_EMAIL or inspetor@agrorende.dev)
  --password <password>    Field user password (default SMOKE_FIELD_PASSWORD or agrorende123)
  --office-email <email>   Office user, ADMIN or MANAGER (default SMOKE_OFFICE_EMAIL or despacho@agrorende.dev)
  --office-password <pw>   Office user password (default SMOKE_OFFICE_PASSWORD or the field password)
  --asset-code <code>      Asset search term for the field report (default: the first asset listed)
  --help                   Show this help
`;

function readConfig(argv: readonly string[]): SmokeConfig | null {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      "base-url": { type: "string" },
      "ws-url": { type: "string" },
      "worker-url": { type: "string" },
      email: { type: "string" },
      password: { type: "string" },
      "office-email": { type: "string" },
      "office-password": { type: "string" },
      "asset-code": { type: "string" },
      help: { type: "boolean" },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.help === true) return null;
  loadRootEnv();
  const env = process.env;
  const fieldPassword = values.password ?? env.SMOKE_FIELD_PASSWORD ?? "agrorende123";
  return {
    baseUrl: trimSlash(values["base-url"] ?? env.SMOKE_BASE_URL ?? env.APP_URL ?? "http://localhost:3000"),
    wsUrl: trimSlash(values["ws-url"] ?? env.SMOKE_WS_URL ?? env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:4001"),
    workerUrl: nonEmpty(values["worker-url"] ?? env.SMOKE_WORKER_URL),
    fieldEmail: values.email ?? env.SMOKE_FIELD_EMAIL ?? "inspetor@agrorende.dev",
    fieldPassword,
    officeEmail: values["office-email"] ?? env.SMOKE_OFFICE_EMAIL ?? "despacho@agrorende.dev",
    officePassword: values["office-password"] ?? env.SMOKE_OFFICE_PASSWORD ?? fieldPassword,
    assetCode: nonEmpty(values["asset-code"]),
  };
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/u, "");
}

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === "" ? undefined : value.trim();
}

// ───────── Output and steps ─────────

class SmokeError extends Error {}

/** Thrown after a failed step has already been printed, so `main` only sets the exit code. */
class StepFailed extends Error {}

function print(status: "ok" | "FAIL", name: string, detail: string, elapsedMs: number): void {
  const line = `[smoke] ${status.padEnd(4)} ${name.padEnd(20)} ${detail} (${elapsedMs} ms)\n`;
  (status === "ok" ? process.stdout : process.stderr).write(line);
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

interface StepOutcome<T> {
  readonly value: T;
  readonly detail: string;
}

/** Runs one check with its own timeout and prints exactly one line for it. */
async function step<T>(name: string, run: (signal: AbortSignal) => Promise<StepOutcome<T>>, timeoutMs = STEP_TIMEOUT_MS): Promise<T> {
  const started = Date.now();
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new SmokeError(`timed out after ${timeoutMs} ms`);
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });
  try {
    const outcome = await Promise.race([run(controller.signal), timeout]);
    print("ok", name, outcome.detail, Date.now() - started);
    return outcome.value;
  } catch (error) {
    print("FAIL", name, describeError(error), Date.now() - started);
    throw new StepFailed(name);
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

// ───────── HTTP ─────────

interface HttpRequest {
  readonly method?: "GET" | "POST" | "PUT";
  readonly token?: string;
  readonly json?: unknown;
  readonly body?: Uint8Array;
  readonly headers?: Readonly<Record<string, string>>;
  readonly expect?: readonly number[];
  readonly signal: AbortSignal;
}

interface HttpResponse {
  readonly status: number;
  readonly headers: Headers;
  readonly text: string;
}

function networkReason(error: unknown): string {
  if (error instanceof Error) {
    const cause: unknown = error.cause;
    if (cause instanceof Error) {
      const code = (cause as Error & { code?: unknown }).code;
      return typeof code === "string" ? code : cause.message;
    }
    return error.message;
  }
  return String(error);
}

function errorSummary(text: string): string {
  try {
    const body = JSON.parse(text) as unknown;
    if (isRecord(body) && isRecord(body.error)) {
      const code = typeof body.error.code === "string" ? body.error.code : "ERROR";
      const message = typeof body.error.message === "string" ? body.error.message : "";
      const ref = typeof body.error.ref === "string" ? ` ref ${body.error.ref}` : "";
      return `${code}${message !== "" && message !== code ? `: ${message}` : ""}${ref}`;
    }
  } catch {
    // Not JSON; fall through to a short excerpt.
  }
  const excerpt = text.replace(/\s+/gu, " ").trim().slice(0, 120);
  return excerpt === "" ? "empty body" : excerpt;
}

async function http(url: string, request: HttpRequest): Promise<HttpResponse> {
  const method = request.method ?? "GET";
  const headers: Record<string, string> = { accept: "application/json", ...request.headers };
  if (request.token !== undefined) headers.authorization = `Bearer ${request.token}`;
  let body: string | Uint8Array | undefined;
  if (request.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(request.json);
  } else if (request.body !== undefined) {
    body = request.body;
  }
  let response: Response;
  try {
    response = await fetch(url, { method, headers, body, redirect: "manual", signal: request.signal });
  } catch (error) {
    if (request.signal.aborted) throw request.signal.reason;
    throw new SmokeError(`${method} ${url} -> network error: ${networkReason(error)}`);
  }
  const text = await response.text();
  const expected = request.expect ?? [200];
  if (!expected.includes(response.status)) {
    throw new SmokeError(`${method} ${url} -> HTTP ${response.status} ${errorSummary(text)}`);
  }
  return { status: response.status, headers: response.headers, text };
}

function parseJson(response: HttpResponse, what: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(response.text);
  } catch {
    throw new SmokeError(`${what}: expected JSON, got "${response.text.slice(0, 80)}"`);
  }
  if (!isRecord(value)) throw new SmokeError(`${what}: expected a JSON object`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function objectAt(object: Record<string, unknown>, key: string, what: string): Record<string, unknown> {
  const value = object[key];
  if (!isRecord(value)) throw new SmokeError(`${what}: missing object "${key}"`);
  return value;
}

function text(object: Record<string, unknown>, key: string, what: string): string {
  const value = object[key];
  if (typeof value !== "string" || value === "") throw new SmokeError(`${what}: missing string "${key}"`);
  return value;
}

// ───────── Checks ─────────

interface Session {
  readonly accessToken: string;
  readonly userId: string;
  readonly role: string;
  readonly orgId: string;
}

class Smoke {
  private readonly config: SmokeConfig;
  private socket: Socket | undefined;
  private readonly entityEvents: EntityChangedPayload[] = [];
  private readonly entityWaiters = new Set<() => void>();

  constructor(config: SmokeConfig) {
    this.config = config;
  }

  private api(path: string): string {
    return `${this.config.baseUrl}/api/v1${path}`;
  }

  async run(): Promise<void> {
    try {
      await this.health();
      const field = await this.login("login field", this.config.fieldEmail, this.config.fieldPassword, FIELD_DEVICE_ID, false);
      const office = await this.login("login office", this.config.officeEmail, this.config.officePassword, OFFICE_DEVICE_ID, true);
      await this.connectSocket(office);
      const assetId = await this.findAsset(office);
      const report = await this.pushReport(field, assetId);
      await this.uploadPhoto(field, report.mediaId);
      await this.waitForEntityChanged(report.reportId);
      await this.opsLive(office);
      await this.csvExport(office);
    } finally {
      this.socket?.disconnect();
    }
  }

  private async health(): Promise<void> {
    await step("api health", async (signal) => {
      const body = parseJson(await http(this.api("/health"), { signal }), "health");
      if (body.ok !== true || body.app !== "agrorende") throw new SmokeError(`unexpected health body ${JSON.stringify(body)}`);
      if (body.redis !== true) throw new SmokeError("API reports redis=false; realtime events cannot be delivered");
      return { value: undefined, detail: `GET /api/v1/health db=${String(body.db)} redis=${String(body.redis)} version=${String(body.version)}` };
    });
    await step("realtime health", async (signal) => {
      await http(`${this.config.wsUrl}/health`, { signal });
      return { value: undefined, detail: `GET ${this.config.wsUrl}/health` };
    });
    const workerUrl = this.config.workerUrl;
    if (workerUrl !== undefined) {
      await step("worker health", async (signal) => {
        await http(`${trimSlash(workerUrl)}/health`, { signal });
        return { value: undefined, detail: `GET ${trimSlash(workerUrl)}/health` };
      });
    }
  }

  /** `POST /auth/login` with a `deviceId`, so the API answers with bearer tokens like the mobile app gets. */
  private async login(name: string, email: string, password: string, deviceId: string, office: boolean): Promise<Session> {
    return step(name, async (signal) => {
      const body = parseJson(
        await http(this.api("/auth/login"), { method: "POST", json: { email, password, deviceId, platform: "ANDROID" }, signal }),
        "login",
      );
      const user = objectAt(body, "user", "login");
      const org = objectAt(body, "org", "login");
      const session: Session = {
        accessToken: text(body, "accessToken", "login"),
        userId: text(user, "id", "login user"),
        role: text(user, "role", "login user"),
        orgId: text(org, "id", "login org"),
      };
      if (office && session.role !== "ADMIN" && session.role !== "MANAGER") {
        throw new SmokeError(`${email} has role ${session.role}; the office user must be ADMIN or MANAGER to join the ops room`);
      }
      return { value: session, detail: `${email} role=${session.role}` };
    });
  }

  private async connectSocket(office: Session): Promise<void> {
    const token = await step("socket token", async (signal) => {
      const body = parseJson(await http(this.api("/auth/socket-token"), { method: "POST", token: office.accessToken, signal }), "socket-token");
      return { value: text(body, "token", "socket-token"), detail: `POST /api/v1/auth/socket-token expiresAt=${String(body.expiresAt)}` };
    });
    await step("socket connect", (signal) => new Promise<StepOutcome<undefined>>((resolve, reject) => {
      const socket = io(this.config.wsUrl, { auth: { token }, transports: ["websocket"], reconnection: false, timeout: STEP_TIMEOUT_MS });
      this.socket = socket;
      socket.on(RealtimeServerEvents.entityChanged, (payload: unknown) => {
        const parsed = EntityChangedPayloadSchema.safeParse(payload);
        if (!parsed.success) return;
        this.entityEvents.push(parsed.data);
        for (const wake of this.entityWaiters) wake();
      });
      signal.addEventListener("abort", () => socket.disconnect(), { once: true });
      socket.once("connect", () => resolve({ value: undefined, detail: `${this.config.wsUrl} joined org:${office.orgId}:ops as ${office.role}` }));
      socket.once("connect_error", (error: Error) => reject(new SmokeError(`connect_error ${error.message}`)));
    }));
  }

  private async findAsset(office: Session): Promise<string> {
    return step("asset lookup", async (signal) => {
      const query = this.config.assetCode === undefined ? "limit=1" : `limit=1&q=${encodeURIComponent(this.config.assetCode)}`;
      const body = parseJson(await http(this.api(`/assets?${query}`), { token: office.accessToken, signal }), "assets");
      const items = body.items;
      const first: unknown = Array.isArray(items) ? items[0] : undefined;
      if (!isRecord(first)) throw new SmokeError(`GET /api/v1/assets?${query} returned no asset; seed the organisation first`);
      const id = text(first, "id", "asset");
      return { value: id, detail: `${String(first.code ?? id)} ${String(first.name ?? "")}`.trim() };
    });
  }

  /** One push batch, like the mobile outbox: the report, then the photo metadata that gates the upload. */
  private async pushReport(field: Session, assetId: string): Promise<{ reportId: string; mediaId: string }> {
    return step("sync push", async (signal) => {
      const reportId = randomUUID();
      const mediaId = randomUUID();
      const now = new Date().toISOString();
      const mutations = [
        {
          id: randomUUID(),
          name: "fieldReport.create",
          occurredAt: now,
          payload: {
            id: reportId,
            assetId,
            category: "OTHER",
            priority: "LOW",
            machineOperable: true,
            suggestedAction: "INFO_ONLY",
            title: `Smoke test ${now}`,
            description: "Created by pnpm smoke. Safe to dismiss.",
            media: [],
          },
        },
        {
          id: randomUUID(),
          name: "media.register",
          occurredAt: now,
          payload: {
            id: mediaId,
            kind: "PHOTO",
            tag: "GENERAL",
            mimeType: "image/jpeg",
            sizeBytes: SMOKE_JPEG.byteLength,
            width: 8,
            height: 8,
            capturedAt: now,
            parent: { type: "FIELD_REPORT", id: reportId },
          },
        },
      ];
      const request = {
        deviceId: FIELD_DEVICE_ID,
        clientTime: now,
        deviceStatus: {
          appVersion: "smoke",
          runtimeVersion: "smoke",
          pendingMutations: mutations.length,
          pendingUploads: 1,
          pendingBytes: SMOKE_JPEG.byteLength,
          scopeEpoch: 0,
        },
        mutations,
      };
      const body = parseJson(await http(this.api("/sync/push"), { method: "POST", token: field.accessToken, json: request, signal }), "sync push");
      const results = Array.isArray(body.results) ? body.results : [];
      let number = "";
      for (const mutation of mutations) {
        const result: unknown = results.find((item: unknown) => isRecord(item) && item.id === mutation.id);
        if (!isRecord(result)) throw new SmokeError(`${mutation.name}: no result (batch stopped early)`);
        if (result.status !== "APPLIED") {
          const reason = result.status === "REJECTED" ? `${String(result.code)}: ${String(result.message)}` : `retryAfterMs=${String(result.retryAfterMs ?? "-")}`;
          throw new SmokeError(`${mutation.name} ${String(result.status)} ${reason}`);
        }
        if (isRecord(result.assigned) && typeof result.assigned.number === "string") number = result.assigned.number;
      }
      return { value: { reportId, mediaId }, detail: `fieldReport.create + media.register APPLIED ${number === "" ? reportId : number}` };
    });
  }

  /** The real media pipeline: upload URL, `PUT` to the signed blob URL, then complete (ARCHITECTURE §7.7). */
  private async uploadPhoto(field: Session, mediaId: string): Promise<void> {
    await step("media upload", async (signal) => {
      const instructions = parseJson(
        await http(this.api(`/media/${mediaId}/upload-url`), {
          method: "POST",
          token: field.accessToken,
          json: { variant: "original", sizeBytes: SMOKE_JPEG.byteLength, mimeType: "image/jpeg" },
          signal,
        }),
        "upload-url",
      );
      if (instructions.mode !== "single") throw new SmokeError(`upload-url: expected mode "single", got ${String(instructions.mode)}`);
      const url = text(instructions, "url", "upload-url");
      const extra = isRecord(instructions.headers) ? instructions.headers : {};
      const headers: Record<string, string> = { "content-type": "image/jpeg" };
      for (const [key, value] of Object.entries(extra)) if (typeof value === "string") headers[key] = value;
      await http(url, { method: "PUT", body: new Uint8Array(SMOKE_JPEG), headers, expect: [200, 201, 204], signal });
      const completed = parseJson(
        await http(this.api(`/media/${mediaId}/complete`), { method: "POST", token: field.accessToken, json: { variant: "original" }, signal }),
        "complete",
      );
      const media = objectAt(completed, "media", "complete");
      if (media.status !== "UPLOADED") throw new SmokeError(`complete: media status is ${String(media.status)}, expected UPLOADED`);
      return { value: undefined, detail: `${SMOKE_JPEG.byteLength} B via ${new URL(url).origin} status=UPLOADED` };
    });
  }

  private async waitForEntityChanged(reportId: string): Promise<void> {
    await step("realtime event", (signal) => new Promise<StepOutcome<undefined>>((resolve, reject) => {
      const check = (): boolean => {
        const event = this.entityEvents.find((item) => item.entityType === "FIELD_REPORT" && item.id === reportId);
        if (event === undefined) return false;
        this.entityWaiters.delete(wake);
        resolve({ value: undefined, detail: `${RealtimeServerEvents.entityChanged} FIELD_REPORT ${reportId} status=${event.status ?? "-"}` });
        return true;
      };
      const wake = (): void => {
        check();
      };
      if (check()) return;
      this.entityWaiters.add(wake);
      signal.addEventListener("abort", () => {
        this.entityWaiters.delete(wake);
        reject(new SmokeError(`no ${RealtimeServerEvents.entityChanged} for FIELD_REPORT ${reportId} within ${REALTIME_WAIT_MS} ms (received ${this.entityEvents.length} other events); check the event outbox dispatcher and Redis`));
      }, { once: true });
    }), REALTIME_WAIT_MS);
  }

  private async opsLive(office: Session): Promise<void> {
    await step("ops live", async (signal) => {
      const body = parseJson(await http(this.api("/ops/live"), { token: office.accessToken, signal }), "ops live");
      const parsed = OpsLiveDTOSchema.safeParse(body);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        throw new SmokeError(`GET /api/v1/ops/live does not match OpsLiveDTOSchema at ${issue?.path.join(".") ?? "?"}: ${issue?.message ?? "invalid"}`);
      }
      const live = parsed.data;
      return {
        value: undefined,
        detail: `operators=${live.operators.length} workOrders=${live.workOrders.length} reports=${live.reports.length} rentals=${live.rentals.length} assets=${live.assets.length}`,
      };
    });
  }

  /** `POST /exports` always builds in the worker, so this also proves BullMQ and the worker are alive. */
  private async csvExport(office: Session): Promise<void> {
    const jobId = await step("export request", async (signal) => {
      const body = parseJson(
        await http(this.api("/exports"), { method: "POST", token: office.accessToken, json: { entity: "assets", filters: {} }, expect: [200, 202], signal }),
        "export",
      );
      const job = objectAt(body, "job", "export");
      return { value: text(job, "id", "export job"), detail: `POST /api/v1/exports assets job=${String(job.id)} status=${String(job.status)}` };
    });
    const downloadUrl = await step("export ready", async (signal) => {
      for (;;) {
        const job = parseJson(await http(this.api(`/exports/${jobId}`), { token: office.accessToken, signal }), "export job");
        const status = String(job.status);
        if (status === "READY") {
          return { value: text(job, "downloadUrl", "export job"), detail: `job=${jobId} rows=${String(job.rowCount)}` };
        }
        if (status === "FAILED" || status === "EXPIRED") throw new SmokeError(`export job ${jobId} ${status} errorCode=${String(job.errorCode)}`);
        await sleep(EXPORT_POLL_MS, signal);
      }
    }, EXPORT_TIMEOUT_MS);
    await step("export download", async (signal) => {
      const url = new URL(downloadUrl, this.config.baseUrl).toString();
      const response = await http(url, { token: office.accessToken, headers: { accept: "text/csv" }, signal });
      const header = response.text.replace(/^\uFEFF/u, "").split(/\r?\n/u)[0] ?? "";
      const columns = header.split(/[,;]/u).filter((column) => column.trim() !== "");
      if (columns.length < 2) throw new SmokeError(`CSV header line looks wrong: "${header.slice(0, 80)}"`);
      return { value: undefined, detail: `${response.text.length} chars, ${columns.length} columns: ${header.slice(0, 60)}` };
    });
  }
}

async function main(): Promise<number> {
  let config: SmokeConfig | null;
  try {
    config = readConfig(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`[smoke] ${describeError(error)}\n\n${USAGE}`);
    return 2;
  }
  if (config === null) {
    process.stdout.write(USAGE);
    return 0;
  }
  process.stdout.write(`[smoke] api=${config.baseUrl} ws=${config.wsUrl}${config.workerUrl === undefined ? "" : ` worker=${config.workerUrl}`}\n`);
  const started = Date.now();
  try {
    await new Smoke(config).run();
  } catch (error) {
    if (!(error instanceof StepFailed)) process.stderr.write(`[smoke] FAIL unexpected error: ${describeError(error)}\n`);
    process.stderr.write(`[smoke] failed after ${Date.now() - started} ms\n`);
    return 1;
  }
  process.stdout.write(`[smoke] passed in ${Date.now() - started} ms\n`);
  return 0;
}

void main().then((code) => {
  process.exitCode = code;
});
