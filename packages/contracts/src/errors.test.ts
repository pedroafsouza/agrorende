import { describe, expect, it } from "vitest";

import {
  ALL_ERROR_CODES,
  CLIENT_ERROR_CODES,
  ERROR_CODES,
  ERROR_HTTP_STATUS,
  ERROR_META,
  RECOVERY_PATTERNS,
  getErrorHttpStatus,
  isRecoveryPattern,
} from "./errors";

describe("error catalog", () => {
  it("covers every server and client error code", () => {
    expect(ERROR_CODES).toHaveLength(78);
    expect(CLIENT_ERROR_CODES).toHaveLength(110);
    expect(ALL_ERROR_CODES).toHaveLength(188);
    expect(Object.keys(ERROR_META).sort()).toEqual([...ALL_ERROR_CODES].sort());
  });

  it("maps representative server codes to their HTTP status", () => {
    expect(getErrorHttpStatus("OAUTH_STATE_EXPIRED")).toBe(400);
    expect(ERROR_HTTP_STATUS.INVALID_CREDENTIALS).toBe(401);
    expect(ERROR_HTTP_STATUS.FORBIDDEN).toBe(403);
    expect(ERROR_HTTP_STATUS.NOT_FOUND).toBe(404);
    expect(ERROR_HTTP_STATUS.CONFLICT).toBe(409);
    expect(ERROR_HTTP_STATUS.RESET_LINK_EXPIRED).toBe(410);
    expect(ERROR_HTTP_STATUS.MEDIA_TOO_LARGE).toBe(413);
    expect(ERROR_HTTP_STATUS.VALIDATION_FAILED).toBe(422);
    expect(ERROR_HTTP_STATUS.APP_UPDATE_REQUIRED).toBe(426);
    expect(ERROR_HTTP_STATUS.RATE_LIMITED).toBe(429);
    expect(ERROR_HTTP_STATUS.INTERNAL).toBe(500);
    expect(ERROR_HTTP_STATUS.OAUTH_PROVIDER_ERROR).toBe(502);
    expect(ERROR_HTTP_STATUS.RENTAL_DAMAGE_REPORT_FAILED).toBe(503);
    expect(ERROR_HTTP_STATUS.STORAGE_FULL).toBe(507);
  });

  it("uses only allowed recovery patterns", () => {
    expect(RECOVERY_PATTERNS).toEqual([
      "AUTO",
      "RETRY",
      "FIX",
      "ALT",
      "DRAFT",
      "UNDO",
      "RESTORE",
      "SETTINGS",
      "REAUTH",
      "UPDATE",
      "OFFICE",
      "DIAG",
      "HANDOFF",
      "FALLBACK",
    ]);

    for (const code of ALL_ERROR_CODES) {
      const meta = ERROR_META[code];
      expect(meta.recovery.length).toBeGreaterThan(0);
      for (const pattern of meta.recovery) {
        expect(isRecoveryPattern(pattern)).toBe(true);
      }
    }
  });
});
