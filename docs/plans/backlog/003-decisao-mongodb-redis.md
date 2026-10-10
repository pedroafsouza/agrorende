# Decisão: MongoDB e Redis gerenciados ou dentro do cluster

**ID:** 003 · **Épico:** Kubernetes · **Prioridade:** P0 · **Estimativa:** P · **Tipo:** decisão

## Contexto

- **Produção** usa MongoDB Atlas M10 em AWS `sa-east-1`, com Cloud Backup, PITR de 7 dias,
  snapshots diários por 30 dias e mensais por 12 meses (`docs/ARCHITECTURE.md` §18.1,
  `docs/RELEASING.md`). `validate-env.sh` exige `mongodb+srv://` em produção.
- **Staging** usa `mongo:8` em réplica de nó único na VM (perfil `staging` de `infra/compose/vm.yml`)
  com `mongodump` noturno via contêiner `backup` (restic).
- **Redis 7** roda como contêiner com AOF na VM; guarda filas BullMQ do `apps/worker`, o adaptador
  Socket.IO do `apps/realtime` (`@socket.io/redis-adapter`, `apps/realtime/src/server.ts`) e limites
  de taxa (§11). A Fase 2 prevê ElastiCache com persistência.
- O código exige réplica (transações em `withSyncTx`, §7.3), então MongoDB precisa ser replica set.

## Objetivo

Decidir, para cada ambiente, se MongoDB e Redis ficam gerenciados ou em operador dentro do
cluster, com custo, backup e responsabilidade de operação explícitos.

## Escopo

### Incluído

- MongoDB: Atlas (manter) vs MongoDB Community Operator / Percona Operator no cluster, por
  ambiente. Recomendação esperada a validar: produção continua no Atlas; staging pode ir para
  operador ou Atlas M0/M2/Flex.
- Redis: gerenciado do provedor escolhido (ElastiCache, Memorystore, Azure Cache etc.) vs
  StatefulSet/operador com AOF e volume persistente; requisitos do BullMQ (`maxmemory-policy
  noeviction`, persistência).
- Conectividade privada (peering/PrivateLink) entre cluster e Atlas e lista de IPs.
- Usuários de banco com menor privilégio por ambiente (já é P2 opcional em §11).

### Fora do escopo

- Executar a migração de dados (tarefa 013).

## Critérios de aceite

- [ ] Documento de decisão com tabela custo × risco × esforço para MongoDB e Redis.
- [ ] Configuração mínima do Redis documentada (`noeviction`, AOF `everysec`, memória, versão 7).
- [ ] Desenho de rede entre cluster e Atlas aprovado.
- [ ] Impacto em `validate-env.sh` e nas variáveis `MONGODB_URI`, `MONGODB_DB`, `REDIS_URL`
      listado.

## Notas técnicas

- `readPreference: "secondaryPreferred"` só para relatórios e dashboards, nunca para sync (§18.3).
- `MONGODB_DB` em produção deve ser `agrorende` (regra de `validate-env.sh`).
- O prefixo do adaptador Socket.IO usa o nome do banco (`socket.io:${config.mongoDbName}`), então
  staging e produção podem compartilhar Redis só se os nomes de banco diferirem — não recomendado.

## Riscos

- Banco com estado dentro do cluster aumenta o risco operacional (upgrades, discos, backups).
- Redis sem persistência perde filas BullMQ em reinício.

## Dependências

- 001 (provedor define as opções gerenciadas disponíveis).
