import type { getDb } from "@agrorende/db";

/** The MongoDB handle returned by `@agrorende/db`; core never imports the driver directly. */
export type Db = Awaited<ReturnType<typeof getDb>>;
export { closeClient as closeLocationsDb } from "@agrorende/db";
