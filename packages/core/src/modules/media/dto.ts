import type { MediaDTO } from "@agrorende/contracts/dto";

import { toWire } from "../../sync/pull";

export type { MediaDTO } from "@agrorende/contracts/dto";

/** Maps a stored Media document to its wire DTO. */
export function toMediaDto(doc: object): MediaDTO {
  return toWire(doc as Record<string, unknown>) as unknown as MediaDTO;
}
