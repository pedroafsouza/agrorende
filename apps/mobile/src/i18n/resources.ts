import enApp from "./en/app.json";
import enAssets from "./en/assets.json";
import enAuth from "./en/auth.json";
import enCommon from "./en/common.json";
import enEnums from "./en/enums.json";
import enErrors from "./en/errors.json";
import enNotifications from "./en/notifications.json";
import enParts from "./en/parts.json";
import enPdf from "./en/pdf.json";
import enSettings from "./en/settings.json";
import enSync from "./en/sync.json";
import enTenancy from "./en/tenancy.json";
import ptApp from "./pt-BR/app.json";
import ptAssets from "./pt-BR/assets.json";
import ptAuth from "./pt-BR/auth.json";
import ptCommon from "./pt-BR/common.json";
import ptEnums from "./pt-BR/enums.json";
import ptErrors from "./pt-BR/errors.json";
import ptNotifications from "./pt-BR/notifications.json";
import ptParts from "./pt-BR/parts.json";
import ptPdf from "./pt-BR/pdf.json";
import ptSettings from "./pt-BR/settings.json";
import ptSync from "./pt-BR/sync.json";
import ptTenancy from "./pt-BR/tenancy.json";

/** Bundled namespaces present in every required locale. Feature namespaces use `registerNamespace`. */
export const resources: Record<string, Record<string, object>> = {
  "pt-BR": {
    app: ptApp,
    assets: ptAssets,
    auth: ptAuth,
    common: ptCommon,
    enums: ptEnums,
    errors: ptErrors,
    notifications: ptNotifications,
    parts: ptParts,
    pdf: ptPdf,
    settings: ptSettings,
    sync: ptSync,
    tenancy: ptTenancy,
  },
  en: {
    app: enApp,
    assets: enAssets,
    auth: enAuth,
    common: enCommon,
    enums: enEnums,
    errors: enErrors,
    notifications: enNotifications,
    parts: enParts,
    pdf: enPdf,
    settings: enSettings,
    sync: enSync,
    tenancy: enTenancy,
  },
};
