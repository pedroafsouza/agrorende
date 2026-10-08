import NetInfo from "@react-native-community/netinfo";
import { AppState } from "react-native";

import type { TriggerSources } from "./triggers";

/** Production trigger sources: React Native AppState and NetInfo. */
export function nativeTriggerSources(onPoke?: TriggerSources["onPoke"]): TriggerSources {
  return {
    onAppStateChange: (listener) => {
      const sub = AppState.addEventListener("change", listener);
      return { remove: () => sub.remove() };
    },
    onConnectivityChange: (listener) => {
      const unsubscribe = NetInfo.addEventListener((state) => listener(state.isConnected === true && state.isInternetReachable !== false));
      return { remove: unsubscribe };
    },
    ...(onPoke === undefined ? {} : { onPoke }),
  };
}
