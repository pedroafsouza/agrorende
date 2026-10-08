import Constants from "expo-constants";

/** Build-time public configuration (ARCHITECTURE §23 environment variables). */
export const appConfig = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000",
  wsUrl: process.env.EXPO_PUBLIC_WS_URL ?? "http://localhost:4001",
  siteUrl: process.env.EXPO_PUBLIC_SITE_URL ?? "https://agrorende.app",
  supportWhatsapp: process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP,
  appEnv: process.env.EXPO_PUBLIC_APP_ENV ?? "local",
  scheme: (Constants.expoConfig?.scheme as string | undefined) ?? "agrorende",
} as const;
