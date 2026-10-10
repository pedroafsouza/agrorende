# Testes e qualidade

## O gate local

| Comando | Rótulo | Observações |
|---|---|---|
| `pnpm check` | [automated-local] | Lint, typecheck e testes de todo o workspace. Precisa de MongoDB, Redis e do mock OIDC do `pnpm dev:setup`. |
| `pnpm check:only <filtros>` | [automated-local] | O mesmo gate só para os pacotes escolhidos, por exemplo `pnpm check:only worker web` ou `pnpm check:only "...[origin/main]"` (tudo o que mudou desde a `main`, mais os dependentes). Use `MONGODB_DB=agrorende_<nome>` para separar os dados de teste do seu banco de desenvolvimento. |
| `pnpm i18n:check` | [automated-local] | Rode sempre que mexer num arquivo de tradução. Falha com chaves faltando ou sobrando, ICU inválido, placeholders diferentes e textos vazios. |
| `pnpm smoke --base-url http://localhost:3000 --ws-url http://localhost:4001` | [automated-local] | Com o `pnpm dev` rodando: health, login, relato com foto, evento realtime, `/ops/live` e exportação CSV. |

Antes de abrir um pull request: `pnpm check:only "...[origin/main]"` e `pnpm i18n:check`.

## Ferramentas de teste por pacote

| Onde | Ferramenta | Como rodar |
|---|---|---|
| `packages/*`, `apps/web`, `apps/realtime`, `apps/worker`, `apps/landing` | Vitest | `pnpm --filter <nome> test` |
| `apps/mobile` (componentes e telas) | jest-expo | `pnpm --filter mobile test` |
| `apps/mobile` (suíte de caos do sync) | Vitest | `pnpm --filter mobile test:chaos` |
| `apps/web` (end-to-end, acessibilidade) | Playwright + axe | `pnpm --filter web exec playwright test` |
| `apps/landing` (end-to-end, SEO, Lighthouse) | Playwright + Lighthouse CI | `pnpm --filter landing e2e` · `pnpm --filter landing lhci` |

## Banco de testes isolado

Testes nunca usam o banco de desenvolvimento (regra R6 do
[plano de entrega](https://github.com/pedroafsouza/agrorende/blob/main/docs/DELIVERY-PLAN.md)):

- Defina `MONGODB_DB=agrorende_<tarefa>` ao rodar a suíte.
- Nos testes, use `setupTestDb(name)` de `@agrorende/db/testing`
  ([`packages/db/src/testing/setupTestDb.ts`](https://github.com/pedroafsouza/agrorende/blob/main/packages/db/src/testing/setupTestDb.ts)).
- Testes com mídia usam `MEDIA_ROOT=.data/media-<tarefa>`.
- Os testes end-to-end do web sobem uma pilha própria
  ([`apps/web/e2e/scripts/dev-web.sh`](https://github.com/pedroafsouza/agrorende/blob/main/apps/web/e2e/scripts/dev-web.sh)):
  `MONGODB_DB=agrorende_e2e`, web em 3100, realtime em 4101, mock OIDC em 4103. O setup global
  recusa qualquer outro banco. `E2E_REUSE_WEB=1` reaproveita um servidor dev já compilado na
  porta 3100, só para iteração local.

## A suíte de caos

[`apps/mobile/test/sync/`](https://github.com/pedroafsouza/agrorende/tree/main/apps/mobile/test/sync)
simula aparelhos perdendo sinal, reenviando comandos, entrando em conflito com o escritório e
ficando dias offline, contra o servidor real (`core` + `db`). É por isso que o mobile tem `core` e
`db` como devDependencies. A CI roda a suíte três vezes seguidas para pegar instabilidade.

## Testes que guardam regras do projeto

- **Isolamento de tenants:** acessar dados de outra organização devolve NOT_FOUND
  ([`packages/core/src/__tests__/`](https://github.com/pedroafsouza/agrorende/tree/main/packages/core/src/__tests__)).
- **Regras de dependência:** ESLint falha quando um pacote importa o que não deve
  (veja [Arquitetura](Arquitetura#regras-de-dependência)).
- **Erros:** cada código de erro tem metadados, textos nos dois idiomas e teste
  (veja [Convenções](Convencoes#erros)).
- **Traduções:** `pnpm i18n:check` também roda na CI.

## CI (GitHub Actions)

Workflows em [`.github/workflows/`](https://github.com/pedroafsouza/agrorende/tree/main/.github/workflows):

| Workflow | Quando roda | O que faz |
|---|---|---|
| [`ci.yml`](https://github.com/pedroafsouza/agrorende/blob/main/.github/workflows/ci.yml) | Pull requests e push na `main` | **checks:** `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm i18n:check`, `pnpm audit --prod --audit-level high`. **chaos:** suíte de caos 3×. **build:** `pnpm --filter web build`, build, e2e e Lighthouse do site, `expo export --platform android`. **e2e:** Playwright do painel. |
| [`codeql.yml`](https://github.com/pedroafsouza/agrorende/blob/main/.github/workflows/codeql.yml) | Pull requests, push na `main` e toda segunda-feira | Análise de segurança CodeQL. |
| [`release.yml`](https://github.com/pedroafsouza/agrorende/blob/main/.github/workflows/release.yml) | Pull requests, push na `main`, tags `v*` | Imagens Docker e site; staging na `main`; promoção da tag (veja [Releases](Releases)). |
| [`deploy.yml`](https://github.com/pedroafsouza/agrorende/blob/main/.github/workflows/deploy.yml) | Chamado por outros workflows ou manualmente | Deploy em staging ou produção. |
| [`mobile.yml`](https://github.com/pedroafsouza/agrorende/blob/main/.github/workflows/mobile.yml) | Manual, tags e PRs com o rótulo `mobile-preview` | EAS Update ou EAS Build, conforme o fingerprint nativo. |
| [`android-apk.yml`](https://github.com/pedroafsouza/agrorende/blob/main/.github/workflows/android-apk.yml) | Tags `v*.*.*` e manual | APK Android não assinado anexado à release. |
| [`copilot-setup-steps.yml`](https://github.com/pedroafsouza/agrorende/blob/main/.github/workflows/copilot-setup-steps.yml) | Manual | Prepara o ambiente do agente de código Copilot na nuvem. |

O `pnpm-lock.yaml` está commitado e a CI instala com `--frozen-lockfile`. Fora das exceções
previstas no plano de entrega, não adicione nem remova dependências (regra R4).

## Revisão visual

O agente somente leitura `ui-reviewer` ([`.github/agents/ui-reviewer.agent.md`](https://github.com/pedroafsouza/agrorende/blob/main/.github/agents/ui-reviewer.agent.md))
compara telas alteradas com o visual "Campo claro" e grava achados em `docs/reviews/<TAREFA>-ui.md`.
Screenshots do painel e do site usam a skill `playwright-cli`; as do app usam o servidor MCP da Expo
(`pnpm devloop --mobile --mcp`). Veja [Design system](Design-System).
