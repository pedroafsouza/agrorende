# Pipeline: `release.yml` e `deploy.yml` integrados ao GitOps

**ID:** 010 · **Épico:** Kubernetes · **Prioridade:** P0 · **Estimativa:** M

## Contexto

- `.github/workflows/release.yml` tem os jobs `meta`, `images`, `site`, `staging` e `promote`: em
  `main` publica `sha-<12>` e chama o deploy de staging; em tags `v*` promove o digest já testado
  com `docker buildx imagetools create` e cria a GitHub Release.
- `.github/workflows/deploy.yml` (jobs `guard` e `deploy`) faz o deploy por SSH, roda o migrate,
  reinicia os serviços, espera a saúde e executa `pnpm smoke --base-url ... --ws-url ...`
  (`scripts/smoke.ts`). Produção exige revisores e só aceita tags que já passaram em staging.
- `docs/RELEASING.md` descreve o processo e a reversão (redeploy da tag anterior, §18.4).

## Objetivo

Trocar o passo de SSH por uma atualização GitOps (PR ou commit de tag/digest), mantendo a
promoção do mesmo digest, a aprovação de produção, o smoke e a reversão.

## Escopo

### Incluído

- Em `main`: após publicar as imagens, atualizar `infra/k8s/envs/staging` com o novo digest
  (commit automático ou PR com auto-merge), aguardar o sync/health e rodar o smoke contra staging.
- Em tag `v*`: abrir PR de promoção para `infra/k8s/envs/production` com os mesmos digests; o
  ambiente `production` do GitHub continua exigindo revisor.
- Publicar também a imagem do site (tarefa 005).
- Status do deploy de volta ao GitHub (Deployments API ou notificação do Argo CD/Flux).
- Reversão: workflow manual que reaplica os digests da versão anterior.
- Manter o caminho por SSH funcionando até o cutover (tarefa 013) por meio de um input/variável.

### Fora do escopo

- Pipeline mobile (`mobile.yml`, `android-apk.yml`).

## Critérios de aceite

- [ ] Merge em `main` chega a staging no cluster sem ação manual, com smoke verde.
- [ ] Tag `vX.Y.Z` gera PR de produção com digests idênticos aos de staging (verificado no CI).
- [ ] Produção não sincroniza sem aprovação.
- [ ] Reversão para a versão anterior concluída em menos de 10 minutos em ensaio.
- [ ] `docs/RELEASING.md` atualizado pelo dono do arquivo (change request).

## Notas técnicas

- Mudanças em `.github/**` estão congeladas (R4); seguir o dono/exceção do `docs/DELIVERY-PLAN.md`.
- O job de migração deve concluir antes do rollout (hook da tarefa 006); se falhar, o rollout não
  acontece.
- Usar token de escopo mínimo (GitHub App) para os commits de promoção.

## Riscos

- Loop de commits automáticos; filtrar por caminho e autor.

## Dependências

- 002, 006, 008.
