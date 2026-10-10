# Decisão: atualizações OTA (EAS Update) — custo, canais e política

**ID:** 045 · **Épico:** Distribuição mobile · **Prioridade:** P1 · **Estimativa:** P · **Tipo:** decisão

## Contexto

`.github/workflows/mobile.yml` já publica atualizações pelo ar. Ele usa a política de
`runtimeVersion` por fingerprint: sem mudança nativa, roda `eas update --channel <perfil>`; com
mudança nativa, inicia `eas build`. Os canais em `apps/mobile/eas.json` são `development`,
`preview` e `production`. O Sentry mobile marca releases com o SHA e a runtimeVersion
(`docs/ARCHITECTURE.md` §12).

Pontos ainda não definidos:

- o custo do EAS para o volume esperado;
- o rollout gradual;
- a reversão;
- a relação entre OTA e o APK distribuído fora da loja (tarefa 043).

## Objetivo

Confirmar ou trocar a estratégia de OTA e documentar a política de publicação e reversão.

## Escopo

### Incluído

- Estimar o custo do EAS (builds e updates por usuário ativo mensal) para 3.000 usuários, e
  compará-lo com hospedar um servidor de updates compatível com o protocolo expo-updates.
- Definir a política:
  - o que pode ir por OTA (só JS e assets, sem mudança de permissões);
  - rollout por porcentagem;
  - como reverter (`eas update:republish` ou equivalente);
  - quem aprova uma publicação em `production`.
- Definir o comportamento do app ao receber uma atualização. Ela não pode interromper um
  formulário em andamento nem o sync; avaliar o carregamento na próxima abertura.
- Garantir que o APK assinado da tarefa 043 aponta para o mesmo canal `production`.

### Fora do escopo

- Mudanças no código do app (viram tarefas se necessário).

## Critérios de aceite

- [ ] Documento de decisão com custos e política, aprovado.
- [ ] `docs/RELEASING.md` atualizado com o procedimento de reversão.
- [ ] Exercício de reversão feito no canal `preview`.

## Notas técnicas

- Atualização incompatível com dados offline pendentes pode quebrar o outbox. Exigir testes de
  migração do SQLite local antes de qualquer OTA com mudança de esquema local.

## Riscos

- OTA com bug atingindo toda a base de uma vez. Por isso a política de rollout gradual.

## Dependências

Nenhuma.
