import type { HealthResponse, PullRequest, PullResponse, PushRequest, PushResponse } from "@agrorende/contracts/sync";
import { HealthResponseSchema, PullResponseSchema, PushResponseSchema } from "@agrorende/contracts/sync";

export type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

/** Failure of an HTTP call, already mapped to the error catalog where possible. */
export class TransportError extends Error {
  readonly kind: "network" | "timeout" | "http" | "invalid";
  readonly status: number;
  readonly code: string | undefined;
  readonly retryAfterMs: number | undefined;
  readonly body: unknown;

  constructor(kind: TransportError["kind"], options: { status?: number; code?: string; retryAfterMs?: number; body?: unknown; message?: string } = {}) {
    super(options.message ?? options.code ?? kind);
    this.name = "TransportError";
    this.kind = kind;
    this.status = options.status ?? 0;
    this.code = options.code;
    this.retryAfterMs = options.retryAfterMs;
    this.body = options.body;
  }
}

export interface TransportOptions {
  readonly baseUrl: string;
  readonly fetch: FetchLike;
  /** Returns the current access token, or undefined while signed out. */
  readonly getAccessToken: () => string | undefined;
  /** Called once on 401; returns true when a fresh token is available. */
  readonly onUnauthorized?: () => Promise<boolean>;
  readonly timeoutMs?: number;
  readonly locale?: () => string;
}

export interface UploadUrlSingle {
  readonly mode: "single";
  readonly url: string;
  readonly headers?: Record<string, string>;
}
export interface UploadUrlMultipart {
  readonly mode: "multipart";
  readonly uploadId: string;
  readonly partSize: number;
  readonly parts: readonly { readonly n: number; readonly url: string }[];
}
export type UploadUrlResponse = UploadUrlSingle | UploadUrlMultipart;
export type MediaVariant = "original" | "thumb" | "poster";

export interface LocationFix {
  readonly recordedAt: string;
  readonly lat: number;
  readonly lng: number;
  readonly accuracyM?: number;
  readonly speedMps?: number;
  readonly heading?: number;
  readonly batteryLevel?: number;
  readonly workOrderId?: string;
}

/** Every server call the mobile engine makes (ARCHITECTURE §7, §14). */
export interface SyncApi {
  health(): Promise<HealthResponse>;
  push(request: PushRequest): Promise<PushResponse>;
  pull(request: PullRequest): Promise<PullResponse>;
  uploadUrl(mediaId: string, body: { sizeBytes: number; mimeType: string; variant: MediaVariant }): Promise<UploadUrlResponse>;
  multipartParts(mediaId: string, body: { uploadId: string; partNumbers: readonly number[] }): Promise<{ parts: readonly { n: number; url: string }[] }>;
  completeUpload(mediaId: string, body: { variant: MediaVariant; uploadId?: string; parts?: readonly { n: number; etag: string }[] }): Promise<unknown>;
  postLocations(body: { deviceId: string; fixes: readonly LocationFix[] }): Promise<unknown>;
  postDiagnostics(body: { deviceId: string; items: readonly unknown[] }): Promise<unknown>;
  updateMe(body: { locale?: string }): Promise<unknown>;
}

function parseRetryAfter(value: string | null): number | undefined {
  if (value === null) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : undefined;
}

function readEnvelope(body: unknown): { code?: string; retryAfterMs?: number } {
  if (typeof body !== "object" || body === null || !("error" in body)) return {};
  const error = (body as { error: unknown }).error;
  if (typeof error !== "object" || error === null) return {};
  const code = (error as { code?: unknown }).code;
  const details = (error as { details?: unknown }).details;
  const retry = typeof details === "object" && details !== null ? (details as { retryAfterMs?: unknown }).retryAfterMs : undefined;
  return { code: typeof code === "string" ? code : undefined, retryAfterMs: typeof retry === "number" ? retry : undefined };
}

export function createHttpTransport(options: TransportOptions): SyncApi {
  const base = options.baseUrl.replace(/\/+$/, "");
  const timeoutMs = options.timeoutMs ?? 30_000;

  async function call(method: string, path: string, body: unknown, auth = true, retried = false): Promise<unknown> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    const token = auth ? options.getAccessToken() : undefined;
    if (token !== undefined) headers.authorization = `Bearer ${token}`;
    const locale = options.locale?.();
    if (locale !== undefined) headers["accept-language"] = locale;
    const controller = typeof AbortController === "undefined" ? undefined : new AbortController();
    const timer = setTimeout(() => controller?.abort(), timeoutMs);
    let response: Awaited<ReturnType<FetchLike>>;
    try {
      response = await options.fetch(`${base}/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: controller?.signal });
    } catch (error) {
      const aborted = typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError";
      throw new TransportError(aborted ? "timeout" : "network", { message: aborted ? "timeout" : "network" });
    } finally {
      clearTimeout(timer);
    }
    const text = await response.text();
    let parsed: unknown = undefined;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text) as unknown;
      } catch (_error) {
        throw new TransportError("invalid", { status: response.status, body: text });
      }
    }
    if (response.status === 401 && auth && !retried && options.onUnauthorized !== undefined) {
      if (await options.onUnauthorized()) return call(method, path, body, auth, true);
    }
    if (!response.ok) {
      const envelope = readEnvelope(parsed);
      throw new TransportError("http", {
        status: response.status,
        code: envelope.code,
        retryAfterMs: envelope.retryAfterMs ?? parseRetryAfter(response.headers.get("retry-after")),
        body: parsed,
      });
    }
    return parsed;
  }

  const seg = encodeURIComponent;
  return {
    async health() {
      let body: unknown;
      try {
        body = await call("GET", "/health", undefined, false);
      } catch (error) {
        if (error instanceof TransportError && (error.kind === "invalid" || error.kind === "http")) {
          throw new TransportError("invalid", { code: "CAPTIVE_PORTAL", status: error.status });
        }
        throw error;
      }
      const result = HealthResponseSchema.safeParse(body);
      if (!result.success) throw new TransportError("invalid", { code: "CAPTIVE_PORTAL" });
      return result.data;
    },
    async push(request) {
      return PushResponseSchema.parse(await call("POST", "/sync/push", request));
    },
    async pull(request) {
      const query = new URLSearchParams({ deviceId: request.deviceId, scopeEpoch: String(request.scopeEpoch) });
      if (request.cursor !== undefined) query.set("cursor", request.cursor);
      return PullResponseSchema.parse(await call("GET", `/sync/pull?${query.toString()}`, undefined));
    },
    async uploadUrl(mediaId, body) {
      return (await call("POST", `/media/${seg(mediaId)}/upload-url`, body)) as UploadUrlResponse;
    },
    async multipartParts(mediaId, body) {
      return (await call("POST", `/media/${seg(mediaId)}/multipart/parts`, body)) as { parts: { n: number; url: string }[] };
    },
    completeUpload: (mediaId, body) => call("POST", `/media/${seg(mediaId)}/complete`, body),
    postLocations: (body) => call("POST", "/locations/batch", body),
    postDiagnostics: (body) => call("POST", "/telemetry/diagnostics", body),
    updateMe: (body) => call("PATCH", "/me", body),
  };
}
