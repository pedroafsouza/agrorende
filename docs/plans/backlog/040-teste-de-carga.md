# Teste de carga em staging (sync, mídia e tempo real)

**ID:** 040 · **Épico:** Operação e confiabilidade · **Prioridade:** P1 · **Estimativa:** M

## Contexto

- O PRD §13 define a capacidade da Fase 1: 200 organizações e 3.000 usuários. Cada organização
  pode ter até 300 usuários e 100 operadores ao vivo simultâneos.
- Não há scripts de teste de carga no repositório. `scripts/` tem `smoke.ts`, `check-only.ts`,
  `dev-setup.ts` e `devloop.ts`.
- Pontos sensíveis:
  - transações do `sync/push` (`sync.tx.retries`);
  - upload multipart de 8 MiB;
  - Socket.IO com redis-adapter, só websocket;
  - ingestão de localização (`location.ingest`).

## Objetivo

Comprovar que o sistema no Kubernetes (ou na VM atual, como linha de base) aguenta a capacidade
prometida, e calibrar HPA e recursos (tarefa 006).

## Escopo

### Incluído

- Escolher a ferramenta (proposta: k6, que roda como binário, sem dependência no workspace) e
  guardar os scripts em `infra/loadtest/`, que é uma pasta nova.
- Cenários:
  - login e pull inicial de um FIELD;
  - push de lotes com mutações típicas;
  - upload de foto;
  - 100 conexões websocket por organização recebendo eventos;
  - pico de localização.
- Dados sintéticos: organizações de carga criadas por script em staging e removidas no fim.
- Relatório com p50, p95 e p99, taxa de erro, saturação (CPU, memória, conexões Mongo e Redis) e o
  primeiro gargalo encontrado.
- Ajustes recomendados de HPA, `resources` e pool de conexões.

### Fora do escopo

- Teste de carga em produção.

## Critérios de aceite

- [ ] Scripts versionados e executáveis com um comando documentado.
- [ ] Relatório com resultados para 1x e 2x a carga da Fase 1.
- [ ] Ajustes aplicados ou registrados como tarefas.
- [ ] Ambiente de staging limpo após o teste.

## Notas técnicas

- Respeitar os limites de taxa por usuário. Usar contas de teste com um limite próprio ou gerar a
  carga a partir de muitas contas.

## Riscos

- Custo do Atlas ou do cluster durante o teste. Fazer o teste em janela curta e combinada.

## Dependências

- 010.
