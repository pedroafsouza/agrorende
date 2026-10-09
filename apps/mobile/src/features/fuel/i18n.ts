import en from "../../i18n/en/fuel.json";
import ptBR from "../../i18n/pt-BR/fuel.json";
import { registerNamespace } from "../../i18n";

export const FUEL_NAMESPACE = "fuel";

registerNamespace(FUEL_NAMESPACE, { "pt-BR": ptBR, en });
