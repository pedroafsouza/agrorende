import type { AppErrorCode } from "@agrorende/contracts/errors";

import { errorCodeOf } from "../../lib/errors";

export const MIN_PASSWORD_LENGTH = 8;

/** A failed call with no HTTP status never reached the server (offline, DNS, captive portal). */
export function isNetworkFailure(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const details = (error as { details?: { network?: unknown } }).details;
  return details?.network === true || (error as { status?: unknown }).status === 0;
}

/**
 * Maps a sign-in failure to its catalog code. The very first sign-in on a device needs the
 * internet (EC-PLT-01); every later open works offline from the cached profile.
 */
export function loginErrorCode(error: unknown): AppErrorCode {
  if (isNetworkFailure(error)) return "FIRST_LOGIN_ONLINE_REQUIRED";
  return errorCodeOf(error, "INTERNAL");
}

/** Returns the message key for the first problem with a new password, or undefined when valid. */
export function newPasswordProblem(next: string, confirm: string): string | undefined {
  if (next.length < MIN_PASSWORD_LENGTH) return "auth.changePassword.tooShort";
  if (next !== confirm) return "auth.changePassword.mismatch";
  return undefined;
}
