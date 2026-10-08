import { ERROR_META, getErrorMeta, isAppErrorCode, type AppErrorCode, type RecoveryPattern } from "@agrorende/contracts/errors";

/**
 * Error carrying any catalog code, including client-only codes that the shared
 * `AppError` (server codes only) cannot represent (ARCHITECTURE §21).
 */
export class LocalError extends Error {
  readonly code: AppErrorCode;
  readonly details: unknown;
  override readonly cause: unknown;

  constructor(code: AppErrorCode, options: { readonly details?: unknown; readonly cause?: unknown } = {}) {
    super(code);
    this.name = "LocalError";
    this.code = code;
    this.details = options.details;
    this.cause = options.cause;
  }
}

function hasCode(value: unknown): value is { readonly code: string } {
  return typeof value === "object" && value !== null && "code" in value && typeof (value as { code: unknown }).code === "string";
}

/** Maps anything thrown to a catalog code; unknown failures become `INTERNAL`. */
export function errorCodeOf(error: unknown, fallback: AppErrorCode = "INTERNAL"): AppErrorCode {
  if (hasCode(error) && isAppErrorCode(error.code)) return error.code;
  return fallback;
}

export function recoveryOf(code: AppErrorCode): readonly RecoveryPattern[] {
  return getErrorMeta(code).recovery;
}

export function isRetryable(code: AppErrorCode): boolean {
  return ERROR_META[code].retryable;
}
