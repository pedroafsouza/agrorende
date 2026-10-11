import type { WorkOrderReportLabels } from "@agrorende/core/modules/workOrders/report";

import { loadMessages } from "@/lib/i18n.server";
import { resolveLocale, type SupportedLocale } from "@agrorende/i18n/locales";

const LABEL_KEYS = [
  "title",
  "number",
  "generatedAt",
  "asset",
  "customer",
  "site",
  "assignee",
  "type",
  "priority",
  "status",
  "createdAt",
  "startedAt",
  "completedAt",
  "verifiedAt",
  "verifiedBy",
  "travelTime",
  "workTime",
  "minutesSuffix",
  "hourMeter",
  "description",
  "resolution",
  "rootCause",
  "checklist",
  "safetyCritical",
  "parts",
  "partName",
  "quantity",
  "unitCost",
  "costs",
  "labor",
  "partsCost",
  "external",
  "total",
  "photos",
  "morePhotos",
  "signature",
  "signer",
  "witness",
  "signatureReason",
  "timeline",
  "none",
  "provider",
  "providerName",
  "agreedValue",
  "paymentMethod",
  "paidByCustomer",
  "paidByProvider",
] as const satisfies readonly Exclude<keyof WorkOrderReportLabels, "enumLabel">[];

/** Resolves the PDF labels from `messages/<documentLocale>/jobs.json` (`report.*` and `enums.*`). */
export async function reportLabels(documentLocale: string): Promise<WorkOrderReportLabels> {
  const locale: SupportedLocale = resolveLocale([documentLocale]);
  const messages = await loadMessages(locale, ["jobs"]);
  const jobs = (messages.jobs ?? {}) as Record<string, unknown>;
  const raw = (key: string): string => {
    let node: unknown = jobs;
    for (const part of key.split(".")) node = typeof node === "object" && node !== null ? (node as Record<string, unknown>)[part] : undefined;
    return typeof node === "string" ? node : key;
  };
  const labels = Object.fromEntries(LABEL_KEYS.map((key) => [key, raw(`report.${key}`)])) as Record<(typeof LABEL_KEYS)[number], string>;
  return {
    ...labels,
    enumLabel: (group, value) => {
      const label = raw(`enums.${group}.${value}`);
      return label === `enums.${group}.${value}` ? value : label;
    },
  };
}
