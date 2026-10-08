import en from "../../i18n/en/jobs.json";
import ptBR from "../../i18n/pt-BR/jobs.json";
import { registerNamespace } from "../../i18n";

export const JOBS_NAMESPACE = "jobs";

registerNamespace(JOBS_NAMESPACE, { "pt-BR": ptBR, en });
