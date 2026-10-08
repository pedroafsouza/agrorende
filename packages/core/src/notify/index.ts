import type { NotificationType, Role } from "@agrorende/contracts/enums";
import type { EntityRef } from "@agrorende/contracts/dto";

import { notImplemented } from "../errors.js";
import type { SyncTx } from "../sync/types.js";

export interface NotificationInput {
  readonly type: NotificationType;
  readonly userIds: readonly string[];
  readonly entity: EntityRef;
  readonly params: Readonly<Record<string, string | number>>;
}

export async function createNotification(_tx: SyncTx, _input: NotificationInput): Promise<void> {
  return notImplemented("notify.createNotification");
}

export async function officeRecipients(_tx: SyncTx, _orgId: string, _roles: readonly Role[]): Promise<string[]> {
  return notImplemented("notify.officeRecipients");
}
