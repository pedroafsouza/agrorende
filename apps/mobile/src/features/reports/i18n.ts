import en from "../../i18n/en/reports.json";
import ptBR from "../../i18n/pt-BR/reports.json";
import { registerNamespace } from "../../i18n";

export const REPORTS_NAMESPACE = "reports";

registerNamespace(REPORTS_NAMESPACE, { "pt-BR": ptBR, en });
