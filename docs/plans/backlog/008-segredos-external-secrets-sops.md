# Segredos no cluster: External Secrets Operator ou SOPS

**ID:** 008 · **Épico:** Kubernetes · **Prioridade:** P0 · **Estimativa:** M · **Tipo:** decisão + implementação

## Contexto

Hoje os segredos vivem em GitHub Environments (`staging`, `production`) e o `deploy.yml` os
renderiza em `/srv/agrorende/.env` (modo 600) com `infra/scripts/render-env.py`, validando com
`infra/scripts/validate-env.sh`. A lista completa está em `docs/RELEASING.md` §2 ("Secrets and
variables by environment"): `MONGODB_URI`, `JWT_SECRET`, `AUTH_ENCRYPTION_KEY`, `MEDIA_URL_SECRET`,
`GOOGLE_CLIENT_SECRET`, `APPLE_PRIVATE_KEY`, `SENTRY_DSN`, `RESTIC_*`, `EXPO_ACCESS_TOKEN`,
`SMOKE_*` etc. A Fase 2 prevê Secrets Manager/SSM e OIDC (§18.3). Regra do repositório: agentes
nunca gravam credenciais no Git.

## Objetivo

Escolher e implantar o mecanismo de segredos do cluster, sem segredos em texto claro no Git e com
rotação documentada.

## Escopo

### Incluído

- Comparar External Secrets Operator (lendo do cofre do provedor, ex.: AWS Secrets Manager, GCP
  Secret Manager, Azure Key Vault) com SOPS + age/KMS (segredos cifrados no Git). Registrar decisão.
- Criar `ExternalSecret` (ou arquivos SOPS) para cada nome da tabela de `docs/RELEASING.md` usado
  por `web`, `realtime`, `worker`, `migrate` e `backup`.
- Identidade de workload (IRSA/Workload Identity) para o operador ler o cofre, sem chave estática.
- Validação: portar as regras de `validate-env.sh` (64 hex em `JWT_SECRET`, `AUTH_ENCRYPTION_KEY`;
  `MEDIA_URL_SECRET` ≥ 32; proibição de `localhost`, `oidc-mock`, `:4003`; `mongodb+srv://` em
  produção) para um job/check executado antes do rollout.
- Pull secret do GHCR (`read:packages`), equivalente a `GHCR_READ_TOKEN`.
- Procedimento de rotação (ex.: `MEDIA_URL_SECRET`, já descrito em `docs/RUNBOOK.md` §10) adaptado.

### Fora do escopo

- Migrar os segredos de produção (faz parte do cutover, tarefa 013).

## Critérios de aceite

- [ ] Nenhum valor secreto em texto claro no Git (verificado por secret scanning e revisão).
- [ ] Alterar um segredo no cofre propaga para o pod após reinício controlado (ou reload) em staging.
- [ ] Check de validação falha o deploy quando `JWT_SECRET` tem formato inválido.
- [ ] Runbook de rotação atualizado para o cluster.
- [ ] Acesso ao cofre auditado e restrito por ambiente.

## Notas técnicas

- Separar segredos por serviço (princípio do menor privilégio): `realtime` não precisa de
  `GOOGLE_CLIENT_SECRET`; `worker` precisa de `AUTH_ENCRYPTION_KEY` e chaves Apple.
- Valores não secretos (hosts, `TRIAL_DAYS`, `TERMS_VERSION`) ficam em `ConfigMap`.

## Riscos

- Vazamento por `kubectl describe`/logs. Restringir RBAC de leitura de `Secret`.

## Dependências

- 002, 004.
