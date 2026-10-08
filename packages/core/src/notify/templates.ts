import type { NotificationType } from "@agrorende/contracts/enums";

export type NotificationLocale = "pt-BR" | "en";

interface Template {
  readonly title: string;
  readonly body: string;
}

/**
 * ICU templates for server-rendered notifications (ARCHITECTURE §6.5). They mirror the
 * `notifications` namespace of `@agrorende/i18n`; change request T02-005 asks to move them there.
 */
export const NOTIFICATION_TEMPLATES: Record<NotificationLocale, Record<NotificationType, Template>> = {
  en: {
    WO_ASSIGNED: { title: "New job assigned", body: "{title}. Open the job to see the next step." },
    WO_UPDATED: { title: "Job updated", body: "{title} was updated by the office." },
    WO_CANCELLED: { title: "Job cancelled", body: "{title} was cancelled. Your photos and notes were kept." },
    WO_REASSIGNED_AWAY: { title: "Job reassigned", body: "{title} was assigned to someone else. Your data was kept." },
    REPORT_CRITICAL: { title: "Critical report", body: "{title}. Open the report to decide the next step." },
    REPORT_MARKED_FOR_REPAIR: { title: "Report sent to repair", body: "{title} is now scheduled for repair." },
    RENTAL_DUE_SOON: { title: "Return due soon", body: "{title} is due back soon. Prepare the inspection." },
    RENTAL_OVERDUE: { title: "Rental overdue", body: "{title} is past its return date. Contact the customer." },
    SLA_AT_RISK: { title: "Deadline at risk", body: "{title} is close to its deadline." },
    DEVICE_STALE_SYNC: { title: "Phone not syncing", body: "{name}'s phone has data waiting to be sent." },
    LATE_EVIDENCE: { title: "Late evidence received", body: "New evidence arrived for {title}." },
    JOINED_WITH_OTHER_EMAIL: { title: "Invite accepted", body: "{name} joined with a different email address." },
    COMMENT_ADDED: { title: "New comment", body: "{name} commented on {title}." },
    EXPORT_READY: { title: "Export ready", body: "Your export is ready to download." },
    MAINTENANCE_DUE: { title: "Maintenance due", body: "{title} needs preventive maintenance." },
    LOW_STOCK: { title: "Low stock", body: "{title} is running low." },
  },
  "pt-BR": {
    WO_ASSIGNED: { title: "Novo serviço atribuído", body: "{title}. Abra o serviço para ver o próximo passo." },
    WO_UPDATED: { title: "Serviço atualizado", body: "{title} foi atualizado pelo escritório." },
    WO_CANCELLED: { title: "Serviço cancelado", body: "{title} foi cancelado. Suas fotos e anotações foram guardadas." },
    WO_REASSIGNED_AWAY: { title: "Serviço reatribuído", body: "{title} foi passado para outra pessoa. Seus dados foram guardados." },
    REPORT_CRITICAL: { title: "Relato crítico", body: "{title}. Abra o relato para decidir o próximo passo." },
    REPORT_MARKED_FOR_REPAIR: { title: "Relato enviado para reparo", body: "{title} agora tem reparo programado." },
    RENTAL_DUE_SOON: { title: "Devolução próxima", body: "{title} deve ser devolvido em breve. Prepare a vistoria." },
    RENTAL_OVERDUE: { title: "Locação atrasada", body: "{title} passou da data de devolução. Fale com o cliente." },
    SLA_AT_RISK: { title: "Prazo em risco", body: "{title} está perto do prazo." },
    DEVICE_STALE_SYNC: { title: "Celular sem sincronizar", body: "O celular de {name} tem dados esperando envio." },
    LATE_EVIDENCE: { title: "Evidência tardia recebida", body: "Chegou nova evidência para {title}." },
    JOINED_WITH_OTHER_EMAIL: { title: "Convite aceito", body: "{name} entrou com outro endereço de e-mail." },
    COMMENT_ADDED: { title: "Novo comentário", body: "{name} comentou em {title}." },
    EXPORT_READY: { title: "Exportação pronta", body: "Sua exportação está pronta para baixar." },
    MAINTENANCE_DUE: { title: "Manutenção prevista", body: "{title} precisa de manutenção preventiva." },
    LOW_STOCK: { title: "Estoque baixo", body: "{title} está acabando." },
  },
};

export function resolveNotificationLocale(locale: string | null | undefined): NotificationLocale {
  if (locale === "en" || locale?.startsWith("en-") === true) {
    return "en";
  }
  return "pt-BR";
}

type Params = Readonly<Record<string, string | number>>;

function pluralBlock(source: string, start: number): { readonly end: number; readonly options: Record<string, string> } {
  const options: Record<string, string> = {};
  let index = start;
  while (index < source.length) {
    while (source[index] === " ") index += 1;
    if (source[index] === "}") return { end: index, options };
    let key = "";
    while (index < source.length && source[index] !== "{" && source[index] !== " ") {
      key += source[index];
      index += 1;
    }
    while (source[index] === " ") index += 1;
    let depth = 0;
    let value = "";
    for (; index < source.length; index += 1) {
      const char = source[index];
      if (char === "{") {
        depth += 1;
        if (depth === 1) continue;
      }
      if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          index += 1;
          break;
        }
      }
      value += char;
    }
    options[key] = value;
  }
  return { end: index, options };
}

/** Renders the ICU subset used by notification templates: `{name}` and `{n, plural, one {…} other {…}}`. */
export function renderIcu(template: string, params: Params, locale: NotificationLocale): string {
  let output = "";
  let index = 0;
  while (index < template.length) {
    const char = template[index];
    if (char !== "{") {
      output += char;
      index += 1;
      continue;
    }
    const close = template.indexOf("}", index);
    const head = template.slice(index + 1, close === -1 ? template.length : close);
    const pluralMatch = /^\s*(\w+)\s*,\s*plural\s*,/.exec(head);
    if (pluralMatch !== null) {
      const name = pluralMatch[1] ?? "";
      const block = pluralBlock(template, index + 1 + pluralMatch[0].length);
      const count = Number(params[name] ?? 0);
      const category = new Intl.PluralRules(locale).select(count);
      const exact = block.options[`=${count}`];
      const chosen = exact ?? block.options[category] ?? block.options.other ?? "";
      output += renderIcu(chosen.replaceAll("#", String(count)), params, locale);
      index = block.end + 1;
      continue;
    }
    const key = head.trim();
    const value = params[key];
    output += value === undefined ? "" : String(value);
    index = close === -1 ? template.length : close + 1;
  }
  return output.replace(/\s{2,}/g, " ").trim();
}

export function renderNotification(type: NotificationType, params: Params, locale: string | null | undefined): { readonly title: string; readonly body: string } {
  const resolved = resolveNotificationLocale(locale);
  const template = NOTIFICATION_TEMPLATES[resolved][type];
  const title = renderIcu(template.title, params, resolved);
  const body = renderIcu(template.body, params, resolved);
  return { title: title.length > 0 ? title : type, body: body.length > 0 ? body : title };
}
