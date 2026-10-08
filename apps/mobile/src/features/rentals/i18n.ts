import en from "../../i18n/en/rentals.json";
import ptBR from "../../i18n/pt-BR/rentals.json";
import { registerNamespace } from "../../i18n";

export const RENTALS_NAMESPACE = "rentals";

registerNamespace(RENTALS_NAMESPACE, { "pt-BR": ptBR, en });
