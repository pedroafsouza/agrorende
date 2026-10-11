import { randomUUID } from "node:crypto";

import { AppError } from "@agrorende/contracts/errors";
import { withSyncTx } from "@agrorende/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { memoryRateLimiter, setRateLimiter } from "../../auth/rateLimit";
import { createNamedSeededDb, SEED, seedCtx, type SeededDb } from "../../auth/testing/seeded";
import type { SyncTx } from "../../sync/types";
import { effectiveStatus, generateProviderToken, hashProviderToken, isWellFormedProviderToken, PROVIDER_INVITE_TTL_MS } from "./dto";
import {
  acceptProviderLink,
  completeProviderLink,
  counterProviderLink,
  declineProviderLink,
  markPaidByProvider,
  reportReviewByProvider,
  replyToReviewByProvider,
  viewProviderLink,
} from "./publicLink";
import {
  acceptCounter,
  createInvite,
  createReview,
  customerReplyToReview,
  listInvites,
  markPaidByCustomer,
  reissueInvite,
  reportReviewByCustomer,
  revokeInvite,
  setAgreement,
} from "./service";

let seeded: SeededDb;
let openWorkOrders: string[] = [];
let next = 0;
const manager = () => seedCtx(SEED.manager, "MANAGER");
const APP_URL = "https://app.example.test";

function tx<T>(fn: (tx: SyncTx) => Promise<T>): Promise<T> {
  return withSyncTx({ orgId: SEED.orgA }, (dbTx) => fn(dbTx));
}

function nextWorkOrder(): string {
  const id = openWorkOrders[next];
  next += 1;
  if (id === undefined) throw new Error("The seed ran out of open work orders.");
  return id;
}

function tokenOf(url: string): string {
  return url.split("/p/")[1] ?? "";
}

async function invite(workOrderId: string, input: Record<string, unknown> = { providerName: "Oficina do Zé", phone: "(64) 99999-0000" }) {
  return tx((t) => createInvite(t, manager(), workOrderId, input, { appUrl: APP_URL }));
}

async function expectCode(promise: Promise<unknown>, code: string, details?: Record<string, unknown>): Promise<void> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
  if (details !== undefined) expect((error as AppError).details).toMatchObject(details);
}

beforeAll(async () => {
  seeded = await createNamedSeededDb("agrorende_supplier");
  const rows = await seeded
    .raw("work_orders")
    .find({ organizationId: SEED.orgA, deletedAt: null, status: { $in: ["OPEN", "ASSIGNED", "ACCEPTED", "IN_PROGRESS", "ON_HOLD"] } })
    .toArray();
  const template = rows[0];
  if (template === undefined) throw new Error("The seed has no open work order.");
  const copies = Array.from({ length: 12 }, (_, index) => ({ ...template, _id: randomUUID(), number: `OS-PRV-${index}` }));
  await seeded.raw("work_orders").insertMany(copies);
  openWorkOrders = copies.map((row) => row._id);
}, 60_000);

beforeEach(() => {
  setRateLimiter(memoryRateLimiter());
});

afterAll(async () => {
  setRateLimiter(null);
  await seeded.close();
});

describe("provider tokens", () => {
  it("are random base64url strings stored only as a hash", () => {
    const a = generateProviderToken();
    const b = generateProviderToken();
    expect(a).not.toBe(b);
    expect(isWellFormedProviderToken(a)).toBe(true);
    expect(isWellFormedProviderToken("short")).toBe(false);
    expect(hashProviderToken(a)).toMatch(/^[0-9a-f]{64}$/u);
    expect(hashProviderToken(a)).not.toContain(a);
  });

  it("reads a pending invite as EXPIRED after seven days", () => {
    const now = new Date();
    expect(effectiveStatus({ status: "SENT", expiresAt: new Date(now.getTime() - 1) }, now)).toBe("EXPIRED");
    expect(effectiveStatus({ status: "ACCEPTED", expiresAt: new Date(now.getTime() - 1) }, now)).toBe("ACCEPTED");
  });
});

describe("office invite flow (#63)", () => {
  it("creates an invite with a hashed token, a seven-day expiry and a history entry", async () => {
    const workOrderId = nextWorkOrder();
    const before = Date.now();
    const issued = await invite(workOrderId);
    expect(issued.link.url.startsWith(`${APP_URL}/p/`)).toBe(true);
    const token = tokenOf(issued.link.url);
    const stored = await seeded.raw("provider_invites").findOne({ _id: issued.invite.id });
    expect(stored?.tokenHash).toBe(hashProviderToken(token));
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(stored?.phone).toBe("64999990000");
    expect((stored?.expiresAt as Date).getTime() - before).toBeGreaterThanOrEqual(PROVIDER_INVITE_TTL_MS - 1000);
    expect(issued.invite.status).toBe("SENT");
    expect(await seeded.raw("activity_events").countDocuments({ entityId: workOrderId, action: "provider.invited" })).toBe(1);
  });

  it("needs a phone or an email and refuses a second active invite", async () => {
    const workOrderId = nextWorkOrder();
    await expectCode(invite(workOrderId, { providerName: "Sem contato" }), "VALIDATION_FAILED");
    await invite(workOrderId, { providerName: "Ana", email: "ana@example.com" });
    await expectCode(invite(workOrderId), "INVALID_TRANSITION", { context: "activeInviteExists" });
    const queued = await seeded.raw("event_outbox").findOne({ type: "provider.inviteEmail", "payload.data.workOrderId": workOrderId });
    expect(JSON.stringify(queued)).not.toContain("ana@example.com");
  });

  it("is office only and cannot see other organisations' work orders", async () => {
    const workOrderId = nextWorkOrder();
    await expectCode(tx((t) => createInvite(t, seedCtx(SEED.field, "FIELD"), workOrderId, { providerName: "X", phone: "64999990000" })), "FORBIDDEN");
    await expectCode(listInvites(seedCtx(SEED.orgBUser, "ADMIN", SEED.orgB), workOrderId), "NOT_FOUND");
  });

  it("reissues a fresh link, the old one stops working, and revoke closes it", async () => {
    const workOrderId = nextWorkOrder();
    const first = await invite(workOrderId);
    const second = await tx((t) => reissueInvite(t, manager(), workOrderId, first.invite.id, { appUrl: APP_URL }));
    expect(tokenOf(second.link.url)).not.toBe(tokenOf(first.link.url));
    await expectCode(viewProviderLink(tokenOf(first.link.url)), "INVITE_EXPIRED", { reason: "invalid" });
    await viewProviderLink(tokenOf(second.link.url));
    await tx((t) => revokeInvite(t, manager(), workOrderId, first.invite.id));
    await expectCode(viewProviderLink(tokenOf(second.link.url)), "INVITE_EXPIRED", { reason: "revoked" });
    const list = await listInvites(manager(), workOrderId);
    expect(list.items[0]?.status).toBe("REVOKED");
  });

  it("expires a pending link after seven days and lets the office reissue it", async () => {
    const workOrderId = nextWorkOrder();
    const issued = await invite(workOrderId);
    const later = new Date(Date.now() + PROVIDER_INVITE_TTL_MS + 60_000);
    await expectCode(viewProviderLink(tokenOf(issued.link.url), { now: later }), "INVITE_EXPIRED", { reason: "expired" });
    expect((await seeded.raw("provider_invites").findOne({ _id: issued.invite.id }))?.status).toBe("EXPIRED");
    const again = await tx((t) => reissueInvite(t, manager(), workOrderId, issued.invite.id, { appUrl: APP_URL, now: later }));
    expect(again.invite.status).toBe("SENT");
  });
});

describe("magic link (#64) and payment (#65)", () => {
  it("opens, accepts, completes and records both payment confirmations", async () => {
    const workOrderId = nextWorkOrder();
    const issued = await invite(workOrderId);
    const token = tokenOf(issued.link.url);
    const view = await viewProviderLink(token);
    expect(view.invite.status).toBe("OPENED");
    expect(view.workOrder.title.length).toBeGreaterThan(0);
    expect(JSON.stringify(view)).not.toMatch(/"phone"|"email"|64999990000/u);

    await expectCode(completeProviderLink(token, { note: "Pronto" }), "INVALID_TRANSITION", { context: "notAccepted" });
    expect((await acceptProviderLink(token)).invite.status).toBe("ACCEPTED");
    await expectCode(markPaidByProvider(token), "INVALID_TRANSITION", { context: "agreementMissing" });

    await tx((t) => setAgreement(t, manager(), workOrderId, issued.invite.id, { agreedValueCents: 150_000, paymentMethod: "PIX" }));
    const done = await completeProviderLink(token, { note: "Troquei a correia." });
    expect(done.invite).toMatchObject({ status: "COMPLETED", completionNote: "Troquei a correia.", agreedValueCents: 150_000, paymentMethod: "PIX" });

    const paidProvider = await markPaidByProvider(token);
    expect(paidProvider.invite.providerPaidAt).not.toBeNull();
    const paidCustomer = await tx((t) => markPaidByCustomer(t, manager(), workOrderId, issued.invite.id));
    expect(paidCustomer.customerPaidAt).not.toBeNull();
    expect(paidCustomer.providerPaidAt).not.toBeNull();
    await expectCode(
      tx((t) => setAgreement(t, manager(), workOrderId, issued.invite.id, { agreedValueCents: 1, paymentMethod: "CASH" })),
      "INVALID_TRANSITION",
      { context: "paymentConfirmed" },
    );

    const actions = (await seeded.raw("activity_events").find({ entityId: workOrderId }).toArray()).map((row) => row.action);
    expect(actions).toEqual(expect.arrayContaining(["provider.opened", "provider.accepted", "provider.agreementSet", "provider.completed", "provider.paidProvider", "provider.paidCustomer"]));
  });

  it("records a decline with its reason and then refuses accepting", async () => {
    const workOrderId = nextWorkOrder();
    const token = tokenOf((await invite(workOrderId)).link.url);
    const declined = await declineProviderLink(token, { reason: "Sem agenda" });
    expect(declined.invite).toMatchObject({ status: "DECLINED", declineReason: "Sem agenda" });
    await expectCode(acceptProviderLink(token), "INVALID_TRANSITION", { context: "notPending" });
  });

  it("takes a counter-proposal that the office can accept as the agreed value", async () => {
    const workOrderId = nextWorkOrder();
    const issued = await invite(workOrderId);
    const token = tokenOf(issued.link.url);
    await expectCode(counterProviderLink(token, {}), "VALIDATION_FAILED");
    const countered = await counterProviderLink(token, { priceCents: 98_000, date: "2030-05-02" });
    expect(countered.invite).toMatchObject({ status: "COUNTERED", proposedPriceCents: 98_000, proposedDate: "2030-05-02" });
    const accepted = await tx((t) => acceptCounter(t, manager(), workOrderId, issued.invite.id));
    expect(accepted).toMatchObject({ status: "ACCEPTED", agreedValueCents: 98_000 });
  });

  it("answers INVITE_EXPIRED for malformed or unknown tokens and rate-limits lookups", async () => {
    await expectCode(viewProviderLink("nope"), "INVITE_EXPIRED", { reason: "invalid" });
    await expectCode(viewProviderLink(generateProviderToken()), "INVITE_EXPIRED", { reason: "invalid" });
    const hammer = Array.from({ length: 31 }, () => viewProviderLink("x", { clientKey: "1.2.3.4" }).catch((error: unknown) => error));
    const results = await Promise.all(hammer);
    expect(results.some((error) => error instanceof AppError && error.code === "RATE_LIMITED")).toBe(true);
  });
});

describe("reviews (#66)", () => {
  it("only reviews completed invites and limits the thread to provider reply then customer final reply", async () => {
    const workOrderId = nextWorkOrder();
    const issued = await invite(workOrderId);
    const token = tokenOf(issued.link.url);
    const review = { rating: 4, criteria: { punctuality: 5, quality: 4, price: 3, communication: 5 }, comment: "Bom serviço" };
    await expectCode(tx((t) => createReview(t, manager(), workOrderId, issued.invite.id, review)), "INVALID_TRANSITION", { context: "inviteNotCompleted" });

    await acceptProviderLink(token);
    await completeProviderLink(token, { note: "Feito" });
    await expectCode(tx((t) => createReview(t, manager(), workOrderId, issued.invite.id, { ...review, rating: 6 })), "VALIDATION_FAILED");
    const created = await tx((t) => createReview(t, manager(), workOrderId, issued.invite.id, review));
    expect(created).toMatchObject({ rating: 4, threadStatus: "OPEN", moderationStatus: "NONE" });
    await expectCode(tx((t) => createReview(t, manager(), workOrderId, issued.invite.id, review)), "INVALID_TRANSITION", { context: "reviewExists" });

    await expectCode(tx((t) => customerReplyToReview(t, manager(), workOrderId, created.id, { body: "Cedo demais" })), "INVALID_TRANSITION", { context: "providerReplyMissing" });
    const replied = await replyToReviewByProvider(token, { body: "Obrigado!" });
    expect(replied.review?.providerReply?.body).toBe("Obrigado!");
    await expectCode(replyToReviewByProvider(token, { body: "De novo" }), "INVALID_TRANSITION", { context: "reviewThreadClosed" });

    const closed = await tx((t) => customerReplyToReview(t, manager(), workOrderId, created.id, { body: "Até a próxima" }));
    expect(closed.threadStatus).toBe("CLOSED");
    await expectCode(tx((t) => customerReplyToReview(t, manager(), workOrderId, created.id, { body: "Mais uma" })), "INVALID_TRANSITION", { context: "reviewThreadClosed" });

    const flagged = await reportReviewByProvider(token, { reason: "Injusto" });
    expect(flagged.review).toMatchObject({ moderationStatus: "FLAGGED", reportedBy: ["PROVIDER"] });
    const both = await tx((t) => reportReviewByCustomer(t, manager(), workOrderId, created.id, {}));
    expect(both.reportedBy).toEqual(["PROVIDER", "CUSTOMER"]);
  });
});
