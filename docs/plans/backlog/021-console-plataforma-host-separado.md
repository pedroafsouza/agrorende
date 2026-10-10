# Console da plataforma em host próprio e isolado

**ID:** 021 · **Épico:** Admin da plataforma · **Prioridade:** P0 · **Estimativa:** M

## Contexto

O console da equipe AgroRende já existe (T20, requisito TEN-06): páginas
`apps/web/src/app/(platform)/platform/login`, `/platform/orgs` e `/platform/orgs/[id]`
(componentes em `apps/web/src/features/platform/`), API em `apps/web/src/app/api/v1/platform/**`
e lógica em `packages/core/src/modules/tenancy/platform.ts`. A sessão de staff é um cookie
`ar_platform` (JWT HS256, `aud: "platform"`, 8 h, `SameSite=Strict`) emitido após login Google e
validado contra `PLATFORM_ADMIN_EMAILS` a cada requisição (§11, `docs/RUNBOOK.md` §5). Hoje o
console é servido no **mesmo host** do admin dos clientes (`https://APP_HOST/platform`), e o
callback é `https://APP_HOST/api/v1/platform/auth/google/callback`.

## Objetivo

Servir o console apenas num host separado (proposto `plataforma.<domínio>`), com acesso
restringível por rede, sem quebrar o isolamento já existente.

## Escopo

### Incluído

- Variável proposta `PLATFORM_HOST` (change request para §16, §18 e `docs/RELEASING.md`).
- No `web`, recusar com 404 as rotas `(platform)` e `/api/v1/platform/*` quando o `Host` não for
  `PLATFORM_HOST`, e recusar rotas de tenant no `PLATFORM_HOST`.
- Cookie `ar_platform` com `Domain` exato do host da plataforma (sem compartilhar com `APP_HOST`).
- `platformCallbackUrl()` usando `PLATFORM_HOST`; novo callback registrado no Google (tarefa 018).
- Regra de ingress separada para o host, com opção de allowlist de IP/VPN ou proxy de identidade
  (ex.: Cloudflare Access, IAP) — decidir e registrar.
- `noindex` e cabeçalhos de segurança estritos (CSP sem terceiros, `frame-ancestors 'none'`).

### Fora do escopo

- Papéis e MFA (tarefa 022).

## Critérios de aceite

- [ ] `https://APP_HOST/platform/login` retorna 404 em staging.
- [ ] `https://PLATFORM_HOST/platform/orgs` funciona após login de staff.
- [ ] Cookie `ar_platform` não é enviado para `APP_HOST` (teste de integração).
- [ ] Testes existentes `apps/web/src/app/api/v1/platform/orgs/route.test.ts` e
      `packages/core/src/modules/tenancy/platform.test.ts` continuam verdes, com novos casos de host.
- [ ] Em `local`, sem `PLATFORM_HOST`, o comportamento atual continua (para não quebrar o devloop).

## Notas técnicas

- O `src/proxy.ts` do web (Next 16) é o lugar natural para a checagem de host.
- Erros seguem `docs/ERRORS.md`; não vazar a existência do console no host de tenants.

## Riscos

- Quebrar o fluxo de login de staff durante a transição; manter os dois callbacks registrados
  temporariamente.

## Dependências

- 016, 007.
