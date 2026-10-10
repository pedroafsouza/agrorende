# OIDC: URIs de redirecionamento Google e Apple e tela de consentimento

**ID:** 018 · **Épico:** Domínio e DNS · **Prioridade:** P0 · **Estimativa:** P

## Contexto

`docs/RELEASING.md` ("Human steps before the first production release") define os passos humanos:
tela de consentimento OAuth do Google (External, nome, logo, e-mail de suporte, política de
privacidade, página inicial, escopos `openid email profile`, publicada) e um cliente web por
ambiente com os callbacks:

- `https://APP_HOST/api/v1/auth/oauth/google/callback` (login de tenants)
- `https://APP_HOST/api/v1/platform/auth/google/callback` (console da plataforma)
- Apple: `https://APP_HOST/api/v1/auth/oauth/apple/callback` no Services ID.

Variáveis: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APPLE_SERVICES_ID`, `APPLE_CLIENT_ID`,
`APPLE_BUNDLE_IDS`, `OAUTH_MOBILE_SCHEMES` (`agrorende`, `agrorende-preview`). Detalhes em
`docs/RUNBOOK.md` §3 e §4. Produção recusa iniciar se `GOOGLE_OIDC_ISSUER` não for
`https://accounts.google.com`.

## Objetivo

Registrar os domínios definitivos nos provedores de identidade e concluir a verificação da tela de
consentimento do Google.

## Escopo

### Incluído

- Domínios autorizados no Google Cloud (apex) e verificação de propriedade no Search Console.
- Callbacks de staging e produção nos dois clientes; callback do console da plataforma no host
  definido pela tarefa 021, se ele sair de `APP_HOST`.
- Links de política de privacidade e termos apontando para o site definitivo (`SITE_URL`).
- Apple: domínios e return URLs no Services ID; verificação de domínio.
- Teste de ponta a ponta: login Google/Apple no web, no app `preview` e no console da plataforma.

### Fora do escopo

- SSO corporativo (tarefa 034).

## Critérios de aceite

- [ ] Login Google funciona em staging e produção com os novos hosts.
- [ ] Login Apple funciona no web e no iOS (quando disponível, tarefa 046).
- [ ] Tela de consentimento publicada sem aviso de "app não verificado".
- [ ] `docs/RUNBOOK.md` §3/§4 atualizados via change request com os novos URIs.

## Notas técnicas

- Se o console da plataforma for para outro host (tarefa 021), a função `platformCallbackUrl()` em
  `packages/core/src/modules/tenancy/platform.ts` precisa usar esse host.

## Riscos

- Verificação do Google pode levar dias; iniciar cedo.

## Dependências

- 016.
