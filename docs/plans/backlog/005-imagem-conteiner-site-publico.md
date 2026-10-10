# Imagem de contêiner para o site público (`apps/landing`)

**ID:** 005 · **Épico:** Kubernetes · **Prioridade:** P0 · **Estimativa:** P

## Contexto

O site público é um export estático de `apps/landing` (ARCHITECTURE §22). Hoje o `deploy.yml`
roda `pnpm --filter landing build` com as variáveis do ambiente (o build lê `SITE_URL`, `APP_URL`,
`SITE_SHOW_PRICES`, `SITE_WHATSAPP`, `SITE_CONTACT_EMAIL`, `SITE_PRIVACY_EMAIL`,
`SITE_APP_STORE_URL`, `SITE_PLAY_STORE_URL`, `TERMS_VERSION`, `PLATFORM_SUPPORT_WHATSAPP` em
`apps/landing/src/lib/config.ts`) e copia a saída para `/srv/agrorende/site`, servida pelo Caddy.
O bloco `{$SITE_HOST}` do `infra/caddy/Caddyfile` tem regras próprias: CSP, cabeçalhos de cache
(imutável para `/_next/static/*`, uma semana para imagens, `no-cache` para HTML), redirecionamento
de `/` por `Accept-Language` (`/en/` ou `/pt-br/`), `www` → apex e páginas de erro 404 por idioma,
incluindo a página de código desconhecido (EC-SITE-07). `apps/landing/scripts/serve.ts` espelha
essas regras para testes locais. Não existe imagem `agrorende-site`.

## Objetivo

Publicar uma imagem `agrorende-site` (nome proposto) que sirva o export estático com as mesmas
regras do Caddyfile, para rodar no cluster atrás do ingress.

## Escopo

### Incluído

- Dockerfile (proposto: `apps/landing/Dockerfile`) com estágio de build e estágio final Caddy 2
  (reaproveitando o bloco do site) ou nginx sem root, porta 8080, uid não-root.
- Como as variáveis do site entram no build, gerar uma imagem por ambiente (tags
  `sha-<12>-staging` e `sha-<12>-production`) **ou** separar valores dependentes de ambiente em um
  `config.json` lido em runtime. Registrar a escolha.
- Endpoint de saúde estático (ex.: `/healthz`) para probes.
- Job no `release.yml` para construir e publicar a imagem no GHCR (via dono de `.github/**`).
- Teste automatizado que compara as respostas da imagem com `apps/landing/scripts/serve.ts`
  (redirecionamento por idioma, 404 por idioma, cabeçalhos de cache e CSP).

### Fora do escopo

- CDN na frente do site (pode ser tarefa futura).

## Critérios de aceite

- [ ] `docker run` da imagem responde 302 em `/` para `/pt-br/` e para `/en/` com
      `Accept-Language: en`.
- [ ] `/_next/static/*` retorna `Cache-Control: public, max-age=31536000, immutable`; HTML retorna
      `no-cache`.
- [ ] `/pt-br/ajuda/erros/QUALQUER` serve a página de código desconhecido com status 404.
- [ ] CSP idêntica à do Caddyfile.
- [ ] Imagem roda como não-root e passa em Pod Security `restricted`.

## Notas técnicas

- Manter o Caddyfile atual da Fase 1 funcionando até o cutover (tarefa 013).
- O redirecionamento `www` → apex pode ficar no ingress (tarefa 007) em vez da imagem.

## Riscos

- Divergência entre `serve.ts`, Caddyfile e a nova imagem. Mitigação: o teste de paridade acima.

## Dependências

Nenhuma.
