# Observabilidade no cluster: logs, métricas, alertas e Sentry

**ID:** 011 · **Épico:** Kubernetes · **Prioridade:** P1 · **Estimativa:** M

## Contexto

`docs/ARCHITECTURE.md` §12: logs JSON `pino` com `requestId`, `orgId`, `userId`, `deviceId`,
`mutationId`, sem PII em `info`; Sentry no web, mobile e serviços Node (`SENTRY_DSN`, ambiente =
`APP_ENV`); métricas de sync emitidas como eventos estruturados (`sync.push.batch`,
`sync.tx.retries`, `sync.pull.page`, `events.outbox.lag`, `media.upload.complete`,
`location.ingest`, `ux.error`) com "dashboards later". Hoje há verificação de uptime em
`/api/v1/health` e alerta de disco a 70 % na VM (§18.3). Os logs da VM são `json-file` com rotação
(`docker compose logs`, `docs/RUNBOOK.md` §13).

## Objetivo

Coletar logs, métricas e alertas do cluster e da aplicação, com painéis para os eventos de sync já
emitidos.

## Escopo

### Incluído

- Escolher pilha (ex.: Grafana Cloud, Loki + Prometheus + Grafana no cluster, ou serviço do
  provedor) considerando custo e LGPD (retenção e país).
- Coleta de logs dos pods com retenção de 30 dias (igual ao previsto para CloudWatch).
- Métricas de cluster (kube-state-metrics, node exporter) e de ingress (latência, 5xx por host).
- Transformar os eventos estruturados de §12 em métricas (via pipeline de logs) e criar painéis:
  sync, outbox, upload de mídia, pings de localização, erros de UX.
- Alertas: 5xx acima do limiar, pods em `CrashLoopBackOff`, réplicas indisponíveis, memória do
  Redis/evictions, atraso do outbox, certificado a vencer, job de migração falho.
- Garantir `environment` e `release` no Sentry com o SHA da imagem.

### Fora do escopo

- SLOs formais (tarefa 039) e página de status (tarefa 038).

## Critérios de aceite

- [ ] Busca por `requestId` encontra a linha de log de uma requisição em staging.
- [ ] Painel de sync mostra `sync.push.batch` por minuto e p95 de duração.
- [ ] Alerta de teste (pod derrubado) chega ao canal de operações.
- [ ] Nenhum e-mail, CPF/CNPJ ou coordenada aparece em logs de nível `info` (amostragem auditada).

## Notas técnicas

- Não adicionar dependências de métricas no código sem exceção à regra R4; priorizar extração a
  partir dos logs existentes.

## Riscos

- Custo de ingestão de logs (GPS e sync geram volume). Amostrar `debug` e definir quotas.

## Dependências

- 004.
