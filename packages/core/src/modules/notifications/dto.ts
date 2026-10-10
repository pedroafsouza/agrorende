import type { NotificationDTO } from "@agrorende/contracts/dto";

import { toWire } from "../../sync/pull";

export type { NotificationDTO } from "@agrorende/contracts/dto";

export function toNotificationDto(doc: object): NotificationDTO {
  return toWire(doc as Record<string, unknown>) as unknown as NotificationDTO;
}
