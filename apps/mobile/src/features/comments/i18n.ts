import en from "../../i18n/en/comments.json";
import ptBR from "../../i18n/pt-BR/comments.json";
import { registerNamespace } from "../../i18n";

export const COMMENTS_NAMESPACE = "comments";

registerNamespace(COMMENTS_NAMESPACE, { "pt-BR": ptBR, en });
