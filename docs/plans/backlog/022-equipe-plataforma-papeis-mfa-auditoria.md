# Equipe da plataforma: papéis, MFA e visualizador de auditoria

**ID:** 022 · **Épico:** Admin da plataforma · **Prioridade:** P0 · **Estimativa:** M

## Contexto

- Acesso de staff é uma lista plana de e-mails em `PLATFORM_ADMIN_EMAILS` (`isPlatformAdmin()` em
  `packages/core/src/modules/tenancy/platform.ts`); adicionar ou remover alguém exige alterar a
  variável e fazer deploy (`docs/RUNBOOK.md` §5). Todo staff tem os mesmos poderes.
- Não há MFA próprio; o login depende da conta Google do funcionário.
- Toda ação grava `PlatformAuditEvent` (coleção `platform_audit_events`, campos `actorEmail`,
  `action`, `organizationId`, `reason`, `details`, `createdAt`; ações `org.status.change`,
  `org.trial.extend`, `org.plan.change`, `org.adminResetLink`, `org.purge`). A trilha só aparece na
  página de cada organização (`PlatformOrgDetailPage.tsx`); não há visão global.
- Login de staff não é auditado.

## Objetivo

Introduzir papéis de staff, exigir MFA e oferecer uma visão global e filtrável da auditoria.

## Escopo

### Incluído

- Papéis propostos: `PLATFORM_ADMIN` (tudo), `PLATFORM_SUPPORT` (leitura + link de reset +
  extensão de trial), `PLATFORM_BILLING` (plano, status). Nomes precisam de change request para a
  ARCHITECTURE (enum novo em `packages/contracts`).
- Fonte dos papéis: decidir entre variável (`PLATFORM_ADMIN_EMAILS` + `PLATFORM_SUPPORT_EMAILS`) e
  coleção `platform_staff` gerida pelo próprio console (com bootstrap pela variável). Registrar.
- MFA: exigir verificação em duas etapas na conta Google Workspace (checagem do claim `amr`/`acr`
  quando disponível, ou restrição a domínio Workspace com 2SV obrigatório) **ou** WebAuthn/passkey
  próprio no console. Registrar decisão.
- Auditar `staff.login`, `staff.logout` e `staff.denied` em `PlatformAuditEvent`.
- Página `/platform/audit` com filtros por ator, ação, organização e período, e exportação CSV.
- Testes de matriz de permissão por papel nas rotas `/api/v1/platform/*`.

### Fora do escopo

- Acesso assistido (tarefas 025 e 026).

## Critérios de aceite

- [ ] Staff `PLATFORM_SUPPORT` não consegue mudar plano/status (recebe `FORBIDDEN`).
- [ ] Login sem MFA é recusado em staging e produção, com mensagem de recuperação.
- [ ] `/platform/audit` lista eventos de todas as organizações, com paginação e filtros.
- [ ] Eventos de login aparecem na auditoria.
- [ ] Strings novas em pt-BR e en (`pnpm i18n:check` verde).

## Notas técnicas

- Manter as garantias atuais: rotas de plataforma não criam `ctx` de tenant e staff não lê dados de
  negócio (§11).
- Índice existente `{ organizationId: 1, createdAt: 1 }`; a visão global precisa de índice
  `{ createdAt: -1 }` (mudança em `packages/db`, congelado pela R4 — change request).

## Riscos

- Bloquear todo o staff por erro de configuração de MFA; manter procedimento de emergência
  documentado.

## Dependências

Nenhuma.
