import type { IssueCategory } from "@agrorende/contracts/enums";
import type { LiveFix, Tx } from "@agrorende/contracts/seams";
import type { User } from "@agrorende/db";

import type { Ctx } from "../../context.js";
import { reject } from "../../errors.js";
import { dbTx } from "../assets/kit.js";
import { lastFixes } from "../locations/service.js";
import { loadWorkOrder, requireOffice, sameTenant } from "./common.js";
import { openCountByAssignee } from "./service.js";

/** Suggestion reasons are i18n keys under `jobs.suggest.reason.*` (web) and are never free text. */
export type SuggestionReason = "onDuty" | "offDuty" | "skillMatch" | "nearby" | "lightLoad" | "noLocation";

export interface FieldUserSuggestion {
  readonly userId: string;
  readonly name: string;
  readonly score: number;
  readonly reasons: SuggestionReason[];
  readonly distanceKm: number | null;
  readonly openWorkOrders: number;
  readonly online: boolean;
}

export interface SuggestDeps {
  readonly lastFixes?: (orgId: string, userIds: string[]) => Promise<Map<string, LiveFix>>;
  readonly now?: Date;
}

export const SUGGESTION_LIMIT = 5;
const ONLINE_WINDOW_MS = 15 * 60_000;

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface ScoreInput {
  readonly onDuty: boolean;
  readonly skillMatch: boolean;
  readonly distanceKm: number | null;
  readonly openWorkOrders: number;
}

/** A§6.4: on duty 40 + skill 30 + distance 20·max(0, 1 − km/100) + load max(0, 10 − 3·open). */
export function scoreTechnician(input: ScoreInput): { score: number; reasons: SuggestionReason[] } {
  const reasons: SuggestionReason[] = [];
  let score = 0;
  if (input.onDuty) {
    score += 40;
    reasons.push("onDuty");
  } else {
    reasons.push("offDuty");
  }
  if (input.skillMatch) {
    score += 30;
    reasons.push("skillMatch");
  }
  if (input.distanceKm === null) {
    reasons.push("noLocation");
  } else {
    const points = 20 * Math.max(0, 1 - input.distanceKm / 100);
    score += points;
    if (points >= 10) reasons.push("nearby");
  }
  const load = Math.max(0, 10 - 3 * input.openWorkOrders);
  score += load;
  if (input.openWorkOrders === 0) reasons.push("lightLoad");
  return { score: Math.round(score * 10) / 10, reasons };
}

function isCandidate(user: User): boolean {
  if ((user.deletedAt ?? null) !== null || (user.disabledAt ?? null) !== null || (user.archivedAt ?? null) !== null) return false;
  if (!user.isActive || user.joinedAt === null || user.joinedAt === undefined) return false;
  return user.role === "FIELD" || (user.skills ?? []).length > 0;
}

interface Target {
  readonly category: IssueCategory | null;
  readonly point: { lat: number; lng: number } | null;
}

async function targetOf(tx: Tx, input: { workOrderId?: string; fieldReportId?: string }): Promise<Target> {
  const scoped = dbTx(tx);
  let reportId = input.fieldReportId ?? null;
  let point: { lat: number; lng: number } | null = null;
  if (input.workOrderId !== undefined) {
    const wo = await loadWorkOrder(tx, input.workOrderId);
    reportId ??= wo.fieldReportId ?? null;
    if (wo.destLat !== null && wo.destLat !== undefined && wo.destLng !== null && wo.destLng !== undefined) point = { lat: wo.destLat, lng: wo.destLng };
    if (point === null && wo.assetId !== null && wo.assetId !== undefined) {
      const asset = await scoped.db.assets.findOne({ _id: wo.assetId });
      if (asset?.lastLat !== null && asset?.lastLat !== undefined && asset.lastLng !== null && asset.lastLng !== undefined) point = { lat: asset.lastLat, lng: asset.lastLng };
    }
  }
  let category: IssueCategory | null = null;
  if (reportId !== null) {
    const report = await scoped.db.field_reports.findOne({ _id: reportId, deletedAt: null });
    if (report === null) return reject("NOT_FOUND", { entityType: "FIELD_REPORT", id: reportId });
    category = report.category ?? null;
    if (point === null && report.lat !== null && report.lat !== undefined && report.lng !== null && report.lng !== undefined) point = { lat: report.lat, lng: report.lng };
    if (point === null && report.assetId !== null && report.assetId !== undefined) {
      const asset = await scoped.db.assets.findOne({ _id: report.assetId });
      if (asset?.lastLat !== null && asset?.lastLat !== undefined && asset.lastLng !== null && asset.lastLng !== undefined) point = { lat: asset.lastLat, lng: asset.lastLng };
    }
  }
  return { category, point };
}

/**
 * `GET /work-orders/:id/suggestions` and `GET /work-orders/suggestions?fieldReportId=` (FR-12, WO-04).
 * Top five technicians by the A§6.4 score; ties keep FIELD users first, then the name.
 */
export async function suggestTechnicians(
  tx: Tx,
  ctx: Ctx,
  input: { workOrderId?: string; fieldReportId?: string },
  deps: SuggestDeps = {},
): Promise<{ items: FieldUserSuggestion[] }> {
  const scoped = dbTx(tx);
  sameTenant(scoped, ctx);
  requireOffice(ctx);
  if (input.workOrderId === undefined && input.fieldReportId === undefined) reject("VALIDATION_FAILED", { fieldErrors: { fieldReportId: ["required"] } });
  const target = await targetOf(tx, input);
  const users = ((await scoped.db.users.find({ deletedAt: null, isActive: true }).toArray()) as User[]).filter(isCandidate);
  const ids = users.map((user) => user._id);
  const fixes = await (deps.lastFixes ?? ((orgId: string, userIds: string[]) => lastFixes(orgId, userIds)))(ctx.orgId, ids);
  const open = await openCountByAssignee(tx, ctx.orgId);
  const siteIds = [...new Set(users.map((user) => user.homeSiteId).filter((id): id is string => typeof id === "string"))];
  const sites = siteIds.length === 0 ? [] : await scoped.db.sites.find({ _id: { $in: siteIds } }).toArray();
  const siteById = new Map(sites.map((site) => [site._id, site]));
  const now = (deps.now ?? new Date()).getTime();

  const scored = users.map((user) => {
    const fix = fixes.get(user._id) ?? null;
    const home = user.homeSiteId === null || user.homeSiteId === undefined ? undefined : siteById.get(user.homeSiteId);
    const from =
      fix !== null
        ? { lat: fix.lat, lng: fix.lng }
        : home?.lat !== null && home?.lat !== undefined && home.lng !== null && home.lng !== undefined
          ? { lat: home.lat, lng: home.lng }
          : null;
    const distanceKm = from === null || target.point === null ? null : Math.round(haversineKm(from, target.point) * 10) / 10;
    const openWorkOrders = open.get(user._id) ?? 0;
    const { score, reasons } = scoreTechnician({
      onDuty: user.dutyStatus === "ON_DUTY",
      skillMatch: target.category !== null && (user.skills ?? []).includes(target.category),
      distanceKm,
      openWorkOrders,
    });
    return {
      user,
      suggestion: {
        userId: user._id,
        name: user.name,
        score,
        reasons,
        distanceKm,
        openWorkOrders,
        online: fix !== null && now - fix.recordedAt.getTime() <= ONLINE_WINDOW_MS,
      } satisfies FieldUserSuggestion,
    };
  });
  scored.sort((a, b) => {
    if (b.suggestion.score !== a.suggestion.score) return b.suggestion.score - a.suggestion.score;
    const fieldA = a.user.role === "FIELD" ? 0 : 1;
    const fieldB = b.user.role === "FIELD" ? 0 : 1;
    if (fieldA !== fieldB) return fieldA - fieldB;
    return a.user.name.localeCompare(b.user.name);
  });
  return { items: scored.slice(0, SUGGESTION_LIMIT).map((row) => row.suggestion) };
}
