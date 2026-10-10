# Stack

As versões abaixo vêm dos arquivos `package.json` de cada app e pacote e do catálogo em
[`pnpm-workspace.yaml`](https://github.com/pedroafsouza/agrorende/blob/main/pnpm-workspace.yaml).
Um `^` indica a faixa declarada; a versão exata instalada está no `pnpm-lock.yaml`. As decisões e
alternativas descartadas estão em [`docs/ARCHITECTURE.md`](https://github.com/pedroafsouza/agrorende/blob/main/docs/ARCHITECTURE.md) §2.

## Base do monorepo

| Ferramenta | Versão | Por quê |
|---|---|---|
| Node.js | 24 (`.node-version`, `engines: >=24 <25`) | Versão LTS única para apps, scripts e CI. |
| pnpm (workspaces + catálogo) | 11.0.9 (`packageManager`) | Monorepo com dependências compartilhadas por catálogo e lockfile congelado na CI. |
| TypeScript | ^5.9 | Modo estrito em todo lugar, sem `any` (ARCHITECTURE §19). |
| zod | ^4.1 | Um único contrato (`@agrorende/contracts`) valida a API, o app e o banco. |
| ESLint · Prettier | ^10.11 · ^3.9 | Lint, incluindo as regras de dependência entre pacotes. |
| tsx · tsup | ^4.23 · ^8.5 | Rodar scripts TypeScript e empacotar serviços Node. |

## Painel web do escritório e API (`apps/web`)

| Tecnologia | Versão | Por quê |
|---|---|---|
| Next.js (App Router) | 16.3.8 (`next dev --webpack`) | Um só app hospeda o painel e a API REST `/api/v1` (route handlers). |
| React | 19.x | — |
| Tailwind CSS | ^4.1.18 | Estilos a partir dos tokens "Campo claro". |
| next-intl | ^4.6 | Mensagens ICU em pt-BR e en. |
| TanStack Query · TanStack Table | ^5.90 · ^8.21 | Cache de dados do servidor e tabelas densas do escritório. |
| MapLibre GL · react-map-gl · terra-draw | ^5.13 · ^8.1 · — | Mapa da Central de Operações e desenho de cercas (geofences). |
| recharts | ^3.5 | Gráficos de custo e relatórios. |
| @dnd-kit, cmdk, sonner, next-themes | — | Arrastar no quadro de despacho, paleta de comandos, toasts, tema claro/escuro. |
| socket.io-client | catálogo | Atualizações ao vivo vindas do serviço realtime. |
| lottie-web | ^5.13 | Animações de `@agrorende/motion`. |
| Playwright · @axe-core/playwright | 1.64.0 | Testes end-to-end e de acessibilidade. |

## Site público (`apps/landing`)

| Tecnologia | Versão | Por quê |
|---|---|---|
| Next.js (`output: "export"`) | 16.3.8 | Site estático, sem servidor, porta 3300 em dev. |
| next-intl | ^4.6 | Rotas `/pt-br` e `/en`. |
| lucide-react · lottie-web | ^0.561 · ^5.13 | Ícones e animações. |
| @lhci/cli · Playwright | ^0.15 · 1.64.0 | Lighthouse CI e testes end-to-end do site. |

## Aplicativo de campo (`apps/mobile`)

| Tecnologia | Versão | Por quê |
|---|---|---|
| Expo SDK | ~58.0.1 | Builds nativos (dev client, EAS Build, EAS Update). Expo Go não é suportado. |
| React Native | ^0.87.1 | — |
| expo-router | ~58.0.11 | Rotas por arquivos em `apps/mobile/app/`. |
| expo-sqlite + drizzle-orm | ~58.0.7 + ^0.45 | Banco local: o app funciona offline e sincroniza depois. |
| zustand | ^5 | Estado de UI leve. |
| i18next + i18next-icu + react-i18next | ^25.7 | Mensagens ICU em pt-BR e en. |
| Reanimated | ^4.2 | Animações na thread de UI. |
| lottie-react-native | ~7.5 | Animações de `@agrorende/motion`. |
| @sentry/react-native | ^7.7 | Relatório de falhas do app. |
| jest-expo · Vitest | ^57 · ^3.2 | Testes de componentes e a suíte de caos do sync. |

## Serviços Node

| App | Tecnologia | Versão | Por quê |
|---|---|---|---|
| `apps/realtime` | Socket.IO + @socket.io/redis-adapter | ^4.8.4 + ^8.3 | Empurra eventos para o painel e para o app; escala horizontalmente via Redis. |
| `apps/worker` | BullMQ | ^6.3.11 | Jobs agendados e em fila (notificações, exportações, retenção, alertas). |
| `apps/worker` | expo-server-sdk | ^7.2 | Push notifications pelo serviço da Expo. |
| ambos | ioredis · jose · pino | ^6 · ^6.2 · ^10.3 | Redis, JWT e logs estruturados (sem dados pessoais). |

## Domínio e dados (`packages/*`)

| Pacote | Tecnologias | Papel |
|---|---|---|
| `@agrorende/contracts` | zod | Esquemas, enums, permissões, códigos de erro. Depende só de zod. |
| `@agrorende/db` | mongodb ^7.7, bson ^7.3 | Único pacote que fala com o MongoDB: coleções, índices, migrações, seed. |
| `@agrorende/core` | arctic ^3.7, jose, @node-rs/argon2, @react-pdf/renderer ^4.3, csv-stringify, sharp ^0.35, bullmq | Regras de negócio, autenticação, PDFs, exportações, mídia. |
| `@agrorende/api-client` | — | Cliente tipado da API, usado pelo app e pelo simulador. |
| `@agrorende/i18n` | date-fns, date-fns-tz | Catálogos compartilhados e formatação no fuso da organização. |
| `@agrorende/design-tokens` | — | Cores, espaçamentos e tipografia "Campo claro" e os SVGs da marca. |
| `@agrorende/motion` | — | Animações Lottie geradas por código. |
| `@agrorende/config` | — | Configurações compartilhadas (TypeScript, ESLint). |

## Infraestrutura

| Serviço | Versão | Por quê |
|---|---|---|
| MongoDB | `mongo:8`, replica set `rs0` de um nó | Transações (necessárias para o sync) exigem replica set. |
| Redis | 7 | Filas BullMQ, adaptador do Socket.IO, posições ao vivo e limites de taxa. |
| Mock OIDC | `ghcr.io/navikt/mock-oauth2-server:2.1.10` | Login Google e Apple local, porta 4003. Nunca publicado. |
| Docker Compose | v2 | [`docker-compose.yml`](https://github.com/pedroafsouza/agrorende/blob/main/docker-compose.yml) para a infraestrutura local; [`infra/compose/app.yml`](https://github.com/pedroafsouza/agrorende/blob/main/infra/compose/app.yml) para rodar as imagens de produção. |
| GitHub Actions | — | CI, CodeQL, releases, deploy, builds mobile e APK (veja [Testes e qualidade](Testes-e-Qualidade) e [Releases](Releases)). |

## Observabilidade

- **App mobile:** `@sentry/react-native` está instalado.
- **Painel web:** a ARCHITECTURE trata o Sentry como opcional, e `@sentry/nextjs` **não** é
  dependência de `apps/web` hoje.
- **Servidores:** logs estruturados com pino, sem dados pessoais (R13). O endpoint de health do
  worker fica na porta 4002.
