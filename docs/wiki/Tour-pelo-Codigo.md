# Tour pelo código

Onde fica cada coisa e por onde começar quando você precisa mudar algo. Todos os caminhos são
relativos à raiz do repositório. Vários pacotes têm um `AGENTS.md` com regras locais — leia antes
de mexer.

## Se você quer mudar X, veja Y

| Quero mudar… | Onde olhar |
|---|---|
| Uma página do painel web | [`apps/web/src/app/(admin)/`](https://github.com/pedroafsouza/agrorende/tree/main/apps/web/src/app/%28admin%29) (rotas) e [`apps/web/src/features/<área>/`](https://github.com/pedroafsouza/agrorende/tree/main/apps/web/src/features) (componentes da tela) |
| Um endpoint da API REST | [`apps/web/src/app/api/v1/<recurso>/`](https://github.com/pedroafsouza/agrorende/tree/main/apps/web/src/app/api/v1) (fino) → regra em [`packages/core/src/modules/<módulo>/`](https://github.com/pedroafsouza/agrorende/tree/main/packages/core/src/modules); wrapper comum em [`apps/web/src/server/withApi.ts`](https://github.com/pedroafsouza/agrorende/blob/main/apps/web/src/server/withApi.ts) |
| O menu lateral do painel | [`apps/web/src/components/shell/nav.ts`](https://github.com/pedroafsouza/agrorende/blob/main/apps/web/src/components/shell/nav.ts) |
| Cabeçalho, sidebar, menu do usuário, sino | [`apps/web/src/features/shell/`](https://github.com/pedroafsouza/agrorende/tree/main/apps/web/src/features/shell) (`AdminShell.tsx`, `UserMenu.tsx`, `NotificationsBell.tsx`) |
| O selo "Demonstração" | [`apps/web/src/features/shell/demo.tsx`](https://github.com/pedroafsouza/agrorende/blob/main/apps/web/src/features/shell/demo.tsx) |
| A Central de Operações e o mapa ao vivo | [`apps/web/src/features/ops/`](https://github.com/pedroafsouza/agrorende/tree/main/apps/web/src/features/ops) (`OpsCenter.tsx`, `OpsMap.tsx`, `realtime.ts`) |
| Notificações (tela, flyout) | [`apps/web/src/features/notifications/`](https://github.com/pedroafsouza/agrorende/tree/main/apps/web/src/features/notifications); textos e destinatários em [`packages/core/src/notify/`](https://github.com/pedroafsouza/agrorende/tree/main/packages/core/src/notify); push em [`apps/worker/src/jobs/notifications.push.ts`](https://github.com/pedroafsouza/agrorende/blob/main/apps/worker/src/jobs/notifications.push.ts) |
| Autenticação, login, tokens | [`packages/core/src/auth/`](https://github.com/pedroafsouza/agrorende/tree/main/packages/core/src/auth); telas em [`apps/web/src/app/(auth)/`](https://github.com/pedroafsouza/agrorende/tree/main/apps/web/src/app/%28auth%29) e [`apps/mobile/app/(auth)/`](https://github.com/pedroafsouza/agrorende/tree/main/apps/mobile/app/%28auth%29) |
| Interceptação de requisições (redirects, sessão) | [`apps/web/src/proxy.ts`](https://github.com/pedroafsouza/agrorende/blob/main/apps/web/src/proxy.ts) |
| Uma tela do app de campo | [`apps/mobile/app/`](https://github.com/pedroafsouza/agrorende/tree/main/apps/mobile/app) (rotas) e [`apps/mobile/src/features/<área>/`](https://github.com/pedroafsouza/agrorende/tree/main/apps/mobile/src/features) |
| As abas do app (Hoje, Relatos, Serviços, Locações, Mais) | [`apps/mobile/app/(app)/(tabs)/`](https://github.com/pedroafsouza/agrorende/tree/main/apps/mobile/app/%28app%29/%28tabs%29) |
| O motor de sincronização | [`apps/mobile/src/sync/`](https://github.com/pedroafsouza/agrorende/tree/main/apps/mobile/src/sync) (`engine.ts`, `outbox.ts`, `push.ts`, `pull.ts`, `apply.ts`, `mutators/`); servidor em [`packages/core/src/sync/`](https://github.com/pedroafsouza/agrorende/tree/main/packages/core/src/sync) e [`apps/web/src/app/api/v1/sync/`](https://github.com/pedroafsouza/agrorende/tree/main/apps/web/src/app/api/v1/sync) |
| A tela Envios (central de sync) | [`apps/mobile/app/(app)/sync-center.tsx`](https://github.com/pedroafsouza/agrorende/blob/main/apps/mobile/app/%28app%29/sync-center.tsx) e [`apps/mobile/src/features/sync-center/`](https://github.com/pedroafsouza/agrorende/tree/main/apps/mobile/src/features/sync-center) |
| O banco local do app | [`apps/mobile/src/db/`](https://github.com/pedroafsouza/agrorende/tree/main/apps/mobile/src/db) |
| Componentes de UI do app | [`apps/mobile/src/ui/`](https://github.com/pedroafsouza/agrorende/tree/main/apps/mobile/src/ui) (Button, Screen, StateView, Lottie…) e [`apps/mobile/src/components/`](https://github.com/pedroafsouza/agrorende/tree/main/apps/mobile/src/components) (AssetPicker, ChecklistRunner, MediaCapture…) |
| Componentes de UI do painel | [`apps/web/src/components/`](https://github.com/pedroafsouza/agrorende/tree/main/apps/web/src/components) (`ui`, `forms`, `data`, `map`, `media`, `feedback`) |
| Um esquema, enum ou máquina de estados | [`packages/contracts/src/`](https://github.com/pedroafsouza/agrorende/tree/main/packages/contracts/src) (`enums.ts`, `dto/`, `machines/`, `mutations/`) |
| Uma coleção, índice ou migração | [`packages/db/src/`](https://github.com/pedroafsouza/agrorende/tree/main/packages/db/src) (`collections.ts`, `indexes.ts`, `schemas/`) e [`packages/db/migrations/`](https://github.com/pedroafsouza/agrorende/tree/main/packages/db/migrations) |
| Os dados de demonstração | [`packages/db/seed/index.ts`](https://github.com/pedroafsouza/agrorende/blob/main/packages/db/seed/index.ts) |
| Um job agendado | [`apps/worker/src/jobs/`](https://github.com/pedroafsouza/agrorende/tree/main/apps/worker/src/jobs) (registro em `index.ts`) |
| O simulador de demo | [`apps/worker/src/simulate.ts`](https://github.com/pedroafsouza/agrorende/blob/main/apps/worker/src/simulate.ts) |
| Eventos realtime e salas | [`packages/contracts/src/realtime.ts`](https://github.com/pedroafsouza/agrorende/blob/main/packages/contracts/src/realtime.ts), [`packages/core/src/events/`](https://github.com/pedroafsouza/agrorende/tree/main/packages/core/src/events), [`apps/realtime/src/`](https://github.com/pedroafsouza/agrorende/tree/main/apps/realtime/src) |
| Um código de erro | [`packages/contracts/src/errors.ts`](https://github.com/pedroafsouza/agrorende/blob/main/packages/contracts/src/errors.ts) + entrada em [`docs/ERRORS.md`](https://github.com/pedroafsouza/agrorende/blob/main/docs/ERRORS.md) (veja [Convenções](Convencoes#erros)) |
| O kit de recuperação de erros na UI | Web: [`apps/web/src/components/recovery/`](https://github.com/pedroafsouza/agrorende/tree/main/apps/web/src/components/recovery). App: [`apps/mobile/src/ui/recovery/`](https://github.com/pedroafsouza/agrorende/tree/main/apps/mobile/src/ui/recovery) |
| Um texto traduzido | Web: [`apps/web/messages/<idioma>/`](https://github.com/pedroafsouza/agrorende/tree/main/apps/web/messages). App: [`apps/mobile/src/i18n/<idioma>/`](https://github.com/pedroafsouza/agrorende/tree/main/apps/mobile/src/i18n) (registre em `resources.ts`). Compartilhado: [`packages/i18n/locales/<idioma>/`](https://github.com/pedroafsouza/agrorende/tree/main/packages/i18n/locales). Site: [`apps/landing/messages/`](https://github.com/pedroafsouza/agrorende/tree/main/apps/landing/messages). Textos nativos (permissões): [`apps/mobile/locales/`](https://github.com/pedroafsouza/agrorende/tree/main/apps/mobile/locales) |
| Cores, espaçamentos, tipografia | [`packages/design-tokens/src/index.ts`](https://github.com/pedroafsouza/agrorende/blob/main/packages/design-tokens/src/index.ts) (veja [Design system](Design-System)) |
| O logo e os ícones | [`packages/design-tokens/brand/`](https://github.com/pedroafsouza/agrorende/tree/main/packages/design-tokens/brand) (gerados por `generate.py`); componente web [`apps/web/src/components/brand/BrandLogo.tsx`](https://github.com/pedroafsouza/agrorende/blob/main/apps/web/src/components/brand/BrandLogo.tsx) |
| Uma animação Lottie | Código-fonte em [`packages/motion/src/animations/`](https://github.com/pedroafsouza/agrorende/tree/main/packages/motion/src/animations), saída em [`packages/motion/lottie/`](https://github.com/pedroafsouza/agrorende/tree/main/packages/motion/lottie); players em [`apps/web/src/components/motion/Lottie.tsx`](https://github.com/pedroafsouza/agrorende/blob/main/apps/web/src/components/motion/Lottie.tsx) e [`apps/mobile/src/ui/Lottie.tsx`](https://github.com/pedroafsouza/agrorende/blob/main/apps/mobile/src/ui/Lottie.tsx) |
| O site público | Páginas em [`apps/landing/src/app/[locale]/`](https://github.com/pedroafsouza/agrorende/tree/main/apps/landing/src/app/[locale]), conteúdo em [`apps/landing/content/`](https://github.com/pedroafsouza/agrorende/tree/main/apps/landing/content), views em [`apps/landing/src/views/`](https://github.com/pedroafsouza/agrorende/tree/main/apps/landing/src/views) |
| Configuração do app nativo (nome, ícone, plugins) | [`apps/mobile/app.config.ts`](https://github.com/pedroafsouza/agrorende/blob/main/apps/mobile/app.config.ts) e [`apps/mobile/eas.json`](https://github.com/pedroafsouza/agrorende/blob/main/apps/mobile/eas.json) |
| Variáveis de ambiente | [`.env.example`](https://github.com/pedroafsouza/agrorende/blob/main/.env.example); leitura no web em [`apps/web/src/server/config.ts`](https://github.com/pedroafsouza/agrorende/blob/main/apps/web/src/server/config.ts) |
| Scripts de desenvolvimento | [`scripts/`](https://github.com/pedroafsouza/agrorende/tree/main/scripts) (`dev-setup.ts`, `devloop.ts`, `check-only.ts`, `i18n-check.ts`, `smoke.ts`) |
| Workflows da CI | [`.github/workflows/`](https://github.com/pedroafsouza/agrorende/tree/main/.github/workflows) |

## Painel web (`apps/web`)

| Pasta | Conteúdo |
|---|---|
| `src/app/(admin)/` | Telas do escritório: `ops`, `attention` (Pendências), `reports`, `work-orders`, `rentals`, `assets`, `sites`, `customers`, `costs`, `analytics`, `maintenance`, `parts`, `stock`, `fuel`, `seasons`, `templates`, `team`, `settings`, `billing`, `imports`, `notifications`, `getting-started`, `account`. |
| `src/app/(auth)/` | Login, cadastro (`signup`) e troca de senha. |
| `src/app/(platform)/` | Console da plataforma da equipe AgroRende (`/platform`). |
| `src/app/(dev)/` | Páginas só de desenvolvimento, como o style guide. |
| `src/app/api/v1/` | A API REST, um diretório por recurso. |
| `src/app/i/[code]`, `src/app/r/[code]` | Links públicos de convite (`/i/<código>`) e de redefinição de senha (`/r/<código>`). |
| `src/features/` | Componentes de cada área, mais `shell`, `command-palette`, `onboarding`. |
| `src/components/` | Componentes reutilizáveis. |
| `src/server/`, `src/lib/` | Código só do servidor (config, `withApi`) e utilitários. |
| `messages/` | Traduções do painel. |
| `e2e/` | Testes Playwright. |

A rota `/` redireciona para `/ops` (Central de Operações).

## App de campo (`apps/mobile`)

| Pasta | Conteúdo |
|---|---|
| `app/(auth)/` | Introdução, login, onboarding e troca de senha. |
| `app/(app)/(tabs)/` | As cinco abas: `today` (Hoje), `reports` (Relatos), `jobs` (Serviços), `rentals` (Locações), `more` (Mais). |
| `app/(app)/` | Telas empilhadas: `reports/`, `jobs/`, `rentals/`, `assets/`, `fuel/`, `scan.tsx`, `notifications.tsx`, `settings.tsx`, `sync-center.tsx`. |
| `app/(dev)/` | Style guide de desenvolvimento. |
| `src/sync/`, `src/db/` | Sincronização offline e banco SQLite local. |
| `src/features/` | Lógica e componentes por área. |
| `src/ui/`, `src/components/` | Componentes base e compostos. |
| `src/auth/`, `src/location/`, `src/media/`, `src/realtime/` | Sessão e cofre seguro, localização em segundo plano, fotos e upload, socket. |
| `src/i18n/`, `locales/` | Traduções do app e textos nativos. |
| `src/web-shims/` | Substitutos para a prévia web. |
| `plugins/` | Config plugins Expo locais. |
| `test/` | Testes, incluindo a suíte de caos em `test/sync/`. |

## Serviços

| App | Arquivos principais |
|---|---|
| `apps/realtime/src/` | `server.ts` (Socket.IO), `auth.ts` (valida o JWT do socket), `handlers.ts`, `dedupe.ts`. |
| `apps/worker/src/` | `jobs/` (um arquivo por job), `simulate.ts`. |

## Pacotes

| Pacote | Destaques |
|---|---|
| `packages/contracts/src/` | `enums.ts`, `errors.ts`, `realtime.ts`, `sync.ts`, `machines/` (estados de relato, OS e locação), `mutations/`, `dto/`. |
| `packages/db/` | `src/scoped.ts`, `src/withSyncTx.ts`, `src/collections.ts`, `src/indexes.ts`, `src/testing/` (`setupTestDb`), `migrations/`, `seed/`. |
| `packages/core/src/` | `modules/` (um por domínio), `auth/`, `sync/`, `events/`, `notify/`, `jobs/`, `pdf/`, `storage/`, `tenancy/`, `permissions.ts`, `guards.ts`. |
| `packages/i18n/` | `locales/<idioma>/{common,enums,errors,exports,notifications,pdf}.json` e funções de formatação. |
| `packages/design-tokens/` | `src/index.ts` (tokens) e `brand/` (SVGs). |
| `packages/motion/` | `src/animations/` (fonte), `lottie/` (JSON gerado), `src/meta.ts`. |
| `packages/api-client/` | Cliente HTTP tipado. |
| `packages/config/` | `tsconfig/`, `eslint/`, `prettier/`. |
