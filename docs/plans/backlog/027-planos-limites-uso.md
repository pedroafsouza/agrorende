# Planos, limites e métricas de uso por organização

**ID:** 027 · **Épico:** Admin da plataforma · **Prioridade:** P1 · **Estimativa:** M

## Contexto

- `Organization.plan` é uma string livre (padrão `trial`), editável no console via
  `PATCH /platform/orgs/:id {plan, reason}` (`PlatformPatchSchema`). Não existe catálogo de planos
  nem limites aplicados.
- `OrgUsage` (`org_usage`, chave `<organizationId>:<mês>`) guarda `activeFieldUsers`,
  `officeUsers`, `storageBytes`, `assetCount`, atualizado pelo job `usage.daily` às 03:00 no fuso da
  organização (`apps/worker/src/jobs/usage.daily.ts`). O console mostra seis meses de uso; o cliente
  vê em `(admin)/settings/subscription` (`GET /org/subscription`).
- `docs/plans/SIMPLER-TO-SELL.md` §3 "Planos": um plano, preço por usuário de campo, usuários de
  escritório grátis, módulo de locação como adicional.

## Objetivo

Ter um catálogo de planos com limites, aplicar os limites com mensagens claras e mostrar métricas
de uso agregadas para a equipe.

## Escopo

### Incluído

- Catálogo de planos em `packages/contracts` (proposto `PLANS`): id, limites
  (`maxFieldUsers`, `maxStorageBytes`, `maxAssets`), módulos incluídos (tarefa 028). O `plan`
  existente passa a validar contra o catálogo (migração dos valores atuais).
- Limites flexíveis: aviso a 80 % e bloqueio só em novas criações acima do limite (convite de
  usuário de campo, upload), nunca em dados de campo já capturados (offline-first, §7).
- Código de erro novo proposto `PLAN_LIMIT_REACHED` com kit de recuperação ("falar com a
  AgroRende" via `PLATFORM_SUPPORT_WHATSAPP`) — seguir `docs/ERRORS.md`.
- Painel de uso no console: total de organizações por status, usuários de campo ativos, armazenamento,
  crescimento mês a mês, organizações perto do limite.
- Override por organização com motivo e auditoria (`org.limits.override`).

### Fora do escopo

- Cobrança automática (tarefa 037).

## Critérios de aceite

- [ ] Convidar o 6.º usuário de campo num plano de 5 mostra aviso claro e caminho de contato.
- [ ] Sync de dados de campo nunca é bloqueado por limite de plano (teste).
- [ ] Painel global de uso visível para `PLATFORM_ADMIN`.
- [ ] Erros novos registrados em `docs/ERRORS.md` via change request, com testes.

## Notas técnicas

- Os nomes de plano dependem da decisão comercial (tarefa 035); começar com `trial` e um plano
  pago provisório.

## Riscos

- Bloqueio no meio de uma operação de campo; por isso o bloqueio vale só para criações no escritório.

## Dependências

- 035, 022.
