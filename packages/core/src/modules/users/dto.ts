import type { UserDTO } from "@agrorende/contracts/dto";

import { toTableDto, type WireViewer } from "../../sync/pull.js";

export type { UserDTO } from "@agrorende/contracts/dto";

/** Maps a stored User to its wire DTO, applying the same redaction rules as pull. */
export function toUserDto(doc: object, viewer: WireViewer): UserDTO {
  const row = toTableDto("users", doc as Record<string, unknown>, viewer);
  // Push mute settings (T05-008) are personal; only the user themself sees them.
  if (row.id !== viewer.userId) delete row.notificationPrefs;
  return row as unknown as UserDTO;
}
