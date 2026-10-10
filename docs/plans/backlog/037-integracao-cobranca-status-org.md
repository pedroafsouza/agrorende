# Integração de cobrança com o status da organização

**ID:** 037 · **Épico:** Comercial e cobrança · **Prioridade:** P2 · **Estimativa:** G

## Contexto

- `OrgStatusEnum` tem os valores `TRIAL`, `ACTIVE`, `PAST_DUE`, `SUSPENDED` e `CANCELLED`
  (`docs/ARCHITECTURE.md` §5.3). Os status `TRIAL`, `ACTIVE` e `PAST_DUE` aceitam escrita. Os
  status `SUSPENDED` e `CANCELLED` aceitam envio por mais 7 dias e depois retornam `ORG_SUSPENDED`
  (§7).
- O job `orgs.lifecycle` faz as transições por tempo e emite `org:status`. A equipe muda o status
  manualmente com motivo pelo `PATCH /platform/orgs/:id`, gravando `PlatformAuditEvent`.
- O provedor de cobrança é decidido na tarefa 036, e os planos na tarefa 035.

## Objetivo

Fazer o pagamento confirmado ativar a organização e a inadimplência movê-la para `PAST_DUE`,
automaticamente e com auditoria, e permitir que o ADMIN do cliente assine e pague sozinho.

## Escopo

### Incluído

- Em `(admin)/settings/subscription`, o ADMIN pode:
  - escolher o plano;
  - informar dados de cobrança;
  - pagar por Pix, boleto ou cartão;
  - ver faturas e notas.
- Webhook do provedor, assinado e idempotente:
  - pagamento confirmado leva a `ACTIVE`;
  - vencido leva a `PAST_DUE`;
  - cancelado leva a `CANCELLED`.
  Cada transição grava um evento de auditoria com ator `billing` e emite `org:status`.
- Sincronizar a quantidade de usuários de campo (`OrgUsage`) com a assinatura no fechamento do mês.
- O console mostra o histórico de cobranças da organização. O override manual continua possível,
  com motivo.
- Reconciliação diária, no worker, entre o provedor e o status local.

### Fora do escopo

- Cobrança de módulos avulsos fora do catálogo.

## Critérios de aceite

- [ ] Em sandbox, pagar um Pix muda a organização de `TRIAL` para `ACTIVE` em menos de 1 minuto, e
      o aparelho recebe `org:status`.
- [ ] Webhook repetido não duplica efeitos (teste).
- [ ] Webhook com assinatura inválida é recusado e registrado.
- [ ] Nota fiscal emitida e disponível para download para o ADMIN.
- [ ] Os erros de pagamento seguem `docs/ERRORS.md`, com caminho de recuperação.

## Notas técnicas

- A transição automática deve respeitar as regras de `orgs.lifecycle`, sem dois donos brigando
  pelo status. Registrar quem tem precedência.
- Novos campos e coleções (por exemplo `billingCustomerId`, `invoices`) exigem change request
  para `packages/db` e `packages/contracts`, por causa da regra R4.

## Riscos

- Suspender cliente adimplente por falha do webhook. Mitigação: reconciliação diária e alerta.

## Dependências

- 036, 027.
