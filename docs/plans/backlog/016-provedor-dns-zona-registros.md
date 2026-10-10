# Provedor de DNS, zona e plano de registros (hosts, TLS e redirecionamentos)

**ID:** 016 · **Épico:** Domínio e DNS · **Prioridade:** P0 · **Estimativa:** P

## Contexto

Os hosts previstos estão em `docs/ARCHITECTURE.md` §18.3 e `docs/RELEASING.md`: `SITE_HOST`
(apex), `www.` (redireciona para o apex), `APP_HOST` (`app.`, admin web e API em `/api/v1`) e
`WS_HOST` (`ws.`, realtime). Staging usa `staging.`, `app.staging.` e `ws.staging.`.
`infra/aws/README.md` cita Route 53 só como referência da Fase 2. Hoje o Caddy obtém certificados
por HTTP-01, então os registros precisam apontar para a borda antes do primeiro deploy
(`infra/vm/README.md` §1).

## Objetivo

Escolher o provedor de DNS, criar a zona com DNSSEC e publicar o plano completo de registros.

## Escopo

### Incluído

- Decidir provedor (ex.: Cloudflare, Route 53, Cloud DNS, DNS do Registro.br) considerando API para
  cert-manager DNS-01, DNSSEC, proxy/CDN opcional e custo. Registrar decisão.
- Delegar os NS no Registro.br e ativar DNSSEC.
- Plano de registros (produção e staging):

  | Nome | Destino | Uso |
  |---|---|---|
  | apex `@` | ingress/borda | site (`SITE_HOST`) |
  | `www` | ingress/borda | redireciona 301 para o apex |
  | `app` | ingress/borda | admin web e API (`APP_HOST`) |
  | `ws` | ingress/borda | realtime (`WS_HOST`) |
  | `status` | provedor da página de status | tarefa 038 |
  | host do console da plataforma (proposto `plataforma`) | ingress/borda | tarefa 021 |
  | registros de e-mail (MX, SPF, DKIM, DMARC) | provedor de e-mail | tarefa 019 |
  | `CAA` | `letsencrypt.org` | restringir emissores |

- TTL baixo (300 s) no início; 60 s antes do cutover (tarefa 013).
- Decidir se o proxy da Cloudflare (se escolhida) fica ligado no `ws` (WebSocket e limites de
  tempo) e no `app` (corpo de 32 MB); começar com proxy desligado em `app` e `ws`.

### Fora do escopo

- Alterar configuração da aplicação (tarefa 017).

## Critérios de aceite

- [ ] `dig +dnssec` mostra a zona assinada e válida.
- [ ] Todos os nomes da tabela resolvem em produção e staging.
- [ ] `CAA` publicado e certificados emitidos com sucesso depois dele.
- [ ] Tabela de registros versionada (ex.: IaC ou export) e documentada no runbook.

## Notas técnicas

- Um host `api.` separado não é necessário: o contrato da API é `APP_HOST/api/v1` (§8) e o app
  móvel usa `EXPO_PUBLIC_API_URL`. Criar `api.` só com change request.

## Riscos

- DNSSEC mal configurado derruba o domínio inteiro; testar com DNSViz antes de ativar no registro.

## Dependências

- 015.
