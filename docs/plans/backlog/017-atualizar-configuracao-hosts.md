# Atualizar configuração para os hosts definitivos (web, site, realtime e mobile)

**ID:** 017 · **Épico:** Domínio e DNS · **Prioridade:** P0 · **Estimativa:** M

## Contexto

Os hosts entram por várias variáveis:

- GitHub Environments (`docs/RELEASING.md` §2): `SITE_HOST`, `APP_HOST`, `WS_HOST`, `ACME_EMAIL`;
  o `deploy.yml` deriva `APP_URL=https://APP_HOST` e `SITE_URL=https://SITE_HOST`.
- Web/realtime: `APP_URL` (CSRF por `Origin`, links de convite e reset), `REALTIME_CORS_ORIGINS`,
  `NEXT_PUBLIC_REALTIME_URL` (`infra/compose/app.yml`, `.env.example`).
- Site: `SITE_URL`, `APP_URL`, `SITE_CONTACT_EMAIL`, `SITE_PRIVACY_EMAIL`, `SITE_APP_STORE_URL`,
  `SITE_PLAY_STORE_URL` (`apps/landing/src/lib/config.ts`).
- Mobile: `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WS_URL`, `EXPO_PUBLIC_SITE_URL`,
  `EXPO_PUBLIC_APP_ENV`, `EXPO_PUBLIC_SUPPORT_WHATSAPP`, também nas variáveis de ambiente do EAS
  (`docs/RELEASING.md`, "Human steps", item 3).
- `.github/workflows/android-apk.yml` tem padrões `app.agrorende.com.br` e
  `app.staging.agrorende.com.br` quando `vars.APP_HOST` está vazio.
- Placeholders em `infra/caddy/Caddyfile`, `infra/vm/README.md`, `infra/aws/README.md`,
  `docs/ARCHITECTURE.md` §18.3.

## Objetivo

Apontar todos os ambientes e builds para os hosts definitivos, com validação que impeça valores
errados.

## Escopo

### Incluído

- Preencher variáveis nos GitHub Environments e no EAS (pessoa responsável; agentes não gravam
  credenciais).
- Se o domínio final for diferente de `agrorende.com.br`, trocar os padrões nos arquivos citados
  por meio dos donos (change requests para `.github/**`, `infra/**` e ARCHITECTURE).
- Estender `infra/scripts/validate-env.sh` (ou o check equivalente do cluster, tarefa 008) para
  exigir que `APP_URL`, `SITE_URL` e `REALTIME_CORS_ORIGINS` usem o domínio aprovado.
- Novo build mobile `preview` e `production` (ou OTA se o fingerprint não mudou — as variáveis
  `EXPO_PUBLIC_*` entram no bundle JS).
- Atualizar links de suporte em `docs/SUPPORT.md` se citarem hosts.

### Fora do escopo

- Redirecionamentos OIDC (tarefa 018) e lojas (tarefa 020).

## Critérios de aceite

- [ ] `grep -rn "agrorende.com.br"` só retorna ocorrências intencionais (documentadas) se o domínio
      mudar.
- [ ] Login, convite (`/i/[code]`), reset (`/r/[code]`) e WebSocket funcionam em staging com os
      novos hosts.
- [ ] App `preview` conecta ao staging novo e sincroniza.
- [ ] Deploy falha se `APP_URL` apontar para domínio fora da lista aprovada.

## Notas técnicas

- Links de convite já emitidos usam `APP_URL` antigo; manter redirecionamento do host antigo por
  pelo menos 7 dias (validade do INVITE, §5.3 `AuthLink`).

## Riscos

- App móvel antigo em campo apontando para host desativado; manter o host antigo vivo até a base
  migrar.

## Dependências

- 016.
