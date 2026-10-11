import { StyleSheet, View } from "react-native";

import { campoClaro, space } from "./theme";
import { Text } from "./Text";

export type AppEnv = "development" | "preview" | "staging" | "production" | string;

export function appEnv(): AppEnv {
  return process.env.EXPO_PUBLIC_APP_ENV ?? "development";
}

/** Non-production ribbon (A§18.1) so screenshots and demos never pass for production. */
export function EnvironmentRibbon({ env = appEnv() }: { readonly env?: AppEnv }) {
  if (env === "production") return null;
  const key = env === "preview" || env === "staging" ? "common.env.staging" : "common.env.development";
  return (
    <View testID="env-ribbon" style={styles.ribbon}>
      <Text i18nKey={key} variant="caption" color={campoClaro.palette.warning.onFill} style={styles.text} />
    </View>
  );
}

const styles = StyleSheet.create({
  ribbon: { alignItems: "center", backgroundColor: campoClaro.palette.warning.fill, paddingVertical: space[1] },
  text: { fontWeight: "700" },
});
