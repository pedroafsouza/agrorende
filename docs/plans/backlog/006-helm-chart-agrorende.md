# Helm chart `agrorende`: web, realtime, worker, site e job de migração (com HPA e PDB)

**ID:** 006 · **Épico:** Kubernetes · **Prioridade:** P0 · **Estimativa:** G

## Contexto

Os serviços estão definidos para Compose em `infra/compose/app.yml`:

| Serviço | Imagem | Porta | Saúde | Volume |
|---|---|---|---|---|
| `web` | `agrorende-web` | 3000 (`PORT`, `HOSTNAME=0.0.0.0`) | `GET /api/v1/health` | `/data/media` |
| `realtime` | `agrorende-realtime` | 4001 (`REALTIME_PORT`) | `GET /health` | — |
| `worker` | `agrorende-worker` | 4002 (`WORKER_HEALTH_PORT`) | `GET /health` | `/data/media` |
| `migrate` | `agrorende-migrate` (alvo `migrate` do Dockerfile do web) | — | job único | — |

Todos rodam como uid 1000 e leem configuração do ambiente na partida (sem `.env` na imagem). A
ordem de release é: migrate → worker e realtime → web (§18.4). O `/api/v1/health` verifica MongoDB,
Redis e se `MEDIA_ROOT` é gravável (§18.3). O realtime usa `transports: ["websocket"]` e adaptador
Redis, então não precisa de sessão fixa (sticky). Os agendadores do BullMQ são deduplicados no Redis.

## Objetivo

Criar o chart em `infra/k8s/charts/agrorende/` (layout da tarefa 002) que implanta a aplicação com
probes, recursos, segurança, autoescala e orçamento de interrupção.

## Escopo

### Incluído

- `Deployment` + `Service` para `web`, `realtime`, `worker` e `site` (tarefa 005).
- `Job` de migração como hook `pre-install,pre-upgrade` (Helm) ou `PreSync` (Argo CD), com
  `backoffLimit` baixo e `ttlSecondsAfterFinished`.
- `ConfigMap` para variáveis não secretas e referência a `Secret` gerenciado (tarefa 008).
- Probes: `startupProbe` e `readinessProbe` nos endpoints de saúde existentes; `livenessProbe`
  leve (TCP na porta) para não reiniciar pods quando o MongoDB oscila. Se for necessário um
  endpoint de liveness sem dependências, abrir change request (o contrato de `/api/v1/health` é
  da ARCHITECTURE §8).
- `resources.requests/limits` iniciais por serviço, `securityContext` (`runAsNonRoot`,
  `readOnlyRootFilesystem` quando possível, `allowPrivilegeEscalation: false`, `drop: [ALL]`).
- `terminationGracePeriodSeconds` e `preStop` para o realtime drenar WebSockets.
- `HorizontalPodAutoscaler` para `web` e `realtime` (CPU e, opcionalmente, requisições), mínimo 2
  em produção; `worker` com 1 réplica inicialmente.
- `PodDisruptionBudget` (`minAvailable: 1`) e `topologySpreadConstraints` por zona.
- `values.yaml` por ambiente com `APP_ENV`, hosts e tags/digests.
- Volume de mídia: enquanto a tarefa 009 não terminar, só é possível uma réplica de `web` e
  `worker` com o mesmo PVC `ReadWriteOnce` no mesmo nó, ou um PVC `ReadWriteMany`; documentar a
  limitação.

### Fora do escopo

- Ingress e TLS (tarefa 007), segredos reais (tarefa 008), alertas (tarefa 011).

## Critérios de aceite

- [ ] `helm lint` e `helm template` sem erros; validação com `kubeconform` no CI.
- [ ] Instalação em cluster de teste (kind/k3d) com MongoDB e Redis locais deixa os quatro
      serviços `Ready` e o job de migração `Complete`.
- [ ] `kubectl rollout restart deploy/web` não derruba requisições em produção simulada (2 réplicas
      + PDB).
- [ ] Pods passam no Pod Security `restricted`.
- [ ] `pnpm smoke --base-url <url> --ws-url <ws>` (`scripts/smoke.ts`) passa contra o cluster de teste.
- [ ] HPA escala `web` acima do mínimo sob carga sintética e volta ao mínimo depois.

## Notas técnicas

- Variáveis de ambiente usadas hoje (ver `infra/compose/app.yml` e `docs/RELEASING.md`): `APP_ENV`,
  `MONGODB_URI`, `MONGODB_DB`, `REDIS_URL`, `MEDIA_ROOT`, `MEDIA_DRIVER`, `APP_URL`, `SITE_URL`,
  `REALTIME_CORS_ORIGINS`, `NEXT_PUBLIC_REALTIME_URL`, `JWT_SECRET`, `AUTH_ENCRYPTION_KEY`,
  `MEDIA_URL_SECRET`, chaves Google/Apple, `PLATFORM_ADMIN_EMAILS`, `SENTRY_DSN` etc.
- Reaproveitar `infra/scripts/validate-env.sh` como etapa de CI sobre os values renderizados.

## Riscos

- Liveness acoplada a dependências externas causa reinícios em cascata.
- Mídia em disco local impede escalar `web` horizontalmente até a tarefa 009.

## Dependências

- 002, 003, 005.
