# Convite de usuário por e-mail

**ID:** 031 · **Épico:** Gestão de usuários do tenant · **Prioridade:** P1 · **Estimativa:** M

## Contexto

- A equipe do cliente é gerida em `(admin)/team` com as rotas `/users` (criar, convidar, link de
  redefinição, senha temporária, papel, desativar/reativar, guarda `LAST_ADMIN`), descritas em
  `docs/ARCHITECTURE.md` §8.
- O convite hoje gera um link e o compartilha por link copiado, WhatsApp e QR
  (`apps/web/src/features/team/SharePanel.tsx`). O ADMIN entrega o link manualmente.
- Não há biblioteca nem serviço de envio de e-mail no código. A tarefa 019 define o provedor de
  e-mail transacional e os registros SPF/DKIM/DMARC.

## Objetivo

Permitir que o ADMIN envie o convite diretamente por e-mail, com reenvio e estado visível, sem
perder os canais atuais (link, WhatsApp, QR).

## Escopo

### Incluído

- Seam de envio de e-mail no core (proposto `packages/core/src/email/`), com driver `log` em
  desenvolvimento e testes, e driver do provedor escolhido na tarefa 019.
- Opção "Enviar por e-mail" no `SharePanel` quando o usuário tem e-mail cadastrado.
- Modelo de e-mail em pt-BR e en (chaves ICU), com nome da organização, papel, link e validade.
- Estado do convite na lista da equipe: enviado em, reenviado, aceito, expirado; botão "Reenviar".
- Limite de taxa por organização e por destinatário.
- Os links de redefinição de senha e de recuperação podem usar o mesmo seam.

### Fora do escopo

- Campanhas, newsletters e e-mails de marketing.
- Convite por SMS.

## Critérios de aceite

- [ ] Em staging, o convite chega na caixa de entrada (não no spam) de Gmail e Outlook.
- [ ] O link do e-mail abre o mesmo fluxo de aceite do link compartilhado hoje.
- [ ] Reenviar invalida o link anterior ou mantém um único link válido (decidir e testar).
- [ ] Falha do provedor mostra erro tratado com alternativa (copiar link ou WhatsApp), conforme
      `docs/ERRORS.md`.
- [ ] Nenhum endereço de e-mail aparece em logs `info`.
- [ ] `pnpm check:only` e `pnpm i18n:check` verdes.

## Notas técnicas

- Variáveis de ambiente propostas (`EMAIL_DRIVER`, `EMAIL_FROM`, `EMAIL_API_KEY`) exigem change
  request para `docs/ARCHITECTURE.md` §18 e para `scripts/validate-env.sh`.
- Uma dependência nova (SDK do provedor) exige change request, por causa da regra R4. Preferir
  HTTP direto com `fetch`, sem SDK.
- O envio deve ser feito por um job no worker, com retentativas, para não bloquear a requisição.

## Riscos

- Entregabilidade baixa no começo do domínio novo; aquecer o domínio e monitorar bounces.

## Dependências

- 019.
