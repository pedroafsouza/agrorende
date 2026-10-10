# Ingress, WebSocket e TLS automático (ingress-nginx ou Gateway API + cert-manager)

**ID:** 007 · **Épico:** Kubernetes · **Prioridade:** P0 · **Estimativa:** M

## Contexto

Na Fase 1 o Caddy (`infra/caddy/Caddyfile`) faz o papel de borda: HTTPS automático com Let's
Encrypt (`ACME_EMAIL`), HSTS e cabeçalhos de segurança, log JSON, compressão, limite de corpo de
32 MB em `APP_HOST` (uploads de mídia em partes de 8 MiB, §7.7), proxy de `WS_HOST` para
`realtime:4001` com `stream_close_delay 5m`, e `www.` → apex. Os hosts vêm de `SITE_HOST`,
`APP_HOST` e `WS_HOST`.

## Objetivo

Reproduzir a borda no cluster com ingress-nginx ou Gateway API, cert-manager e Let's Encrypt,
incluindo WebSocket de longa duração para o realtime.

## Escopo

### Incluído

- Decidir ingress-nginx vs implementação de Gateway API (ex.: Envoy Gateway, controlador do
  provedor) e registrar. Verificar o status de manutenção do ingress-nginx na data da decisão.
- cert-manager com `ClusterIssuer` Let's Encrypt staging e produção (desafio HTTP-01 ou DNS-01 via
  provedor DNS da tarefa 016).
- Regras de host: `SITE_HOST` → `site`, `www.SITE_HOST` → redirecionamento 301 para o apex,
  `APP_HOST` → `web`, `WS_HOST` → `realtime`; host do console da plataforma conforme tarefa 021.
- WebSocket: timeouts de leitura/envio altos (ex.: 3600 s) no host do realtime; sem sticky session
  (transporte só WebSocket + adaptador Redis).
- Limite de corpo de 32 MB em `APP_HOST`; buffer de requisição desligado para
  `/api/v1/media/:id/blob*` (rotas excluídas do `proxy.ts` para não bufferizar uploads grandes).
- Cabeçalhos: HSTS, `X-Content-Type-Options`, `Referrer-Policy`, remoção de `Server`, e repasse de
  `x-request-id` (§12).
- IP real do cliente (`X-Forwarded-For` confiável) para os limites de taxa de login (§11).

### Fora do escopo

- WAF/CDN (avaliar depois). Registros DNS (tarefa 016).

## Critérios de aceite

- [ ] Certificados válidos emitidos para todos os hosts de staging; renovação testada.
- [ ] Conexão Socket.IO permanece aberta por 30 min sem queda em staging.
- [ ] Upload de 30 MB passa; 40 MB recebe 413.
- [ ] `curl -I https://www.<SITE_HOST>` retorna 301 para o apex.
- [ ] Testes de limite de taxa de login veem o IP real do cliente, não o do ingress.
- [ ] `securityheaders.com` (ou ferramenta equivalente) com nota A ou melhor no `APP_HOST`.

## Notas técnicas

- O web exige `Origin` igual a `APP_URL` em mutações por cookie (CSRF, §11); não reescrever `Origin`.
- `REALTIME_CORS_ORIGINS` precisa conter `https://APP_HOST`.

## Riscos

- Reload do controlador derrubando WebSockets; preferir controladores com reload sem queda ou
  aceitar a reconexão automática do Socket.IO.

## Dependências

- 004, 016.
