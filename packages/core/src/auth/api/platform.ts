import { AppError } from "@agrorende/contracts/errors";
import { OrgSettingsSchema } from "@agrorende/contracts/settings";
import { collections, getDb } from "@agrorende/db";
import { z } from "zod";

import {
  ingestTelemetry,
  listDevices,
  listDiagnostics,
  registerDevice,
  uploadDiagnostics,
} from "../../modules/devices/service.js";
import {
  completeUpload,
  createWebMedia,
  issuePartUrls,
  issueUploadUrl,
  putBlob,
  putPart,
  readBlob,
  readUrl,
} from "../../modules/media/upload.js";
import { listNotifications, unreadNotificationCount } from "../../modules/notifications/queries.js";
import { markAllRead, markRead } from "../../modules/notifications/service.js";
import {
  createUser,
  deactivateUser,
  getUserAdmin,
  inviteUser,
  listUsersAdmin,
  reactivateUser,
  resetLinkForUser,
  setTemporaryPassword,
  setUserRole,
  updateUser,
} from "../../modules/users/admin.js";
import { pull } from "../../sync/pull.js";
import { push } from "../../sync/push.js";
import { dbTx } from "../../sync/touch.js";
import { withSyncTx } from "../../sync/withSyncTx.js";
import { json, noContent, pageParams, pageResult, readBody, readJson, route, searchParams, type RouteHandler } from "../http.js";
import { enforceRateLimit, RATE_LIMITS } from "../rateLimit.js";
import { authenticate } from "../session.js";

const OFFICE = ["ADMIN", "MANAGER"] as const;
const ADMIN = ["ADMIN"] as const;
const Id = z.string().uuid();

function page(request: Request) {
  const query = searchParams(request);
  return pageParams({ cursor: query.get("cursor"), limit: query.get("limit") });
}

function flag(value: string | null): boolean | undefined {
  if (value === null) return undefined;
  return value === "true" || value === "1";
}

function etag(version: number): string {
  return `"${version}"`;
}

// ───────── Sync ─────────

export const syncPushHandler: RouteHandler = route(async (request) => {
  const { ctx, drain } = await authenticate(request, { allowDrain: true });
  await enforceRateLimit(`${ctx.organizationId}:${ctx.userId}:${ctx.deviceId ?? "web"}`, RATE_LIMITS.push);
  return json(await push(ctx, await readJson(request), { drain }));
});

export const syncPullHandler: RouteHandler = route(async (request) => {
  const { ctx } = await authenticate(request);
  const query = searchParams(request);
  const epoch = query.get("scopeEpoch");
  const input = {
    ...(query.get("cursor") === null ? {} : { cursor: query.get("cursor") }),
    deviceId: query.get("deviceId"),
    scopeEpoch: epoch === null ? 0 : Number(epoch),
  };
  return json(await pull(ctx, input));
});

// ───────── Telemetry and devices ─────────

export const telemetryHandler: RouteHandler = route(async (request) => {
  const { ctx } = await authenticate(request, { allowDrain: true, allowPasswordChange: true });
  await enforceRateLimit(`${ctx.organizationId}:${ctx.userId}`, RATE_LIMITS.telemetry);
  await ingestTelemetry(ctx, await readJson(request));
  return noContent();
});

export const telemetryDiagnosticsHandler: RouteHandler = route(async (request) => {
  const { ctx } = await authenticate(request, { allowDrain: true, allowPasswordChange: true });
  await enforceRateLimit(`${ctx.organizationId}:${ctx.userId}`, RATE_LIMITS.telemetry);
  const result = await uploadDiagnostics(ctx, await readJson(request));
  return json(result, { status: result.duplicate ? 200 : 201 });
});

export const deviceRegisterHandler: RouteHandler = route(async (request) => {
  const { ctx } = await authenticate(request, { allowPasswordChange: true });
  return json(await registerDevice(ctx, await readJson(request)));
});

export const devicesListHandler: RouteHandler = route(async (request) => {
  const { ctx } = await authenticate(request, { roles: ADMIN });
  const query = searchParams(request);
  const userId = query.get("userId");
  return json(await listDevices(ctx, { ...(userId === null ? {} : { userId: Id.parse(userId) }), ...(flag(query.get("stale")) === undefined ? {} : { stale: flag(query.get("stale")) }) }, page(request)));
});

export const deviceDiagnosticsHandler: RouteHandler = route(async (request, params) => {
  const { ctx } = await authenticate(request, { roles: ADMIN });
  return json(await listDiagnostics(ctx, z.string().min(1).max(64).parse(params.id), page(request)));
});

export const userDevicesHandler: RouteHandler = route(async (request, params) => {
  const { ctx } = await authenticate(request, { roles: ADMIN });
  return json(await listDevices(ctx, { userId: Id.parse(params.id) }, page(request)));
});

// ───────── Media ─────────

export const mediaCreateHandler: RouteHandler = route(async (request) => {
  const { ctx } = await authenticate(request, { roles: OFFICE });
  await enforceRateLimit(`${ctx.organizationId}:${ctx.userId}`, RATE_LIMITS.media);
  return json(await createWebMedia(ctx, await readJson(request)), { status: 201 });
});

export const mediaUploadUrlHandler: RouteHandler = route(async (request, params) => {
  const { ctx } = await authenticate(request, { allowDrain: true });
  await enforceRateLimit(`${ctx.organizationId}:${ctx.userId}`, RATE_LIMITS.media);
  return json(await issueUploadUrl(ctx, Id.parse(params.id), await readJson(request)));
});

export const mediaPartsHandler: RouteHandler = route(async (request, params) => {
  const { ctx } = await authenticate(request, { allowDrain: true });
  await enforceRateLimit(`${ctx.organizationId}:${ctx.userId}`, RATE_LIMITS.media);
  return json(await issuePartUrls(ctx, Id.parse(params.id), await readJson(request)));
});

export const mediaCompleteHandler: RouteHandler = route(async (request, params) => {
  const { ctx } = await authenticate(request, { allowDrain: true });
  return json(await completeUpload(ctx, Id.parse(params.id), await readJson(request)));
});

/** Signed blob PUT: authorized by the URL token only. */
export const mediaBlobPutHandler: RouteHandler = route(async (request, params) => {
  const query = searchParams(request);
  const result = await putBlob(Id.parse(params.id), query.get("variant"), query.get("t"), request.body);
  return json(result, { headers: { etag: `"${result.etag}"` } });
});

export const mediaPartPutHandler: RouteHandler = route(async (request, params) => {
  const query = searchParams(request);
  const n = Number.parseInt(params.n ?? "", 10);
  const result = await putPart(Id.parse(params.id), n, query.get("uploadId"), query.get("t"), request.body);
  return json(result, { headers: { etag: `"${result.etag}"` } });
});

export const mediaBlobGetHandler: RouteHandler = route(async (request, params) => {
  const query = searchParams(request);
  const result = await readBlob(Id.parse(params.id), query.get("variant"), query.get("t"), request.headers.get("range"));
  return new Response(result.body, { status: result.status, headers: result.headers });
});

/** `GET /media/:id/url`: 302 to a short-lived signed blob URL. */
export const mediaUrlHandler: RouteHandler = route(async (request, params) => {
  const { ctx } = await authenticate(request);
  const result = await readUrl(ctx, Id.parse(params.id), searchParams(request).get("variant"));
  return new Response(null, { status: 302, headers: { location: result.url, "cache-control": "private, max-age=240" } });
});

// ───────── Users ─────────

export const usersListHandler: RouteHandler = route(async (request) => {
  const { ctx } = await authenticate(request, { roles: OFFICE });
  const query = searchParams(request);
  return json(await listUsersAdmin(ctx, { role: query.get("role"), active: query.get("active"), q: query.get("q") }, page(request)));
});

export const userCreateHandler: RouteHandler = route(async (request) => {
  const { ctx } = await authenticate(request, { roles: ADMIN });
  return json(await createUser(ctx, await readJson(request)), { status: 201 });
});

export const userGetHandler: RouteHandler = route(async (request, params) => {
  const { ctx } = await authenticate(request, { roles: OFFICE });
  const user = await getUserAdmin(ctx, Id.parse(params.id));
  return json(user, { headers: { etag: etag(Number(user.syncVersion)) } });
});

export const userUpdateHandler: RouteHandler = route(async (request, params) => {
  const { ctx } = await authenticate(request, { roles: ADMIN });
  return json(await updateUser(ctx, Id.parse(params.id), await readJson(request), request.headers.get("if-match")));
});

export const userRoleHandler: RouteHandler = route(async (request, params) => {
  const { ctx } = await authenticate(request, { roles: ADMIN });
  return json(await setUserRole(ctx, Id.parse(params.id), await readJson(request)));
});

export const userDeactivateHandler: RouteHandler = route(async (request, params) => {
  const { ctx } = await authenticate(request, { roles: ADMIN });
  return json(await deactivateUser(ctx, Id.parse(params.id)));
});

export const userReactivateHandler: RouteHandler = route(async (request, params) => {
  const { ctx } = await authenticate(request, { roles: ADMIN });
  return json(await reactivateUser(ctx, Id.parse(params.id)));
});

export const userInviteHandler: RouteHandler = route(async (request, params) => {
  const { ctx } = await authenticate(request, { roles: ADMIN });
  return json(await inviteUser(ctx, Id.parse(params.id)));
});

export const userResetLinkHandler: RouteHandler = route(async (request, params) => {
  const { ctx } = await authenticate(request, { roles: ADMIN });
  return json(await resetLinkForUser(ctx, Id.parse(params.id)));
});

export const userTemporaryPasswordHandler: RouteHandler = route(async (request, params) => {
  const { ctx } = await authenticate(request, { roles: ADMIN });
  await setTemporaryPassword(ctx, Id.parse(params.id), await readJson(request));
  return noContent();
});

// ───────── Notifications ─────────

const NotificationsReadSchema = z
  .object({ ids: z.array(Id).max(500).optional(), all: z.boolean().optional() })
  .refine((value) => value.all === true || (value.ids !== undefined && value.ids.length > 0), { message: "ids_or_all", path: ["ids"] });

export const notificationsListHandler: RouteHandler = route(async (request) => {
  const { ctx } = await authenticate(request);
  const params = page(request);
  const unreadOnly = flag(searchParams(request).get("unread")) === true;
  const rows = await listNotifications(ctx, { unreadOnly, offset: params.offset, limit: params.limit + 1 });
  const unread = await unreadNotificationCount(ctx);
  return json({ ...pageResult(rows, params), unreadCount: unread });
});

export const notificationsReadHandler: RouteHandler = route(async (request) => {
  const { ctx } = await authenticate(request);
  const body = await readBody(request, NotificationsReadSchema);
  await withSyncTx(ctx, async (tx) => (body.all === true ? markAllRead(tx, ctx) : markRead(tx, ctx, body.ids ?? [])));
  return noContent();
});

// ───────── Settings ─────────

const SettingsPatchSchema = OrgSettingsSchema.partial().strict();

async function loadOrg(orgId: string) {
  const org = await collections.organizations(await getDb()).findOne({ _id: orgId });
  if (org === null) throw new AppError("NOT_FOUND", { details: { entityType: "ORGANIZATION" } });
  return org;
}

export const settingsGetHandler: RouteHandler = route(async (request) => {
  const { ctx } = await authenticate(request);
  const org = await loadOrg(ctx.organizationId);
  return json(org.settings, { headers: { etag: etag(org.syncVersion) } });
});

/** `PATCH /settings` (ADMIN): partial merge validated against the full `OrgSettingsSchema`; bumps the org row. */
export const settingsPatchHandler: RouteHandler = route(async (request) => {
  const { ctx } = await authenticate(request, { roles: ADMIN });
  const patch = await readBody(request, SettingsPatchSchema);
  const ifMatch = request.headers.get("if-match");
  const updated = await withSyncTx(ctx, async (tx) => {
    const orgs = collections.organizations(await getDb());
    const org = await orgs.findOne({ _id: ctx.organizationId }, { session: dbTx(tx).session });
    if (org === null) throw new AppError("NOT_FOUND", { details: { entityType: "ORGANIZATION" } });
    if (ifMatch !== null && ifMatch.length > 0 && ifMatch.replace(/^W\//u, "").replace(/"/gu, "") !== String(org.syncVersion)) {
      throw new AppError("CONFLICT", { details: { currentVersion: String(org.syncVersion) } });
    }
    const settings = OrgSettingsSchema.parse({ ...org.settings, ...patch });
    await orgs.updateOne({ _id: org._id }, { $set: { settings, syncVersion: tx.syncVersion, updatedAt: new Date() } }, { session: dbTx(tx).session });
    return { settings, syncVersion: tx.syncVersion };
  });
  return json(updated.settings, { headers: { etag: etag(updated.syncVersion) } });
});
