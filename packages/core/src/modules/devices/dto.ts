import type { Device, DeviceDiagnostic } from "@agrorende/db";

export interface DeviceDTO {
  readonly id: string;
  readonly userId: string;
  readonly installationId: string;
  readonly platform: Device["platform"];
  readonly model: string | null;
  readonly osVersion: string | null;
  readonly appVersion: string | null;
  readonly runtimeVersion: string | null;
  readonly pushStatus: Device["pushStatus"];
  readonly lastSeenAt: string | null;
  readonly lastSyncAt: string | null;
  readonly lastPullVersion: string;
  readonly pendingMutations: number;
  readonly pendingUploads: number;
  readonly pendingBytes: number;
  readonly oldestPendingAt: string | null;
  readonly batteryLevel: number | null;
  readonly freeStorageBytes: number | null;
  readonly clockOffsetMs: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** @deprecated Use `DeviceDTO`. */
export type DevicesDTO = DeviceDTO;

export interface DeviceDiagnosticDTO {
  readonly id: string;
  readonly deviceId: string;
  readonly userId: string;
  readonly appVersion: string | null;
  readonly sizeBytes: number;
  readonly createdAt: string;
}

const iso = (value: Date | null | undefined): string | null => (value instanceof Date ? value.toISOString() : null);

export function toDeviceDto(doc: Device): DeviceDTO {
  return {
    id: doc._id,
    userId: doc.userId,
    installationId: doc.installationId,
    platform: doc.platform,
    model: doc.model ?? null,
    osVersion: doc.osVersion ?? null,
    appVersion: doc.appVersion ?? null,
    runtimeVersion: doc.runtimeVersion ?? null,
    pushStatus: doc.pushStatus,
    lastSeenAt: iso(doc.lastSeenAt),
    lastSyncAt: iso(doc.lastSyncAt),
    lastPullVersion: String(doc.lastPullVersion),
    pendingMutations: doc.pendingMutations,
    pendingUploads: doc.pendingUploads,
    pendingBytes: doc.pendingBytes,
    oldestPendingAt: iso(doc.oldestPendingAt),
    batteryLevel: doc.batteryLevel ?? null,
    freeStorageBytes: doc.freeStorageBytes ?? null,
    clockOffsetMs: doc.clockOffsetMs ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export function toDiagnosticDto(doc: DeviceDiagnostic & { readonly sizeBytes?: number }): DeviceDiagnosticDTO {
  return {
    id: doc._id,
    deviceId: doc.deviceId,
    userId: doc.userId,
    appVersion: doc.appVersion ?? null,
    sizeBytes: doc.sizeBytes ?? Buffer.byteLength(JSON.stringify(doc.payload)),
    createdAt: doc.createdAt.toISOString(),
  };
}
