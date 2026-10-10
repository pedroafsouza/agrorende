# Migração da VM para Kubernetes (cutover e plano de reversão)

**ID:** 013 · **Épico:** Kubernetes · **Prioridade:** P0 · **Estimativa:** M

## Contexto

Staging e produção rodam em VMs (`infra/vm/README.md`), com Caddy como borda e mídia em
`/srv/agrorende/media`. O app móvel fala com `EXPO_PUBLIC_API_URL` (`https://APP_HOST`) e
`EXPO_PUBLIC_WS_URL` (`https://WS_HOST`), então os nomes de host não mudam na migração — só o
destino do DNS. O app é offline-first (§7): pendências ficam no outbox e são reenviadas.

## Objetivo

Mover staging e depois produção para o cluster com janela curta, sem perda de dados e com reversão
rápida para a VM.

## Escopo

### Incluído

- Checklist de pré-requisitos: chart (006), ingress/TLS (007), segredos (008), mídia S3 migrada
  (009), pipeline (010), backups (012), DNS com TTL reduzido para 60 s (016/017).
- Ensaio completo em staging, cronometrado.
- Produção: janela comunicada aos clientes (via `docs/SUPPORT.md` e banner se necessário),
  sincronização final da mídia, troca dos registros DNS de `APP_HOST`, `WS_HOST` e `SITE_HOST`,
  smoke, monitoramento de 24 h.
- Reversão: apontar DNS de volta para a VM, mantida ligada por pelo menos 7 dias em modo leitura de
  mídia; critérios objetivos de reversão (taxa de 5xx, falha de sync).
- Desligar o deploy por SSH e arquivar a VM depois do período de observação.

### Fora do escopo

- Mudança de domínio (épico Domínio).

## Critérios de aceite

- [ ] Ensaio em staging concluído com relatório (duração, problemas, ajustes).
- [ ] Produção migrada; smoke verde; nenhuma mutação perdida (contagem de `ActivityEvent` antes e
      depois da janela comparada com o outbox dos aparelhos de teste).
- [ ] Reversão ensaiada em staging em menos de 15 minutos.
- [ ] VM desligada somente após 7 dias sem incidentes, com backup final.

## Notas técnicas

- Durante a janela, a VM e o cluster compartilham o mesmo Atlas; não rodar os dois `worker` ao
  mesmo tempo (agendadores BullMQ duplicados em Redis diferentes).
- Socket.IO reconecta sozinho; avisos de "sem conexão" no app são esperados por segundos.

## Riscos

- Cache de DNS em operadoras móveis acima do TTL; manter a VM respondendo durante a transição.

## Dependências

- 007, 010, 012, 017.
