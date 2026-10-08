/**
 * Bridge to the core locations module. `@agrorende/core` does not export `modules/*` yet
 * (change request T05-001), so the gateway imports the module source directly.
 */
export {
  closeLocationsDb,
  createPingWriter,
  ingest,
  liveSnapshot,
  recordPresence,
  SOCKET_BATCH_MAX,
  type PingWriter,
} from "../../../packages/core/src/modules/locations/index.js";
