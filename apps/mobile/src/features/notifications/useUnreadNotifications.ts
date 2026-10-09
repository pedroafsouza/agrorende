import { useServices } from "../../lib/services";
import { useLocalQuery } from "../../lib/useLocalQuery";
import { countUnreadNotifications } from "./logic";

/** Unread count for the active user, re-read after every sync and local write. */
export function useUnreadNotifications(): number {
  const { userId } = useServices();
  const query = useLocalQuery(async (db) => (userId === undefined ? 0 : countUnreadNotifications(db, userId)), [userId]);
  return query.status === "ready" ? query.data : 0;
}
