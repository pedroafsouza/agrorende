import type { UserDTO } from "@agrorende/contracts/dto";

import { toTableDto, type WireViewer } from "../../sync/pull.js";

export type { UserDTO } from "@agrorende/contracts/dto";

/** Maps a stored User to its wire DTO, applying the same redaction rules as pull. */
export function toUserDto(doc: object, viewer: WireViewer): UserDTO {
  return toTableDto("users", doc as Record<string, unknown>, viewer) as unknown as UserDTO;
}
