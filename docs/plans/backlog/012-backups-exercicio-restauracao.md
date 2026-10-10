# Backups e exercício de restauração no Kubernetes

**ID:** 012 · **Épico:** Kubernetes · **Prioridade:** P0 · **Estimativa:** M

## Contexto

- Produção: Atlas com backup contínuo e PITR (7 dias), snapshots diários (30 dias) e mensais
  (12 meses). Restauração descrita em `docs/RUNBOOK.md` §9 ("restore into a new cluster").
- Mídia e `mongodump` de staging: contêiner `backup` (`infra/backup/Dockerfile`,
  `infra/backup/backup.sh`, imagem `agrorende-backup`) com restic para repositório externo,
  retendo 30 diários e 12 mensais (`RESTIC_REPOSITORY`, `RESTIC_PASSWORD`, `BACKUP_HOUR`).
  Restauração de mídia em `docs/RUNBOOK.md` §8.
- §18.3 prevê exercício mensal de restauração no runbook.

## Objetivo

Garantir backups verificáveis no novo ambiente e executar um exercício de restauração com tempo
medido (RTO) e perda medida (RPO).

## Escopo

### Incluído

- Mídia: versionamento e lifecycle no bucket (tarefa 009); replicação ou cópia para outra conta ou
  região com Object Lock quando disponível.
- Redis: snapshot/AOF do volume (se no cluster) ou backup do serviço gerenciado; documentar que a
  perda do Redis afeta filas, não dados de negócio.
- Staging: `CronJob` com a imagem `agrorende-backup` (ou backup do operador escolhido na tarefa 003).
- Backup de estado do cluster que não está no Git (ex.: Velero para PVCs), se houver.
- Exercício: restaurar Atlas em cluster novo + mídia de um dia escolhido em um namespace isolado,
  rodar smoke e registrar RTO/RPO.
- Alerta se o backup noturno falhar.

### Fora do escopo

- Backups por organização sob demanda (ver tarefa 030, exportação LGPD).

## Critérios de aceite

- [ ] Relatório do exercício com data, passos, RTO e RPO medidos.
- [ ] `docs/RUNBOOK.md` §8 e §9 com versão para Kubernetes (change request ao dono).
- [ ] Alerta de falha de backup testado.
- [ ] Calendário mensal do exercício definido com responsável.

## Notas técnicas

- Após restaurar o banco, celulares com cursor à frente fazem reset completo no próximo sync
  (`docs/RUNBOOK.md` §9, passo 4); validar isso no exercício com um aparelho de staging.

## Riscos

- Backup nunca testado é backup inexistente; o exercício é o critério principal.

## Dependências

- 003, 009.
