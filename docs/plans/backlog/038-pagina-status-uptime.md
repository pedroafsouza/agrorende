# Página de status e monitoramento de disponibilidade externo

**ID:** 038 · **Épico:** Operação e confiabilidade · **Prioridade:** P0 · **Estimativa:** P

## Contexto

- Existem endpoints de saúde (`docs/ARCHITECTURE.md` §12):
  - web: `GET /api/v1/health`, que verifica Mongo, Redis e se `MEDIA_ROOT` aceita escrita;
  - realtime: `GET /health`, porta 4001;
  - worker: `GET /health`, porta 4002.
- O `deploy.yml` roda `pnpm smoke` (`scripts/smoke.ts`) após cada deploy.
- Não existe monitoramento externo contínuo, nem página de status pública, nem alerta para a equipe
  quando o sistema cai fora de um deploy.
- A tarefa 016 reserva o registro DNS do status (proposto `status.<domínio>`).

## Objetivo

Saber que o sistema caiu antes do cliente e ter uma página pública para comunicar incidentes.

## Escopo

### Incluído

- Escolher serviço gerenciado (por exemplo Better Stack, UptimeRobot, Instatus) ou auto-hospedado
  (Uptime Kuma fora do cluster principal). Registrar a escolha e o custo.
- Monitores, a cada 1 minuto e de pelo menos uma localidade no Brasil:
  - landing (apex);
  - `app.` (`/api/v1/health`);
  - `ws.` (handshake ou `/health` exposto);
  - expiração do certificado TLS;
  - expiração do domínio.
- Alertas para a equipe de plantão (e-mail, WhatsApp ou Telegram, conforme o serviço), com política
  de reenvio.
- Página `status.<domínio>` em pt-BR com os componentes: Aplicativo, Painel web, Tempo real,
  Site. Incluir histórico de incidentes.
- Link para a página de status no rodapé da landing e na tela de ajuda do admin (change request,
  se o dono for outro).

### Fora do escopo

- Métricas internas e dashboards (tarefa 011).

## Critérios de aceite

- [ ] Derrubar o web em staging gera um alerta em menos de 3 minutos.
- [ ] A página de status abre em `status.<domínio>` com TLS válido.
- [ ] O worker, que não é exposto publicamente, tem monitoramento por heartbeat ou por métrica
      interna, documentado.

## Notas técnicas

- `GET /api/v1/health` checa dependências internas. Não expor detalhes internos na resposta pública.

## Riscos

- Monitor e sistema no mesmo provedor caindo juntos. Usar um serviço externo ao cluster.

## Dependências

- 016.
