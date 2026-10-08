import type { ConfigContext, ExpoConfig } from "expo/config";

const APP_VARIANTS = ["development", "preview", "production"] as const;
type AppVariant = (typeof APP_VARIANTS)[number];

type VariantConfig = {
  readonly name: string;
  readonly bundleIdentifier: string;
  readonly packageName: string;
  readonly scheme: string;
};

const variants = {
  development: { name: "AgroRende Dev", bundleIdentifier: "app.agrorende.field.dev", packageName: "app.agrorende.field.dev", scheme: "agrorende-dev" },
  preview: { name: "AgroRende Staging", bundleIdentifier: "app.agrorende.field.preview", packageName: "app.agrorende.field.preview", scheme: "agrorende-preview" },
  production: { name: "AgroRende", bundleIdentifier: "app.agrorende.field", packageName: "app.agrorende.field", scheme: "agrorende" },
} as const satisfies Record<AppVariant, VariantConfig>;

function resolveVariant(value: string | undefined): AppVariant {
  return APP_VARIANTS.find((variant) => variant === value) ?? "production";
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = variants[resolveVariant(process.env.APP_VARIANT)];
  const updateUrl = process.env.EAS_UPDATE_URL;
  return {
    ...config,
    name: variant.name,
    slug: "agrorende",
    scheme: variant.scheme,
    version: "0.1.0",
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    locales: { "pt-BR": "./locales/pt-BR.json", en: "./locales/en.json" },
    runtimeVersion: { policy: "fingerprint" },
    updates: updateUrl === undefined ? undefined : { url: updateUrl },
    ios: {
      ...config.ios,
      bundleIdentifier: variant.bundleIdentifier,
      supportsTablet: false,
      usesAppleSignIn: true,
      infoPlist: {
        ...config.ios?.infoPlist,
        CFBundleAllowMixedLocalizations: true,
        LSApplicationQueriesSchemes: ["comgooglemaps", "waze"],
        UIBackgroundModes: ["location", "fetch"],
      },
    },
    android: {
      ...config.android,
      package: variant.packageName,
      adaptiveIcon: { backgroundColor: "#FFFFFF" },
      config: { ...config.android?.config, googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY } },
    },
    plugins: [
      "expo-router",
      "expo-sqlite",
      "expo-camera",
      ["expo-location", { isAndroidBackgroundLocationEnabled: true, isAndroidForegroundServiceEnabled: true }],
      "expo-notifications",
      "expo-secure-store",
      "expo-web-browser",
      "expo-apple-authentication",
      "expo-build-properties",
      "@sentry/react-native/expo",
      "./plugins/withNavigationQueries.js",
    ],
  };
};
