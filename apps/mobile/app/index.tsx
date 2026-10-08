import { Redirect } from "expo-router";
import { useSyncExternalStore } from "react";

import { authStore } from "../src/auth/session";
import { routeKeys } from "../src/i18n";

/** Entry point: signed-in users land on Hoje (works offline from the cached profile), others on login. */
export default function Index() {
  const auth = useSyncExternalStore(authStore.subscribe, authStore.getState);
  return <Redirect href={auth.status === "signedIn" ? "/today" : "/login"} />;
}

export const titleKey = routeKeys.root;
