import type { NotificationDTO } from "@agrorende/contracts/dto";

/** What the notifications list shows for one stored notification. */
export interface NotificationDisplay {
  readonly title: string;
  readonly body: string;
  /** Record code (for example `WO-000002`) pulled out of the stored text, shown as its own tag. */
  readonly reference: string | null;
}

type Translate = (key: "staleSyncTitle" | "staleSyncBody", values?: { name: string }) => string;

/*
 * Notification text is rendered by the server when the notification is created. These patterns
 * recognise the stored wording of the phone-sync warning in both locales so the list can use the
 * same plain words as the alerts, and fall back to the stored text for anything else.
 */
const STALE_SYNC_NAME = [/^O celular de (.+) tem dados esperando envio\.?$/u, /^(.+)'s phone has data waiting to be sent\.?$/u];

const LEADING_CODE = /^([A-Z]{2,}-\d+)\s+·\s+/u;

function staleSyncName(body: string): string | null {
  for (const pattern of STALE_SYNC_NAME) {
    const match = pattern.exec(body.trim());
    if (match?.[1] !== undefined) return match[1];
  }
  return null;
}

function splitReference(text: string): { readonly text: string; readonly reference: string | null } {
  const match = LEADING_CODE.exec(text);
  if (match?.[1] === undefined) return { text, reference: null };
  return { text: text.slice(match[0].length), reference: match[1] };
}

/** Plain-language title, body and record tag for a notification row. */
export function notificationDisplay(n: Pick<NotificationDTO, "type" | "title" | "body">, t: Translate): NotificationDisplay {
  if (n.type === "DEVICE_STALE_SYNC") {
    const name = staleSyncName(n.body);
    return { title: t("staleSyncTitle"), body: name === null ? n.body : t("staleSyncBody", { name }), reference: null };
  }
  const title = splitReference(n.title);
  const body = splitReference(n.body);
  return { title: title.text, body: body.text, reference: title.reference ?? body.reference };
}
