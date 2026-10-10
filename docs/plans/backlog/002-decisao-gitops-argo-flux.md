# Decisão: GitOps com Argo CD ou Flux e layout de `infra/k8s`

**ID:** 002 · **Épico:** Kubernetes · **Prioridade:** P0 · **Estimativa:** P · **Tipo:** decisão

## Contexto

O deploy atual é imperativo: `.github/workflows/deploy.yml` copia `infra/compose/*.yml`,
`infra/caddy/Caddyfile` e o artefato do site para a VM por SSH, renderiza `/srv/agrorende/.env`
(`infra/scripts/render-env.py`), valida com `infra/scripts/validate-env.sh`, roda o `migrate`,
reinicia `worker` e `realtime`, depois `web`, espera `GET /api/v1/health` e roda
`pnpm smoke`. O `release.yml` publica imagens `sha-<12>` no GHCR a partir de `main` e promove o
mesmo digest para `vX.Y.Z` em tags (`docker buildx imagetools create`). O ADR-15 define o GitHub
como plataforma, e a Fase 2 prevê credenciais via OIDC, sem chaves longas.

## Objetivo

Decidir a ferramenta de GitOps (Argo CD ou Flux) e onde ficam os manifests, preservando a
promoção do mesmo digest de `staging` para `production` e a aprovação humana para produção.

## Escopo

### Incluído

- Comparar Argo CD e Flux em: UI para operadores, suporte a Helm, multi-cluster, notificações,
  rollback, image automation, RBAC, consumo de recursos, curva de aprendizado.
- Decidir entre repositório separado (`agrorende-deploy`) e pasta `infra/k8s/` neste repositório,
  e o fluxo de promoção (PR que muda a tag/digest em `infra/k8s/envs/production`).
- Definir layout proposto, por exemplo:
  `infra/k8s/charts/agrorende/`, `infra/k8s/envs/staging/values.yaml`,
  `infra/k8s/envs/production/values.yaml`, `infra/k8s/platform/` (ingress, cert-manager,
  external-secrets, observabilidade).
- Definir como a regra atual "produção só aceita tags `v*` que já rodaram em staging" é mantida.

### Fora do escopo

- Instalar a ferramenta (tarefa 004) e integrar ao CI (tarefa 010).

## Critérios de aceite

- [ ] Documento de decisão com tabela comparativa e recomendação.
- [ ] Layout de pastas e convenção de nomes publicados.
- [ ] Fluxo de promoção descrito passo a passo, incluindo aprovação de produção e rollback para a
      tag anterior (equivalente ao `deploy.yml` com `image_tag` antigo de §18.4).
- [ ] Change request para `docs/ARCHITECTURE.md` §18.2 (tabela de workflows) e `docs/RELEASING.md`.

## Notas técnicas

- Imagens: `ghcr.io/<owner>/agrorende-web`, `agrorende-migrate`, `agrorende-realtime`,
  `agrorende-worker`, `agrorende-backup` (privadas; pull exige token `read:packages`, hoje
  `GHCR_READ_TOKEN`).
- Fixar imagens por digest (`@sha256:`) nos values de produção para garantir imutabilidade.
- O pacote `.github/**` está congelado pela regra R4 do `docs/DELIVERY-PLAN.md`; mudanças em
  workflows precisam da exceção/dono indicado no plano.

## Riscos

- Duas fontes de verdade durante a transição (VM e cluster). Mitigação: o cutover (tarefa 013)
  desliga o deploy por SSH só depois de validado.
- Argo CD exposto na internet amplia a superfície de ataque; preferir acesso via VPN/SSO.

## Dependências

Nenhuma.
