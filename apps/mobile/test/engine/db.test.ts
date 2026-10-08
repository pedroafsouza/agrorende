import { openUserDatabase } from "../../src/db/client";
import { bundledMigrations, pendingMigrations, runMigrations } from "../../src/db/migrate";
import { getMirrorRow, upsertMirrorRow } from "../../src/db/mirror";
import { createSqlDb } from "../../src/db/sql";
import { LocalError } from "../../src/lib/errors";
import { memoryHost, memoryDb, nodeDriver } from "../helpers/nodeSqlite";

describe("local database", () => {
  test("a fresh database applies every bundled migration", async () => {
    const host = memoryHost();
    const opened = await openUserDatabase({ userId: "u1", host });
    expect(opened.appliedMigrations).toBe(bundledMigrations.journal.entries.length);
    expect(opened.fileName).toContain("u1");
    const tables = await opened.db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'");
    const names = tables.map((t) => t.name);
    for (const expected of ["outbox", "media_files", "location_buffer", "drafts", "conflicts", "sync_state", "diagnostics_queue", "assets", "field_reports"]) {
      expect(names).toContain(expected);
    }
  });

  test("upgrading from the first migration keeps existing rows", async () => {
    const db = memoryDb();
    expect(await runMigrations(db, bundledMigrations, 1)).toBe(1);
    await upsertMirrorRow(db, "assets", { id: "a1", code: "TR-01", name: "Tractor", hourMeter: 100, isRentable: true }, 0);
    const { pending } = await pendingMigrations(db);
    expect(pending.length).toBe(bundledMigrations.journal.entries.length - 1);
    await runMigrations(db);
    expect((await pendingMigrations(db)).pending).toHaveLength(0);
    const row = await getMirrorRow(db, "assets", "a1");
    expect(row).toMatchObject({ id: "a1", code: "TR-01", hourMeter: 100, isRentable: true });
  });

  test("migrations are deferred by the OTA gate on an existing database", async () => {
    const driver = nodeDriver();
    const db = createSqlDb(driver);
    await runMigrations(db, bundledMigrations, 1);
    const host = { open: async () => driver, removeFile: async () => undefined };
    const opened = await openUserDatabase({ userId: "u2", host, migrationsAllowed: false });
    expect(opened.appliedMigrations).toBe(0);
    expect(opened.deferredMigrations).toBe(bundledMigrations.journal.entries.length - 1);
  });

  test("a failing migration surfaces LOCAL_MIGRATION_FAILED", async () => {
    const broken = { journal: { entries: [{ idx: 0, when: 1, tag: "0000_bad", breakpoints: true }] }, migrations: { m0000: "CREATE TABL nope" } };
    const host = memoryHost();
    await expect(openUserDatabase({ userId: "u3", host, bundle: broken })).rejects.toBeInstanceOf(LocalError);
  });

  test("nested transactions roll back to their savepoint", async () => {
    const db = memoryDb();
    await db.exec("CREATE TABLE t (v INTEGER)");
    await db.transaction(async (tx) => {
      await tx.run("INSERT INTO t VALUES (1)");
      await tx.transaction(async (inner) => {
        await inner.run("INSERT INTO t VALUES (2)");
        throw new Error("boom");
      }).catch(() => undefined);
    });
    expect(await db.all("SELECT v FROM t")).toEqual([{ v: 1 }]);
  });
});
