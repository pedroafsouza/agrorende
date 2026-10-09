import type { NotificationType } from "@agrorende/contracts/enums";
import { NotificationTypeEnum } from "@agrorende/contracts/enums";
import { renderIcu as renderServerIcu, resolveServerLocale, serverMessage, type IcuParams } from "@agrorende/i18n/server";

export type NotificationLocale = "pt-BR" | "en";

interface Template {
  readonly title: string;
  readonly body: string;
}

const NOTIFICATION_LOCALES = ["pt-BR", "en"] as const satisfies readonly NotificationLocale[];

function template(locale: NotificationLocale, type: NotificationType): Template {
  return {
    title: serverMessage(locale, "notifications", `${type}.title`) ?? "",
    body: serverMessage(locale, "notifications", `${type}.body`) ?? "",
  };
}

/**
 * ICU templates for server-rendered notifications (ARCHITECTURE §6.5), read from the
 * `notifications` namespace of `@agrorende/i18n` (change request T02-005).
 */
export const NOTIFICATION_TEMPLATES: Readonly<Record<NotificationLocale, Readonly<Record<NotificationType, Template>>>> = Object.fromEntries(
  NOTIFICATION_LOCALES.map((locale) => [locale, Object.fromEntries(NotificationTypeEnum.options.map((type) => [type, template(locale, type)]))]),
) as Record<NotificationLocale, Record<NotificationType, Template>>;

export function resolveNotificationLocale(locale: string | null | undefined): NotificationLocale {
  return resolveServerLocale(locale);
}

/** Renders the ICU subset used by notification templates: `{name}` and `{n, plural, one {…} other {…}}`. */
export function renderIcu(source: string, params: IcuParams, locale: NotificationLocale): string {
  return renderServerIcu(source, params, locale);
}

export function renderNotification(type: NotificationType, params: IcuParams, locale: string | null | undefined): { readonly title: string; readonly body: string } {
  const resolved = resolveNotificationLocale(locale);
  const selected = NOTIFICATION_TEMPLATES[resolved][type];
  const title = renderIcu(selected.title, params, resolved);
  const body = renderIcu(selected.body, params, resolved);
  return { title: title.length > 0 ? title : type, body: body.length > 0 ? body : title };
}
