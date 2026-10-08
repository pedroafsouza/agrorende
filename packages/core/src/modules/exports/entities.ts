import type { Role } from "@agrorende/contracts/enums";

import type { ExportEntity, ExportFilters } from "./dto.js";
import type { ExportHeaderKey } from "./headers.js";

export type ColumnKind = "text" | "date" | "cents" | "number" | "bool";
export type ExportRow = Readonly<Record<string, unknown>>;

export interface ExportColumn {
  readonly key: ExportHeaderKey;
  readonly kind: ColumnKind;
  readonly value?: (row: ExportRow) => unknown;
}

export interface ExportEntityDef {
  readonly entity: ExportEntity;
  readonly collection: "fieldReports" | "workOrders" | "rentals" | "assets" | "locationPings";
  readonly roles: readonly Role[];
  readonly dateField: string;
  readonly softDelete: boolean;
  readonly columns: readonly ExportColumn[];
  readonly filter: (filters: ExportFilters) => Record<string, unknown>;
}

const OFFICE: readonly Role[] = ["ADMIN", "MANAGER"];

function pick(filters: ExportFilters, map: Partial<Record<keyof ExportFilters, string>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [filterKey, field] of Object.entries(map)) {
    const value = filters[filterKey as keyof ExportFilters];
    if (value !== undefined && field !== undefined) out[field] = value;
  }
  return out;
}

const cents = (row: ExportRow, key: string): number => (typeof row[key] === "number" ? (row[key] as number) : 0);

export const EXPORT_DEFINITIONS: Readonly<Record<ExportEntity, ExportEntityDef>> = {
  "field-reports": {
    entity: "field-reports",
    collection: "fieldReports",
    roles: OFFICE,
    dateField: "occurredAt",
    softDelete: true,
    filter: (f) => pick(f, { status: "status", assetId: "assetId", category: "category", userId: "reporterId" }),
    columns: [
      { key: "number", kind: "text" },
      { key: "title", kind: "text" },
      { key: "category", kind: "text" },
      { key: "priority", kind: "text" },
      { key: "status", kind: "text" },
      { key: "assetId", kind: "text" },
      { key: "reporterId", kind: "text" },
      { key: "occurredAt", kind: "date" },
      { key: "machineOperable", kind: "bool" },
      { key: "lat", kind: "number" },
      { key: "lng", kind: "number" },
    ],
  },
  "work-orders": {
    entity: "work-orders",
    collection: "workOrders",
    roles: OFFICE,
    dateField: "createdAt",
    softDelete: true,
    filter: (f) => pick(f, { status: "status", assetId: "assetId", customerId: "customerId", userId: "assigneeId" }),
    columns: [
      { key: "number", kind: "text" },
      { key: "title", kind: "text" },
      { key: "type", kind: "text" },
      { key: "status", kind: "text" },
      { key: "priority", kind: "text" },
      { key: "assetId", kind: "text" },
      { key: "assigneeId", kind: "text" },
      { key: "customerId", kind: "text" },
      { key: "createdAt", kind: "date" },
      { key: "scheduledFor", kind: "date" },
      { key: "completedAt", kind: "date" },
      { key: "laborCostCents", kind: "cents" },
      { key: "partsCostCents", kind: "cents" },
      { key: "externalCostCents", kind: "cents" },
    ],
  },
  rentals: {
    entity: "rentals",
    collection: "rentals",
    roles: OFFICE,
    dateField: "plannedStart",
    softDelete: true,
    filter: (f) => pick(f, { status: "status", assetId: "assetId", customerId: "customerId" }),
    columns: [
      { key: "number", kind: "text" },
      { key: "direction", kind: "text" },
      { key: "status", kind: "text" },
      { key: "assetId", kind: "text" },
      { key: "customerId", kind: "text" },
      { key: "plannedStart", kind: "date" },
      { key: "plannedEnd", kind: "date" },
      { key: "actualStart", kind: "date" },
      { key: "actualEnd", kind: "date" },
      { key: "rateCents", kind: "cents" },
      { key: "rateUnit", kind: "text" },
      { key: "chargesTotalCents", kind: "cents" },
      { key: "balanceDueCents", kind: "cents" },
    ],
  },
  assets: {
    entity: "assets",
    collection: "assets",
    roles: OFFICE,
    dateField: "createdAt",
    softDelete: true,
    filter: (f) => pick(f, { status: "condition", category: "category", customerId: "ownerCustomerId" }),
    columns: [
      { key: "code", kind: "text" },
      { key: "name", kind: "text" },
      { key: "category", kind: "text" },
      { key: "make", kind: "text" },
      { key: "model", kind: "text" },
      { key: "year", kind: "number" },
      { key: "serialNumber", kind: "text" },
      { key: "plate", kind: "text" },
      { key: "condition", kind: "text" },
      { key: "hourMeter", kind: "number" },
      { key: "odometerKm", kind: "number" },
      { key: "isRentable", kind: "bool" },
      { key: "defaultRateCents", kind: "cents" },
    ],
  },
  costs: {
    entity: "costs",
    collection: "workOrders",
    roles: OFFICE,
    dateField: "completedAt",
    softDelete: true,
    filter: (f) => ({ completedAt: { $ne: null }, ...pick(f, { assetId: "assetId", customerId: "customerId", userId: "assigneeId" }) }),
    columns: [
      { key: "number", kind: "text" },
      { key: "completedAt", kind: "date" },
      { key: "assetId", kind: "text" },
      { key: "customerId", kind: "text" },
      { key: "assigneeId", kind: "text" },
      { key: "laborCostCents", kind: "cents" },
      { key: "partsCostCents", kind: "cents" },
      { key: "externalCostCents", kind: "cents" },
      {
        key: "totalCostCents",
        kind: "cents",
        value: (row) => cents(row, "laborCostCents") + cents(row, "partsCostCents") + cents(row, "externalCostCents"),
      },
    ],
  },
  "location-pings": {
    entity: "location-pings",
    collection: "locationPings",
    roles: ["ADMIN"],
    dateField: "recordedAt",
    softDelete: false,
    filter: (f) => pick(f, { userId: "userId" }),
    columns: [
      { key: "userId", kind: "text" },
      { key: "deviceId", kind: "text" },
      { key: "recordedAt", kind: "date" },
      { key: "lat", kind: "number" },
      { key: "lng", kind: "number" },
      { key: "accuracyM", kind: "number" },
      { key: "speedMps", kind: "number" },
      { key: "heading", kind: "number" },
      { key: "batteryLevel", kind: "number" },
      { key: "workOrderId", kind: "text" },
    ],
  },
};
