import { DEFAULT_LOCALE, type SupportedLocale, resolveLocale } from "@agrorende/i18n";

export type MessageKey =
  | "common.appName"
  | "common.notImplemented"
  | "routes.root"
  | "routes.auth.login"
  | "routes.auth.changePassword"
  | "routes.auth.onboarding"
  | "routes.app.shell"
  | "routes.tabs.shell"
  | "routes.tabs.today"
  | "routes.tabs.reports"
  | "routes.tabs.jobs"
  | "routes.tabs.rentals"
  | "routes.tabs.more"
  | "routes.reports.new"
  | "routes.reports.detail"
  | "routes.jobs.detail"
  | "routes.jobs.checklist"
  | "routes.jobs.parts"
  | "routes.jobs.complete"
  | "routes.rentals.detail"
  | "routes.rentals.checkout"
  | "routes.rentals.checkin"
  | "routes.rentals.new"
  | "routes.assets.index"
  | "routes.assets.detail"
  | "routes.scan"
  | "routes.syncCenter"
  | "routes.settings"
  | "routes.dev.styleGuide"
  | "routes.notifications"
  | "routes.fuel.new"
  | "placeholder.body"
  | "placeholder.cta"
  | "tenancy.orgStatusBanner.title"
  | "tenancy.orgStatusBanner.body"
  | "ui.status.synced"
  | "ui.status.pending"
  | "ui.status.failed"
  | "ui.empty.title"
  | "ui.empty.body"
  | "ui.error.title"
  | "ui.error.body";

export function resolveMobileLocale(candidates: readonly string[], organizationDefault = DEFAULT_LOCALE): SupportedLocale {
  return resolveLocale([...candidates, organizationDefault]);
}

export function message(key: MessageKey, _locale: SupportedLocale = DEFAULT_LOCALE): string {
  return key;
}
