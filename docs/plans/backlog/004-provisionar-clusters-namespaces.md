# Provisionar clusters, namespaces `staging`/`production` e baseline de segurança

**ID:** 004 · **Épico:** Kubernetes · **Prioridade:** P0 · **Estimativa:** M

## Contexto

Não existe nenhum manifest Kubernetes no repositório hoje: `infra/` contém `aws/` (lista de recursos
da Fase 2), `backup/`, `caddy/`, `compose/`, `docker/`, `scripts/` e `vm/`. `infra/aws/README.md`
afirma que infraestrutura como código da Fase 2 é responsabilidade de humanos, não de agentes. A
VM de produção hoje expõe só 22, 80 e 443 (`infra/vm/README.md`).

## Objetivo

Ter os clusters prontos (via IaC revisada por humanos) com namespaces, RBAC, políticas de rede e
o agente de GitOps instalado, para receber o chart da aplicação.

## Escopo

### Incluído

- IaC (Terraform/OpenTofu ou equivalente do provedor) em `infra/k8s/cluster/` ou repositório
  separado conforme tarefa 002, revisada por pessoa responsável.
- Topologia: decidir entre um cluster por ambiente ou um cluster com namespaces
  `agrorende-staging` e `agrorende-production` (recomendado: clusters separados para produção).
- Node pools com no mínimo 2 zonas em produção; nós com autoscaling.
- Namespaces de plataforma: `ingress`, `cert-manager`, `external-secrets`, `monitoring`, `argocd`
  ou `flux-system`.
- Baseline: Pod Security Admission `restricted` nos namespaces da aplicação, `NetworkPolicy`
  default-deny com liberações explícitas, `ResourceQuota` e `LimitRange`, RBAC por função
  (operador, leitura), acesso ao API server restrito (IPs autorizados ou endpoint privado).
- Instalação do Argo CD ou Flux (tarefa 002) apontando para o layout definido.
- Credenciais do GitHub Actions via OIDC (sem chaves longas, como já previsto em §18.3).

### Fora do escopo

- Ingress/TLS (tarefa 007), segredos (tarefa 008), observabilidade (tarefa 011).

## Critérios de aceite

- [ ] `kubectl get ns` mostra os namespaces previstos nos dois ambientes.
- [ ] Um pod de teste sem `runAsNonRoot` é rejeitado no namespace da aplicação.
- [ ] Um pod de teste não alcança outro namespace sem `NetworkPolicy` explícita.
- [ ] GitOps sincroniza um `ConfigMap` de exemplo a partir do Git.
- [ ] Plano de IaC aplicado a partir de PR revisado; estado remoto com lock e criptografia.
- [ ] Acesso de leitura e de operação documentado (quem tem, como pedir).

## Notas técnicas

- As imagens já rodam como uid 1000 (`user: "1000:1000"` em `infra/compose/app.yml`), compatíveis
  com `restricted`.
- Reservar IP estático/balanceador para o ingress, para os registros DNS da tarefa 016.

## Riscos

- Custos ocultos (NAT, balanceadores, logs). Acompanhar contra a estimativa da tarefa 001.
- Agentes não devem aplicar IaC nem guardar credenciais (regras do repositório).

## Dependências

- 001, 002.
