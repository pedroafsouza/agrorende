jest.mock("react-native", () => ({ Linking: { openSettings: jest.fn(async () => undefined) }, useColorScheme: () => "light", Platform: { OS: "ios" } }));
jest.mock("lucide-react-native", () => ({}));

import type { ChecklistItem, ChecklistResponse } from "@agrorende/contracts/checklist";

import { loginErrorCode, newPasswordProblem } from "../../src/auth/ui/rules";
import { checklistProgress, isAnswered, localized, upsertResponse } from "../../src/components/ChecklistRunner/logic";
import { message } from "../../src/i18n/messages";
import { initI18n, setLocale } from "../../src/i18n/runtime";
import { LocalError } from "../../src/lib/errors";
import { badgeStateOf, initialSyncSnapshot } from "../../src/sync/store";
import { appThemes, minTouchTarget, resolveTheme } from "../../src/ui/theme";
import { configureRecovery } from "../../src/ui/recovery/config";
import { resolveRecovery } from "../../src/ui/recovery/useRecovery";

const AT = "2026-03-01T12:00:00.000Z";
const MEDIA = "01900000-0000-7000-8000-000000000001";

function item(partial: Partial<ChecklistItem> & Pick<ChecklistItem, "key">): ChecklistItem {
  return { label: { "pt-BR": "Freio", en: "Brake" }, type: "PASS_FAIL_NA", required: true, isSafetyCritical: false, photo: "NEVER", ...partial };
}

function answer(key: string, value: ChecklistResponse["value"], mediaIds: string[] = []): ChecklistResponse {
  return { key, value, mediaIds, answeredAt: AT };
}

describe("Campo claro theme", () => {
  test("touch targets are at least 48 dp and outdoor has thick borders", () => {
    expect(minTouchTarget).toBeGreaterThanOrEqual(48);
    expect(appThemes.outdoor.borderWidth).toBeGreaterThan(appThemes.light.borderWidth);
    expect(resolveTheme("system", "dark").name).toBe("dark");
    expect(resolveTheme("outdoor", "dark").name).toBe("outdoor");
  });
});

describe("sync badge", () => {
  test("collapses the snapshot into one state", () => {
    expect(badgeStateOf(initialSyncSnapshot)).toBe("synced");
    expect(badgeStateOf({ ...initialSyncSnapshot, network: "offline" })).toBe("offline");
    expect(badgeStateOf({ ...initialSyncSnapshot, network: "offline", pendingMutations: 2 })).toBe("pending");
    expect(badgeStateOf({ ...initialSyncSnapshot, phase: "pushing" })).toBe("sending");
    expect(badgeStateOf({ ...initialSyncSnapshot, failedUploads: 1, pendingMutations: 3 })).toBe("failed");
  });
});

describe("checklist runner logic", () => {
  test("photo-on-fail, safety failures and progress", () => {
    const items = [item({ key: "brake", isSafetyCritical: true, photo: "ON_FAIL" }), item({ key: "horn" }), item({ key: "note", type: "TEXT", required: false })];
    let responses = upsertResponse([], answer("brake", "FAIL"));
    expect(isAnswered(items[0] as ChecklistItem, responses[0])).toBe(false);
    responses = upsertResponse(responses, answer("brake", "FAIL", [MEDIA]));
    const progress = checklistProgress(items, responses);
    expect(progress).toMatchObject({ answered: 1, total: 3, requiredMissing: ["horn"], complete: false, safetyFailures: ["brake"] });
    expect(checklistProgress(items, upsertResponse(responses, answer("horn", "PASS"))).complete).toBe(true);
    expect(localized({ "pt-BR": "Freio", en: "Brake" }, "en")).toBe("Brake");
    expect(localized({ "pt-BR": "Freio" }, "en")).toBe("Freio");
  });
});

describe("recovery kit", () => {
  test("resolves catalog copy and only runnable actions", () => {
    const retry = jest.fn();
    const recovery = resolveRecovery("ACCOUNT_DELETE_PENDING_DATA", { retry });
    expect(recovery.titleKey).toBe("errors.ACCOUNT_DELETE_PENDING_DATA.title");
    expect(recovery.actions.map((action) => action.pattern)).toEqual(["RETRY"]);
    expect(recovery.primary?.labelKey).toBe("errors.ACCOUNT_DELETE_PENDING_DATA.action");
    recovery.primary?.run();
    expect(retry).toHaveBeenCalled();
    expect(resolveRecovery("NOT_A_CODE").code).toBe("INTERNAL");
  });

  test("diagnostics appear only when a sender is configured", () => {
    configureRecovery({ sendDiagnostics: async () => undefined });
    const withDiag = resolveRecovery("INTERNAL");
    expect(withDiag.canSendDiagnostics).toBe(withDiag.patterns.includes("DIAG"));
  });
});

describe("auth flow", () => {
  test("network failures on first login map to FIRST_LOGIN_ONLINE_REQUIRED", () => {
    expect(loginErrorCode({ code: "INTERNAL", status: 0, details: { network: true } })).toBe("FIRST_LOGIN_ONLINE_REQUIRED");
    expect(loginErrorCode(new LocalError("PASSWORD_CHANGE_REQUIRED"))).toBe("PASSWORD_CHANGE_REQUIRED");
    expect(loginErrorCode(new Error("boom"))).toBe("INTERNAL");
  });

  test("password rules", () => {
    expect(newPasswordProblem("short", "short")).toBe("auth.changePassword.tooShort");
    expect(newPasswordProblem("longenough", "different")).toBe("auth.changePassword.mismatch");
    expect(newPasswordProblem("longenough", "longenough")).toBeUndefined();
  });
});

describe("translations", () => {
  test("pt-BR and en render ICU plurals", () => {
    initI18n("pt-BR");
    setLocale("pt-BR");
    expect(message("sync.pending.summary", { count: 2 })).toBe("2 pendentes");
    expect(message("routes.tabs.today")).toBe("Hoje");
    setLocale("en");
    expect(message("sync.time.minutes", { count: 1 })).toBe("1 minute ago");
    expect(message("auth.login.submit")).toBe("Sign in");
    setLocale("pt-BR");
  });
});
