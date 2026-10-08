/** Bridge to the core locations module, imported through the `@agrorende/core/modules/locations` export. */
export {
  closeLocationsDb,
  createPingWriter,
  ingest,
  liveSnapshot,
  recordPresence,
  SOCKET_BATCH_MAX,
  type PingWriter,
} from "@agrorende/core/modules/locations";
