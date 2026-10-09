import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createNamedSeededDb, SEED, seedCtx, type SeededDb } from "../../auth/testing/seeded.js";
import { push } from "../../sync/push.js";
import { commentParticipants, listComments } from "./service.js";

const DEVICE = "018fd000-0000-7000-8000-00000000d171";

let seeded: SeededDb;
let workOrder: { _id: string; assigneeId: string; createdById: string };

function pushRequest(mutations: { id: string; name: string; payload: unknown; occurredAt?: string }[]) {
  return {
    deviceId: DEVICE,
    clientTime: new Date().toISOString(),
    deviceStatus: { appVersion: "1.1.0", runtimeVersion: "1", pendingMutations: mutations.length, pendingUploads: 0, pendingBytes: 0, scopeEpoch: 0 },
    mutations: mutations.map((m) => ({ id: m.id, name: m.name, payload: m.payload, occurredAt: m.occurredAt ?? new Date().toISOString() })),
  };
}

beforeAll(async () => {
  seeded = await createNamedSeededDb("agrorende_t17_comments");
  const row = await seeded.raw("work_orders").findOne({ organizationId: SEED.orgA, assigneeId: { $ne: null }, createdById: { $ne: null }, deletedAt: null });
  if (row === null) throw new Error("The seed has no assigned work order.");
  workOrder = row as unknown as typeof workOrder;
  await seeded.raw("users").updateOne({ _id: workOrder.createdById }, { $set: { locale: "en" } });
}, 60_000);

afterAll(async () => {
  await seeded.close();
});

describe("commentParticipants", () => {
  it("includes the creator, the assignee and earlier commenters, never the author", () => {
    expect(commentParticipants({ creatorId: "c", assigneeId: "a" }, ["x", "a", "author"], "author").sort()).toEqual(["a", "c", "x"]);
    expect(commentParticipants({ creatorId: "author", assigneeId: null }, [], "author")).toEqual([]);
  });
});

describe("comment.create through sync push (PLT-10)", () => {
  it("syncs an offline comment once and notifies the participants except the author", async () => {
    const technician = seedCtx(workOrder.assigneeId, "FIELD");
    const commentId = randomUUID();
    const mutationId = randomUUID();
    const writtenOffline = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const body = pushRequest([{ id: mutationId, name: "comment.create", payload: { id: commentId, entityType: "WORK_ORDER", entityId: workOrder._id, body: "Mangueira trocada, aguardando peça." }, occurredAt: writtenOffline }]);

    const first = await push(technician, body);
    expect(first.results).toEqual([{ id: mutationId, status: "APPLIED" }]);
    const replay = await push(technician, body);
    expect(replay.results).toEqual(first.results);

    expect(await seeded.raw("comments").countDocuments({ _id: commentId })).toBe(1);
    const stored = await seeded.raw("comments").findOne({ _id: commentId });
    expect(stored).toMatchObject({ authorId: workOrder.assigneeId, entityType: "WORK_ORDER", entityId: workOrder._id });
    expect((stored?.createdAt as Date).toISOString()).toBe(writtenOffline);

    const notes = await seeded.raw("notifications").find({ type: "COMMENT_ADDED", entityId: workOrder._id }).toArray();
    expect(notes.map((n) => n.userId)).toEqual([workOrder.createdById]);
    expect(notes[0]).toMatchObject({ title: "New comment" });
    expect(String(notes[0]?.body)).toContain("commented on");

    const activity = await seeded.raw("activity_events").countDocuments({ entityId: workOrder._id, action: "comment.created" });
    expect(activity).toBe(1);
  });

  it("notifies the assignee and earlier commenters when the office replies", async () => {
    const office = seedCtx(workOrder.createdById, "MANAGER");
    const commentId = randomUUID();
    const result = await push(office, pushRequest([{ id: randomUUID(), name: "comment.create", payload: { id: commentId, entityType: "WORK_ORDER", entityId: workOrder._id, body: "Peça chega amanhã." } }]));
    expect(result.results[0]?.status).toBe("APPLIED");
    const notes = await seeded.raw("notifications").find({ type: "COMMENT_ADDED", entityId: workOrder._id, userId: workOrder.assigneeId }).toArray();
    expect(notes).toHaveLength(1);
    const forAuthor = await seeded.raw("notifications").countDocuments({ type: "COMMENT_ADDED", entityId: workOrder._id, userId: workOrder.createdById });
    expect(forAuthor).toBe(1);

    const thread = await listComments(office, { entityType: "WORK_ORDER", entityId: workOrder._id });
    expect(thread.items.map((item) => item.body)).toEqual(["Mangueira trocada, aguardando peça.", "Peça chega amanhã."]);
    expect(thread.items[0]?.authorName).toEqual(expect.any(String));
  });

  it("answers NOT_FOUND to a field user outside the record and across organisations", async () => {
    const other = await seeded.raw("users").findOne({ organizationId: SEED.orgA, role: "FIELD", _id: { $ne: workOrder.assigneeId } });
    expect(other).not.toBeNull();
    const outsider = seedCtx(String(other?._id), "FIELD");
    const result = await push(outsider, pushRequest([{ id: randomUUID(), name: "comment.create", payload: { id: randomUUID(), entityType: "WORK_ORDER", entityId: workOrder._id, body: "?" } }]));
    expect(result.results[0]).toMatchObject({ status: "REJECTED", code: "NOT_FOUND" });
    await expect(listComments(seedCtx(SEED.orgBUser, "ADMIN", SEED.orgB), { entityType: "WORK_ORDER", entityId: workOrder._id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects a parent type without threads", async () => {
    const result = await push(seedCtx(workOrder.assigneeId, "FIELD"), pushRequest([{ id: randomUUID(), name: "comment.create", payload: { id: randomUUID(), entityType: "SITE", entityId: workOrder._id, body: "x" } }]));
    expect(result.results[0]).toMatchObject({ status: "REJECTED", code: "VALIDATION_FAILED" });
  });
});
