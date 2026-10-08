import { closeUserSession, getApiClient, getAuthSession } from "../../lib/app/session";
import { stopTracking } from "../../location/tracker";

/** Signs out on this device. The user's database and its queue stay for the next sign-in. */
export async function signOutHere(): Promise<void> {
  await stopTracking();
  await getAuthSession().signOut();
  await closeUserSession();
}

export async function deleteAccount(confirm: string): Promise<void> {
  await getApiClient().deleteMe({ confirm });
  await signOutHere();
}
