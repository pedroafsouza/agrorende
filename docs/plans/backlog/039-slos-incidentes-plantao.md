# SLOs, processo de incidentes e plantão

**ID:** 039 · **Épico:** Operação e confiabilidade · **Prioridade:** P1 · **Estimativa:** P

## Contexto

- `docs/RUNBOOK.md` cobre operações pontuais:
  - reinício da VM (§6);
  - restauração (§8 e §9);
  - rotação de segredo (§10);
  - celular (§11 e §12);
  - logs (§13);
  - ciclo de vida da organização (§14).
- Não há definição de metas de serviço (SLO), severidades, papéis em incidente, comunicação com
  clientes ou escala de plantão.
- As métricas de sync já são registradas como eventos estruturados (`docs/ARCHITECTURE.md` §12):
  - `sync.push.batch`;
  - `events.outbox.lag`;
  - `media.upload.complete`.

## Objetivo

Definir o que é "funcionando bem", como reagir quando não está e quem responde.

## Escopo

### Incluído

- SLOs iniciais com janela de 30 dias, propostos e revisados em 60 dias:
  - disponibilidade da API de 99,5 %;
  - p95 de `sync.push.batch` abaixo de X segundos;
  - atraso de `events.outbox.lag` abaixo de Y segundos;
  - sucesso de upload de mídia acima de Z %.
- Alertas por consumo de orçamento de erro, ligados à observabilidade da tarefa 011.
- Documento de processo de incidentes em pt-BR (proposto `docs/INCIDENTS.md`) com:
  - severidades SEV1 a SEV3;
  - papéis (coordenador, comunicação);
  - modelos de mensagem para a página de status e para o WhatsApp dos clientes;
  - postmortem sem culpados.
- Escala de plantão realista para uma equipe pequena: horário, contato e o que pode esperar até o
  dia útil seguinte.
- Simulação: um exercício de incidente em staging.

### Fora do escopo

- Contratos com SLA financeiro para clientes.

## Critérios de aceite

- [ ] SLOs documentados e visíveis num painel.
- [ ] Processo de incidentes publicado e exercitado uma vez, com postmortem de exemplo.
- [ ] Escala de plantão definida com contatos fora do repositório.

## Notas técnicas

- Evitar dados pessoais nos canais de incidente; citar o `requestId` e o `orgId`.

## Riscos

- Fadiga de alertas. Começar com poucos alertas, cada um acionável.

## Dependências

- 011, 038.
