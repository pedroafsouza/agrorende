import type { ErrorCode } from "@agrorende/contracts/errors";

export interface FieldError {
  readonly path: string;
  readonly code: string;
  readonly params?: Readonly<Record<string, unknown>>;
}

/** Client-side view of the §8 error envelope; `code` may also be a client-only code. */
export class ApiError extends Error {
  readonly code: ErrorCode | "BROWSER_OFFLINE";
  readonly status: number;
  readonly details: Readonly<Record<string, unknown>>;
  readonly fieldErrors: readonly FieldError[];
  readonly retryable: boolean;
  readonly ref: string | undefined;

  constructor(init: {
    code: ApiError["code"];
    status: number;
    details?: Readonly<Record<string, unknown>>;
    fieldErrors?: readonly FieldError[];
    retryable?: boolean;
    ref?: string;
  }) {
    super(init.code);
    this.name = "ApiError";
    this.code = init.code;
    this.status = init.status;
    this.details = init.details ?? {};
    this.fieldErrors = init.fieldErrors ?? [];
    this.retryable = init.retryable ?? false;
    this.ref = init.ref;
  }
}

export interface ApiRequest {
  readonly method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  readonly body?: unknown;
  /** Sent as `If-Match` so stale edits come back as CONFLICT (EC-OPS-05). */
  readonly version?: string | null;
  readonly query?: Readonly<Record<string, string | number | boolean | null | undefined>>;
  readonly signal?: AbortSignal;
  /** Public auth calls (login, invites, reset) must surface their 401 instead of refreshing. */
  readonly skipAuthRetry?: boolean;
}

const PUBLIC_AUTH = /^\/auth\/(login|refresh|invites|reset|oauth)(\/|$)/u;

export type Fetcher = typeof fetch;

interface Envelope {
  readonly error?: {
    readonly code?: string;
    readonly details?: Record<string, unknown>;
    readonly fieldErrors?: FieldError[];
    readonly retryable?: boolean;
    readonly ref?: string;
  };
}

export const REAUTH_EVENT = "agrorende:reauth-required";

type ReauthWaiter = () => Promise<boolean>;
let reauthWaiter: ReauthWaiter | null = null;

/** `ReauthDialog` registers itself here so a 401 after refresh pauses the request instead of losing form state. */
export function registerReauthWaiter(waiter: ReauthWaiter | null): void {
  reauthWaiter = waiter;
}

export function buildUrl(path: string, query?: ApiRequest["query"]): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const qs = search.toString();
  return `/api/v1${path}${qs.length > 0 ? `?${qs}` : ""}`;
}

async function toApiError(response: Response): Promise<ApiError> {
  const envelope: Envelope = await response.json().then(
    (body: unknown) => (body ?? {}) as Envelope,
    () => ({}),
  );
  const error = envelope.error ?? {};
  return new ApiError({
    code: (error.code ?? (response.status >= 500 ? "INTERNAL" : "VALIDATION_FAILED")) as ErrorCode,
    status: response.status,
    details: error.details ?? {},
    fieldErrors: error.fieldErrors ?? [],
    retryable: error.retryable ?? response.status >= 500,
    ...(error.ref === undefined ? {} : { ref: error.ref }),
  });
}

async function send(fetcher: Fetcher, path: string, request: ApiRequest): Promise<Response> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (request.body !== undefined) headers["content-type"] = "application/json";
  if (request.version !== undefined && request.version !== null) headers["if-match"] = `"${request.version}"`;
  try {
    return await fetcher(buildUrl(path, request.query), {
      method: request.method ?? "GET",
      headers,
      credentials: "same-origin",
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
      ...(request.signal === undefined ? {} : { signal: request.signal }),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError({ code: "BROWSER_OFFLINE", status: 0, retryable: true });
  }
}

/** Fetch wrapper for `/api/v1`: silent refresh on TOKEN_EXPIRED, then ReauthDialog, then one replay (A§14.2). */
export async function api<T>(path: string, request: ApiRequest = {}, fetcher: Fetcher = fetch): Promise<T> {
  let response = await send(fetcher, path, request);
  if (response.status === 401 && request.skipAuthRetry !== true && !PUBLIC_AUTH.test(path)) {
    const refreshed = await send(fetcher, "/auth/refresh", { method: "POST" });
    if (refreshed.ok) {
      response = await send(fetcher, path, request);
    } else if (reauthWaiter !== null && (await reauthWaiter())) {
      response = await send(fetcher, path, request);
    }
  }
  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function isApiError(error: unknown, code?: ApiError["code"]): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code);
}
