# Decisão: provedor e cluster Kubernetes no Brasil (com estimativa de custo)

**ID:** 001 · **Épico:** Kubernetes · **Prioridade:** P0 · **Estimativa:** M · **Tipo:** decisão

## Contexto

Hoje a AgroRende roda na **Fase 1**: uma VM por ambiente em São Paulo com Docker Compose e Caddy
(`infra/compose/app.yml`, `infra/compose/vm.yml`, `infra/caddy/Caddyfile`, guia em
`infra/vm/README.md`). A **Fase 2** está descrita apenas como lista de recursos AWS com ECS Fargate
(`infra/aws/README.md`) e em `docs/ARCHITECTURE.md` §18.3. O ADR-17 de `docs/ARCHITECTURE.md` §2
diz que a plataforma de contêineres da Fase 2 é substituível ("ECS Fargate reference"), então
Kubernetes cabe nessa decisão sem contrariar a arquitetura.

Os gatilhos da Fase 2 (§18.3 e `infra/aws/README.md`): disponibilidade acima de 99,5 %, mais de 200
organizações ou 3 000 usuários, segundo host de aplicação, mídia acima de 500 GB, disco acima de
70 % após um redimensionamento, ou organizações com SLA. A produção já usa MongoDB Atlas M10 em
AWS `sa-east-1`.

## Objetivo

Escolher, com justificativa registrada, o provedor e o tipo de cluster Kubernetes para `staging` e
`production`, considerando latência para o Brasil, LGPD, custo e esforço de operação, e entregar
uma estimativa de custo mensal comparada com a Fase 1.

## Escopo

### Incluído

- Comparar pelo menos: EKS (`sa-east-1`), GKE (`southamerica-east1`), AKS (Brazil South), OKE
  (Oracle, São Paulo/Vinhedo), Magalu Cloud Kubernetes e k3s em VMs de um provedor com região em
  São Paulo. Registrar que DigitalOcean não tem região no Brasil (confirmar na data da decisão),
  o que aumenta a latência para campo com 3G/4G.
- Critérios: região no Brasil, latência medida a partir de São Paulo e de uma cidade do interior
  (ex.: Rio Verde/GO ou Sorriso/MT), proximidade do Atlas `sa-east-1`, plano de controle gerenciado
  e seu custo, balanceador de carga, armazenamento em bloco e objeto S3-compatível na mesma região,
  suporte a Workload Identity/IRSA, maturidade de ingress e cert-manager, suporte em português,
  faturamento em reais.
- LGPD: residência de dados no Brasil como preferência; analisar transferência internacional
  (regulamento da ANPD sobre transferência internacional — confirmar número e vigência) para
  serviços auxiliares como Sentry e provedor de e-mail.
- Estimativa de custo mensal (staging e production) por item: plano de controle, nós, balanceador,
  volumes, bucket de mídia, egress, Redis (conforme tarefa 003), observabilidade e backups;
  comparar com o custo atual da Fase 1 (VM 4 vCPU / 8 GB / 200 GB + VM 2 vCPU / 4 GB / 50 GB +
  Atlas M10).
- Registro da decisão como ADR proposto e change request para `docs/ARCHITECTURE.md` §18.3 e
  `infra/aws/README.md` (o dono de ARCHITECTURE aplica a mudança).

### Fora do escopo

- Criar o cluster (tarefa 004).
- Escrever manifests ou Helm chart (tarefa 006).

## Critérios de aceite

- [ ] Documento de decisão em `docs/plans/backlog/decisions/001-cluster.md` (ou ADR equivalente)
      com tabela comparativa de no mínimo 5 opções e os critérios acima.
- [ ] Latência p50/p95 medida (ex.: `curl -w` ou `mtr`) de pelo menos 2 localidades brasileiras
      para cada região candidata, com data da medição.
- [ ] Planilha ou tabela de custo mensal para `staging` e `production`, com premissas explícitas
      (número de nós, tamanho, horas, tráfego).
- [ ] Recomendação única com justificativa e plano B.
- [ ] Change request aberto em `docs/change-requests/` para atualizar §18.3 (Fase 2 em Kubernetes).

## Notas técnicas

- Tamanho de referência da carga (PRD §13 e ARCHITECTURE §18.3): até 300 usuários e 100 operadores
  ao vivo por organização; GPS ~7 fixes/s em lote a cada 2 s; dezenas de requisições/s no pico;
  mídia 30–60 GB/mês.
- Serviços a hospedar: `agrorende-web` (porta 3000), `agrorende-realtime` (4001, WebSocket),
  `agrorende-worker` (4002, BullMQ), job `agrorende-migrate`, `agrorende-backup` e o site estático.
- Preferir provedor com bucket S3-compatível na mesma região (tarefa 009) e rede privada até o
  Atlas (peering ou PrivateLink), como já previsto em `infra/aws/README.md`.

## Riscos

- Custo do plano de controle gerenciado pode superar o ganho para a escala atual; considerar manter
  a Fase 1 até um gatilho ser atingido.
- k3s autogerenciado reduz custo, mas transfere upgrades, etcd e segurança para a equipe.
- Preços e regiões mudam; registrar a data das cotações.

## Dependências

Nenhuma.
