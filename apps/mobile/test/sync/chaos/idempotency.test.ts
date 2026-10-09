import { copyFile, mkdir, open, stat } from "node:fs/promises";
import path from "node:path";

import { ERROR_META } from "@agrorende/contracts/errors";
import { uuidv7 } from "uuidv7";
import { describe, expect, it } from "vitest";

import { backupPathFor, openUserDatabase, userDatabaseFileName } from "../../../src/db/client";
import { createSqlDb } from "../../../src/db/sql";
import { markInFlight } from "../../../src/sync/outbox";
import { collectPendingWork } from "../../../src/sync/handoff";
import { nodeDriver } from "../../helpers/nodeSqlite";
import { expectCatalog, localCode } from "./catalog";
import { fileHost } from "./device";
import { countRequests, SEED } from "./harness";
import { bundleWithExtraMigration, createOfflineReport, PHOTO } from "./scenario";
import { useChaosSuite } from "./suite";
import { bundledMigrations, latestMigrationWhen, type MigrationBundle } from "../../../src/db/migrate";

const suite = useChaosSuite();
const FIELD_2 = "018fd000-0000-7000-8000-000000000069";

function brokenBundle(): MigrationBundle {
  const latest = latestMigrationWhen(bundledMigrations);
  const entries = bundledMigrations.journal.entries;
  const idx = entries.length;
  const tag = `${String(idx).padStart(4, "0")}_chaos_broken`;
  return {
    journal: { ...bundledMigrations.journal, entries: [...entries, { idx, when: latest + 1000, tag, breakpoints: true }] },
    migrations: {
      ...bundledMigrations.migrations,
      [`m${String(idx).padStart(4, "0")}`]: "CREATE TABLE `chaos_half` (`id` text);\n--> statement-breakpoint\nCREATE INDEX `chaos_broken_idx` ON `no_such_table` (`id`);",
    },
  };
}

async function tableNames(file: string): Promise<string[]> {
  const db = createSqlDb(nodeDriver(file));
  try {
    const rows = await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name");
    return rows.map((row) => row.name);
  } finally {
    await db.close();
  }
}

describe("idempotency (A1, A7) and local corruption cases", () => {
  it("A7: rows left IN_FLIGHT by a killed sync loop return to PENDING with no pushAttemptId and apply once", async () => {
    const device = await suite.device("a7");
    const server = suite.server();
    const reports = [await createOfflineReport(device, [], "A7 um"), await createOfflineReport(device, [], "A7 dois")];
    const ids = (await device.sqlDb.all<{ id: string }>("SELECT id FROM outbox ORDER BY seq")).map((row) => row.id);
    expect(ids).toHaveLength(2);

    // The push reaches the server and is applied, then the app dies before reading the response.
    server.inject({ kind: "drop", match: /^POST \/sync\/push/, times: 1 });
    expect((await device.sync()).ok).toBe(false);
    // Process death between markInFlight and the response handler.
    await markInFlight(device.sqlDb, ids, uuidv7(), new Date(device.clock.now()).toISOString());
    expect(await device.count("SELECT COUNT(*) AS n FROM outbox WHERE status = 'IN_FLIGHT' AND pushAttemptId IS NOT NULL")).toBe(2);
    await device.kill();
    await device.restart();
    expect(await device.count("SELECT COUNT(*) AS n FROM outbox WHERE status = 'PENDING' AND pushAttemptId IS NULL AND inFlightAt IS NULL")).toBe(2);

    const result = await device.syncUntilIdle();
    expect(result.ok).toBe(true);
    for (const report of reports) expect(await server.seeded.raw("field_reports").countDocuments({ _id: report.id })).toBe(1);
    expect(await server.seeded.raw("processed_mutations").countDocuments({ mutationId: { $in: ids } })).toBe(2);
    expect(await device.count("SELECT COUNT(*) AS n FROM outbox")).toBe(0);
  });

  it("A7: a sync loop killed while the push hangs leaves no IN_FLIGHT row and no duplicate after restart", async () => {
    const device = await suite.device("a7-hang");
    const server = suite.server();
    const report = await createOfflineReport(device, [], "A7 travado");
    server.inject({ kind: "hang", match: /^POST \/sync\/push/, times: 1 });
    const pending = device.sync().catch(() => undefined);
    for (let i = 0; i < 100 && (await device.count("SELECT COUNT(*) AS n FROM outbox WHERE status = 'IN_FLIGHT'")) === 0; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(await device.count("SELECT COUNT(*) AS n FROM outbox WHERE status = 'IN_FLIGHT'")).toBe(1);
    await device.kill();
    await pending;
    await device.restart();
    expect(await device.count("SELECT COUNT(*) AS n FROM outbox WHERE status = 'IN_FLIGHT'")).toBe(0);
    expect((await device.syncUntilIdle()).ok).toBe(true);
    expect(await server.seeded.raw("field_reports").countDocuments({ _id: report.id })).toBe(1);
  });

  it("A1: a mutation id reused by another user or with another payload is VALIDATION_FAILED.mutationIdReuse, applies nothing and discloses nothing", async () => {
    expectCatalog("VALIDATION_FAILED", "EC-SYN-09");
    const server = suite.server();
    const owner = await suite.device("a1-owner");
    const original = await createOfflineReport(owner, [], "A1 original");
    const reusedId = (await owner.sqlDb.get<{ id: string }>("SELECT id FROM outbox"))?.id ?? "";
    expect((await owner.syncUntilIdle()).ok).toBe(true);
    const stored = await server.seeded.raw("processed_mutations").findOne({ mutationId: reusedId });
    expect(stored?.userId).toBe(SEED.field);

    // Another user's device sends a different command under the same id.
    const other = await suite.device("a1-other", FIELD_2);
    const intruder = await createOfflineReport(other, [], "A1 intruso");
    await other.sqlDb.run("UPDATE outbox SET id = ?", [reusedId]);
    expect((await other.sync()).ok).toBe(true);
    const conflict = await other.sqlDb.get<{ code: string; payload: string }>("SELECT code, payload FROM conflicts WHERE mutationId = ?", [reusedId]);
    expect(conflict?.code).toBe("VALIDATION_FAILED");
    const body = JSON.parse(conflict?.payload ?? "{}") as { details?: { context?: string }; payload?: unknown };
    expect(body.details?.context).toBe("mutationIdReuse");
    // The owner's stored result (report id and number) never reaches the other user.
    expect(conflict?.payload).not.toContain(original.id);
    expect(await server.seeded.raw("field_reports").countDocuments({ _id: intruder.id })).toBe(0);
    expect((await server.seeded.raw("processed_mutations").findOne({ mutationId: reusedId }))?.userId).toBe(SEED.field);

    // The same user with a different payload under the same id is refused the same way.
    const second = await createOfflineReport(owner, [], "A1 outro conteúdo");
    await owner.sqlDb.run("UPDATE outbox SET id = ?", [reusedId]);
    await owner.sync();
    const ownConflict = await owner.sqlDb.get<{ code: string; payload: string }>("SELECT code, payload FROM conflicts WHERE mutationId = ?", [reusedId]);
    expect(ownConflict?.code).toBe("VALIDATION_FAILED");
    expect(await server.seeded.raw("field_reports").countDocuments({ _id: second.id })).toBe(0);
    expect(await server.seeded.raw("field_reports").countDocuments({ _id: original.id })).toBe(1);
    // The rejected intent stays available for "Save a copy".
    const handoff = await collectPendingWork(owner.sqlDb, { userId: SEED.field, nowIso: new Date().toISOString() });
    expect(handoff.conflicts.some((row) => row.mutationId === reusedId)).toBe(true);
  });

  it("EC-SYN-13: a corrupted copy of the DB raises LOCAL_DB_REPAIR_REQUIRED while the original and its queue stay intact and exportable", async () => {
    expectCatalog("LOCAL_DB_REPAIR_REQUIRED", "EC-SYN-13");
    expect(ERROR_META.LOCAL_DB_REPAIR_REQUIRED.recovery).toContain("HANDOFF");
    const device = await suite.device("db-corrupt");
    device.online = false;
    const report = await createOfflineReport(device, [PHOTO, PHOTO]);
    const userId = device.userId ?? "";
    await device.kill();

    const original = path.join(device.dir, userDatabaseFileName(userId));
    const copyDir = path.join(device.dir, "corrupt-copy");
    await mkdir(copyDir, { recursive: true });
    const copy = path.join(copyDir, userDatabaseFileName(userId));
    await copyFile(original, copy);
    const size = (await stat(copy)).size;
    const handle = await open(copy, "r+");
    try {
      // Garbage over every page after the header page: tables become unreadable b-trees.
      await handle.write(Buffer.alloc(Math.max(0, size - 4096), 0xa5), 0, Math.max(0, size - 4096), 4096);
    } finally {
      await handle.close();
    }
    expect(await localCode(openUserDatabase({ userId, host: fileHost(copyDir) }))).toBe("LOCAL_DB_REPAIR_REQUIRED");

    // The original is untouched: it opens, keeps the queue and the handoff lists every item and file.
    await device.restart();
    expect(await device.count("SELECT COUNT(*) AS n FROM outbox WHERE status = 'PENDING'")).toBe(1);
    const handoff = await collectPendingWork(device.sqlDb, { userId, nowIso: new Date().toISOString() });
    expect(handoff.outbox.map((row) => row.entityId)).toEqual([report.id]);
    expect(handoff.media.map((row) => row.mediaId).sort()).toEqual(report.media.map((m) => m.id).sort());
    for (const uri of handoff.files) expect(await device.files.exists(uri)).toBe(true);

    device.online = true;
    expect((await device.syncUntilIdle()).ok).toBe(true);
    expect(await suite.server().seeded.raw("field_reports").countDocuments({ _id: report.id })).toBe(1);
  });

  it("EC-SYN-12: a failing migration keeps the copy-before-migrate backup, drops no table, exports safely and succeeds on retry", async () => {
    expectCatalog("LOCAL_MIGRATION_FAILED", "EC-SYN-12");
    expect(ERROR_META.LOCAL_MIGRATION_FAILED.recovery).toEqual(expect.arrayContaining(["RETRY", "UPDATE", "DIAG", "OFFICE"]));
    const device = await suite.device("db-migrate");
    device.online = false;
    for (let i = 0; i < 30; i += 1) await createOfflineReport(device, [], `Migração ${i}`);
    const userId = device.userId ?? "";
    const file = path.join(device.dir, userDatabaseFileName(userId));
    await device.kill();
    const before = await tableNames(file);

    await expect(device.restart({ bundle: brokenBundle() })).rejects.toMatchObject({ code: "LOCAL_MIGRATION_FAILED" });
    const after = await tableNames(file);
    for (const table of before) expect(after).toContain(table);
    expect(after).not.toContain("chaos_half");

    // "Save my pending work" reads the readable pre-migration copy.
    const backup = createSqlDb(nodeDriver(backupPathFor(file)));
    try {
      const handoff = await collectPendingWork(backup, { userId, nowIso: new Date().toISOString() });
      expect(handoff.outbox).toHaveLength(30);
    } finally {
      await backup.close();
    }

    // The next app start (fixed bundle) migrates and the queue drains in order.
    await device.kill();
    await device.restart({ bundle: bundleWithExtraMigration() });
    expect(await device.count("SELECT COUNT(*) AS n FROM outbox WHERE status = 'PENDING'")).toBe(30);
    device.online = true;
    expect((await device.syncUntilIdle()).ok).toBe(true);
    expect(await device.count("SELECT COUNT(*) AS n FROM outbox")).toBe(0);
    expect(countRequests(suite.server(), /^POST \/sync\/push/, device.deviceId)).toBeGreaterThanOrEqual(1);
  });
});
