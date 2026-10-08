import { upsertMirrorRow } from "../../src/db/mirror";
import { assetHistory, distanceMeters, findAssetByCode, parseScanCode, parseScanPurpose, recentAssetIds, rememberAsset, RECENT_ASSETS_MAX, scanDestination, searchAssets } from "../../src/features/assets/logic";
import { homeWidgetsFor } from "../../src/features/home/registry";
import { deleteConfirmationMatches, loadUserSettings, pendingItemCount, saveNavApp, saveWifiOnlyVideo } from "../../src/features/settings/logic";
import { deleteDraft, listDrafts, loadDraft, saveDraft } from "../../src/lib/drafts";
import { permissionGuidance, PERMISSION_KINDS } from "../../src/lib/permissions";
import { enqueue } from "../../src/sync/outbox";
import { createTestRuntime, testId } from "../helpers/runtime";

const NOW = "2026-03-01T12:00:00.000Z";

function asset(id: string, code: string, extra: Record<string, unknown> = {}) {
  return { id, code, name: `Trator ${code}`, category: "TRACTOR", condition: "OPERATIONAL", plate: null, serialNumber: null, updatedAt: NOW, createdAt: NOW, deletedAt: null, ...extra };
}

describe("home registry", () => {
  test("field users get the duty card first; sync appears only with pending or failed work", () => {
    expect(homeWidgetsFor("FIELD", { hasPendingOrFailed: false })).toEqual(["duty", "quickReport", "nextJob", "rentalsToday", "myReports"]);
    expect(homeWidgetsFor("MANAGER", { hasPendingOrFailed: true })).toEqual(["quickReport", "nextJob", "rentalsToday", "myReports", "sync"]);
    expect(homeWidgetsFor(undefined, { hasPendingOrFailed: false })[0]).toBe("quickReport");
  });
});

describe("drafts", () => {
  test("save, resume and delete a wizard draft", async () => {
    const { runtime } = await createTestRuntime();
    const id = testId();
    await saveDraft(runtime.db, { id, kind: "FIELD_REPORT", refId: null, step: "photos", payload: { title: "Vazamento" }, updatedAt: NOW });
    await saveDraft(runtime.db, { id, kind: "FIELD_REPORT", refId: null, step: "review", payload: { title: "Vazamento hidráulico" }, updatedAt: NOW });
    expect(await loadDraft<{ title: string }>(runtime.db, id)).toMatchObject({ step: "review", payload: { title: "Vazamento hidráulico" } });
    expect(await listDrafts(runtime.db, "FIELD_REPORT")).toHaveLength(1);
    expect(await listDrafts(runtime.db, "CHECK_OUT")).toHaveLength(0);
    await deleteDraft(runtime.db, id);
    expect(await loadDraft(runtime.db, id)).toBeUndefined();
  });
});

describe("assets logic", () => {
  test("parses QR payloads and rejects empty scans", () => {
    expect(parseScanCode("agrorende://a/TR-7230")).toBe("TR-7230");
    expect(parseScanCode("  TR-7230 ")).toBe("TR-7230");
    expect(() => parseScanCode("   ")).toThrow(expect.objectContaining({ code: "SCAN_UNREADABLE" }));
  });

  test("finds by code, serial or plate and searches by name", async () => {
    const { runtime } = await createTestRuntime();
    const a = testId();
    const b = testId();
    await upsertMirrorRow(runtime.db, "assets", asset(a, "TR-7230", { serialNumber: "SN123", plate: "ABC-1234" }), 0);
    await upsertMirrorRow(runtime.db, "assets", asset(b, "CO-9", { name: "Colheitadeira 9" }), 0);
    expect((await findAssetByCode(runtime.db, "tr-7230"))?.id).toBe(a);
    expect((await findAssetByCode(runtime.db, "sn123"))?.id).toBe(a);
    expect((await findAssetByCode(runtime.db, "ABC1234"))?.id).toBe(a);
    expect(await findAssetByCode(runtime.db, "NOPE")).toBeUndefined();
    expect((await searchAssets(runtime.db, "colheita")).map((row) => row.id)).toEqual([b]);
  });

  test("recent machines keep the newest first and are capped", async () => {
    const { runtime } = await createTestRuntime();
    const ids = Array.from({ length: RECENT_ASSETS_MAX + 2 }, () => testId());
    for (const id of ids) await rememberAsset(runtime.db, id);
    await rememberAsset(runtime.db, ids[0] ?? "");
    const recent = await recentAssetIds(runtime.db);
    expect(recent).toHaveLength(RECENT_ASSETS_MAX);
    expect(recent[0]).toBe(ids[0]);
  });

  test("history is empty for a machine without records", async () => {
    const { runtime } = await createTestRuntime();
    expect(await assetHistory(runtime.db, testId())).toEqual([]);
  });

  test("scan destinations follow the purpose", () => {
    expect(scanDestination("report", "x")).toBe("/reports/new?assetId=x");
    expect(scanDestination("checkout", "x")).toBe("/rentals/new?assetId=x");
    expect(scanDestination("find", "x")).toBe("/assets/x");
    expect(parseScanPurpose("checkout")).toBe("checkout");
    expect(parseScanPurpose("bogus")).toBe("find");
    expect(parseScanPurpose(undefined)).toBe("find");
  });

  test("distance is roughly right", () => {
    const meters = distanceMeters({ lat: -23.55, lng: -46.63 }, { lat: -23.56, lng: -46.63 });
    expect(meters).toBeGreaterThan(1000);
    expect(meters).toBeLessThan(1200);
  });
});

describe("settings logic", () => {
  test("defaults, saves and counts pending work", async () => {
    const { runtime } = await createTestRuntime();
    expect(await loadUserSettings(runtime.db)).toEqual({ navApp: undefined, wifiOnlyVideo: true });
    await saveNavApp(runtime.db, "waze");
    await saveWifiOnlyVideo(runtime.db, false);
    expect(await loadUserSettings(runtime.db)).toEqual({ navApp: "waze", wifiOnlyVideo: false });
    expect(await pendingItemCount(runtime.db)).toBe(0);
    await enqueue({ id: testId(), name: "user.setDuty", payload: { status: "OFF_DUTY" }, entityType: "user", entityId: testId() }, runtime.db, NOW);
    expect(await pendingItemCount(runtime.db)).toBe(1);
  });

  test("delete confirmation is trimmed and case-insensitive", () => {
    expect(deleteConfirmationMatches(" excluir ", "EXCLUIR")).toBe(true);
    expect(deleteConfirmationMatches("EXCLUI", "EXCLUIR")).toBe(false);
  });
});

describe("permission matrix", () => {
  test("every kind and state has copy, an action and an alternate when needed", () => {
    for (const kind of PERMISSION_KINDS) {
      expect(permissionGuidance(kind, "blocked")).toMatchObject({ action: "openSettings", actionKey: "permissions.action.openSettings", altKey: `permissions.${kind}.alt` });
      expect(permissionGuidance(kind, "undetermined").action).toBe("askAgain");
      expect(permissionGuidance(kind, "granted")).toMatchObject({ action: "none", actionKey: undefined, altKey: undefined });
    }
    expect(permissionGuidance("camera", "limited").state).toBe("granted");
    expect(permissionGuidance("photos", "limited").action).toBe("checkAgain");
  });
});
