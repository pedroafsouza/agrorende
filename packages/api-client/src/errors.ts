import {
  AppError,
  ERROR_META,
  isErrorCode,
  type AppErrorEnvelope,
  type AppErrorOptions,
  type ErrorCode,
  type RecoveryPattern,
} from "@agrorende/contracts/errors";

export interface ApiErrorOptions extends AppErrorOptions {
  /** HTTP status of the response; 0 when the request never reached the server. */
  readonly status: number;
  /** Retryability from the envelope; falls back to `ERROR_META[code].retryable`. */
  readonly retryable?: boolean;
  readonly retryAfterMs?: number;
  readonly cause?: unknown;
}

/** An `AppError` decoded from an HTTP response or a network failure. */
export class ApiError extends AppError {
  override readonly retryable: boolean;
  readonly status: number;
  readonly recovery: readonly RecoveryPattern[];
  readonly retryAfterMs?: number;

  constructor(code: ErrorCode, options: ApiErrorOptions) {
    super(code, options);
    this.name = "ApiError";
    this.status = options.status;
    this.retryable = options.retryable ?? ERROR_META[code].retryable;
    this.recovery = ERROR_META[code].recovery;
    if (options.retryAfterMs !== undefined) {
      this.retryAfterMs = options.retryAfterMs;
    }
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

/** Wraps a thrown `fetch` (offline, DNS, TLS, abort) into a retryable `INTERNAL` error. */
export function networkError(cause: unknown): ApiError {
  const reason = cause instanceof Error ? cause.message : String(cause);
  return new ApiError("INTERNAL", {
    message: `Network request failed: ${reason}`,
    details: { network: true },
    status: 0,
    retryable: true,
    cause,
  });
}

/** Decodes a non-2xx response into an `ApiError`, keeping the envelope fields when present. */
export async function decodeApiError(response: Response): Promise<ApiError> {
  const body = await readJson(response);
  const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
  const extra = retryAfterMs === undefined ? {} : { retryAfterMs };
  if (isErrorEnvelope(body) && isErrorCode(body.error.code)) {
    const { error } = body;
    return new ApiError(error.code, {
      message: error.message,
      details: error.details,
      fieldErrors: error.fieldErrors,
      ref: error.ref,
      status: response.status,
      retryable: error.retryable,
      ...extra,
    });
  }
  return new ApiError("INTERNAL", {
    message: `HTTP ${response.status}`,
    details: { status: response.status },
    status: response.status,
    retryable: response.status >= 500 || response.status === 429,
    ...extra,
  });
}

/** `Retry-After` is either delta-seconds or an HTTP date. */
export function parseRetryAfter(value: string | null, now: number = Date.now()): number | undefined {
  if (value === null) {
    return undefined;
  }
  const trimmed = value.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return Math.round(Number(trimmed) * 1000);
  }
  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) {
    return undefined;
  }
  return Math.max(0, at - now);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    return text.length === 0 ? undefined : (JSON.parse(text) as unknown);
  } catch {
    return undefined;
  }
}

function isErrorEnvelope(value: unknown): value is AppErrorEnvelope {
  if (typeof value !== "object" || value === null || !("error" in value)) {
    return false;
  }
  const error = (value as { readonly error: unknown }).error;
  if (typeof error !== "object" || error === null) {
    return false;
  }
  return (
    "code" in error &&
    typeof error.code === "string" &&
    "message" in error &&
    typeof error.message === "string" &&
    "retryable" in error &&
    typeof error.retryable === "boolean"
  );
}
