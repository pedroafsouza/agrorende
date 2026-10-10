# Usuários por organização e ações de acesso no console

**ID:** 024 · **Épico:** Admin da plataforma · **Prioridade:** P1 · **Estimativa:** M

## Contexto

`GET /platform/orgs/:id` (`getPlatformOrg()` em `packages/core/src/modules/tenancy/platform.ts`)
devolve metadados, seis meses de `OrgUsage`, **apenas os usuários ADMIN** (`id`, `name`, `email`,
`isActive`) e a auditoria. A única ação de acesso é `admin-reset-link` para um ADMIN. O suporte não
consegue ver quantos usuários de campo existem, quem está desativado ou quais aparelhos estão
parados, nem revogar sessões de um ADMIN comprometido.

## Objetivo

Dar ao suporte uma visão mínima e não sensível dos usuários de cada organização e ações de
recuperação de acesso, sem expor dados de negócio.

## Escopo

### Incluído

- Lista de usuários por organização: nome, papel, `isActive`, `disabledAt`, métodos de login
  (provedores em `user_identities`, sem `subject`), `lastSeenAt`, contagem de aparelhos e
  `lastSyncAt` mais recente. E-mail mascarado para `PLATFORM_SUPPORT`.
- Ações (com motivo obrigatório e auditoria):
  - link de reset para qualquer usuário (estender a ação existente além de ADMIN — decidir);
  - revogar todas as sessões de um usuário (`refresh_tokens.revokedAt`);
  - desativar/reativar um ADMIN em caso de comprometimento, respeitando a regra `LAST_ADMIN`.
- Nada de `hourlyCostCents`, telefone completo, `taxId` de clientes ou dados de campo.

### Fora do escopo

- Entrar como o usuário (tarefas 025/026).

## Critérios de aceite

- [ ] Lista paginada de usuários visível no detalhe da organização.
- [ ] Revogar sessões força novo login no web e no app (próximo refresh retorna erro tratado).
- [ ] Cada ação gera `PlatformAuditEvent` com motivo.
- [ ] Teste garante que a resposta não contém campos proibidos.

## Notas técnicas

- Desativação deve seguir o fluxo existente (`POST /users/:id/deactivate`, token de drenagem de
  72 h, §7.3) reaproveitando o serviço do módulo de usuários, não um atalho no banco.

## Riscos

- Ampliar o acesso de staff sem base contratual; alinhar com a revisão LGPD (tarefa 042).

## Dependências

- 022.
