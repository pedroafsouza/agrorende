import { notImplemented } from "@agrorende/core";
import type { LocationBatchAck, LocationBatchPayload, PresencePingPayload } from "@agrorende/contracts/realtime";

import type { SocketAuthPayload } from "./auth.js";

export interface RealtimeHandlers {
  readonly ingestLocationBatch: (ctx: SocketAuthPayload, payload: LocationBatchPayload) => Promise<LocationBatchAck>;
  readonly recordPresencePing: (ctx: SocketAuthPayload, payload: PresencePingPayload) => Promise<void>;
}


export function createFoundationHandlers(): RealtimeHandlers {
  return {
    async ingestLocationBatch() {
      return notImplemented("realtime.locationBatch");
    },
    async recordPresencePing() {
      return notImplemented("realtime.presencePing");
    },
  };
}
