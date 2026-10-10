# Primeiros passos

Esta página leva você do clone até o painel web, o site e o app rodando localmente. Os comandos
foram tirados do `package.json` da raiz, de [`scripts/`](https://github.com/pedroafsouza/agrorende/tree/main/scripts)
e de [`docker-compose.yml`](https://github.com/pedroafsouza/agrorende/blob/main/docker-compose.yml).

> **Rótulos dos comandos.** Como no README original, cada comando é **[automated-local]** (roda
> sozinho numa máquina de desenvolvimento) ou **[human]** (precisa de uma pessoa: um celular, um
> login interativo, uma conta na Apple, no Google ou na Expo, ou uma decisão). Agentes nunca
> executam passos **[human]**.

## Pré-requisitos

| Ferramenta | Versão | Observações |
|---|---|---|
| Node.js | 24 LTS | Fixado em [`.node-version`](https://github.com/pedroafsouza/agrorende/blob/main/.node-version) e em `engines` (`>=24 <25`). Recomendamos o [fnm](https://github.com/Schniz/fnm) (`fnm use 24`); `nvm` ou `volta` também funcionam. |
| pnpm | 11.0.9 | Fixado no campo `packageManager` do `package.json`. Ative com `corepack enable` (ou `npm i -g pnpm@11`). |
| Docker | Engine com Compose v2 | Roda MongoDB 8 (replica set de um nó), Redis 7 e o mock de OpenID Connect para Google e Apple. No macOS usamos **Colima** (`brew install colima docker docker-compose docker-buildx`, depois `colima start`); o Docker Desktop também funciona. |
| JDK 17 e Android SDK | JDK 17, SDK atual | Para compilar o dev client Android. Defina `JAVA_HOME` e `ANDROID_HOME`. Opcional se você só trabalha no web. |
| Xcode e CocoaPods | Atual | Só no macOS, para o dev client iOS. Opcional. |
| Conta Expo | Gratuita | Opcional em desenvolvimento. Necessária para EAS Build e EAS Update. |

É preciso ter pelo menos **10 GB livres** em disco; `pnpm devloop --check` verifica isso.

## Do clone ao painel

```bash
git clone https://github.com/pedroafsouza/agrorende.git
cd agrorende
fnm use 24               # ou nvm/volta; precisa ser Node 24
corepack enable          # [human] uma vez por máquina; pode exigir sudo dependendo de como o Node foi instalado
pnpm install             # [automated-local]
pnpm devloop --check     # [automated-local] verificação somente leitura; sai com código 1 se algo obrigatório falhar
pnpm dev:setup           # [automated-local] veja abaixo
pnpm dev                 # [automated-local] web em :3000, realtime em :4001, health do worker em :4002
```

`pnpm devloop --setup` faz `pnpm install`, `pnpm devloop --lan` e `pnpm dev:setup` de uma vez.

### O que o `pnpm dev:setup` faz

1. Copia `.env.example` para `.env` quando `.env` não existe. Os valores padrão funcionam
   localmente.
2. Sobe MongoDB, Redis e o mock OIDC com `docker compose up -d --wait` e espera ficarem saudáveis.
   O healthcheck do Mongo inicia o replica set `rs0` e só fica saudável quando o nó é PRIMARY.
3. Roda `pnpm db:migrate` (índices e migrações de dados ordenadas).
4. Roda `pnpm storage:init` (cria as pastas locais de mídia em `MEDIA_ROOT`, padrão `./.data/media`).
5. Roda `pnpm db:seed` (as organizações, pessoas, máquinas e serviços de demonstração).
6. Roda `pnpm storage:seed` (fotos de exemplo para as mídias do seed).

Depois abra <http://localhost:3000> e entre com um dos logins de
[Usuários de demonstração](Usuarios-de-Demonstracao) — por exemplo `despacho@agrorende.dev` /
`agrorende123`.

## Portas

| Porta | Serviço | Variável para mudar |
|---|---|---|
| 3000 | Painel web do escritório e API REST (`/api/v1`) | `PORT`, depois `APP_URL` |
| 4001 | Realtime (Socket.IO) | `REALTIME_PORT`, depois `NEXT_PUBLIC_REALTIME_URL` e `REALTIME_CORS_ORIGINS` |
| 4002 | Health do worker | `WORKER_HEALTH_PORT` |
| 4003 | Mock OIDC (Google e Apple). Os testes end-to-end usam 4103 | — |
| 3300 | Site público em modo dev (`pnpm dev:landing`) | — |
| 3301 | Site público estático (`pnpm build:landing`) | — |
| 27017 | MongoDB | `MONGODB_URI` |
| 6379 | Redis | `REDIS_URL` |

Os testes end-to-end do web sobem uma pilha própria: web 3100, realtime 4101, `MONGODB_DB=agrorende_e2e`.

## Rodar o site público

```bash
pnpm dev:landing         # [automated-local] next dev na porta 3300; abra http://localhost:3300/pt-br
pnpm build:landing       # [automated-local] build estático (output: "export") servido em :3301
```

O site fica em [`apps/landing`](https://github.com/pedroafsouza/agrorende/tree/main/apps/landing).
Ele não tem API nem servidor: as rotas são prefixadas por idioma (`/pt-br`, `/en`) e as páginas
de ajuda de erros são geradas a partir do catálogo de erros.

## Rodar o app mobile

O Expo Go **não** é suportado, porque o app usa módulos nativos (SQLite, localização em segundo
plano, câmera, armazenamento seguro). Você precisa de um **dev client**.

1. **[human]** Coloque o celular e o computador na mesma rede Wi-Fi.
2. **[automated-local]** `pnpm devloop --lan` grava `EXPO_PUBLIC_API_URL` e `EXPO_PUBLIC_WS_URL`
   em `apps/mobile/.env`, por exemplo `http://192.168.0.10:3000` e `http://192.168.0.10:4001`.
   - **Emulador Android na mesma máquina:** use `http://10.0.2.2:3000` e `http://10.0.2.2:4001`.
   - **Simulador iOS na mesma máquina:** `http://localhost:3000` e `http://localhost:4001` funcionam.
3. **[human]** Instale o dev client uma vez: `npx expo run:android` ou `npx expo run:ios` dentro de
   `apps/mobile` (ou `eas build --profile development` e instale o build). No Android, abra antes
   um emulador pelo Android Studio (Device Manager) ou conecte um aparelho com depuração USB.
4. **[human]** `pnpm dev:mobile` inicia o Metro (`expo start --dev-client`). Abra o app
   **AgroRende Dev** e escaneie o QR code (ou pressione `a` no terminal para o emulador Android).

A variante de desenvolvimento se chama "AgroRende Dev" (`app.agrorende.field.dev`, esquema de URL
`agrorende-dev`), para poder ficar ao lado dos apps de staging e da loja no mesmo celular.

**Mudança só em JavaScript:** o Fast Refresh aplica sozinho. **Mudança nativa** (novo plugin Expo,
permissão ou biblioteca nativa): o fingerprint muda, então rode `pnpm devloop --mobile android` ou
`pnpm devloop --mobile ios` para recompilar o dev client (ou `eas build --profile development`).

### Prévia web do app (Expo web)

O [`metro.config.cjs`](https://github.com/pedroafsouza/agrorende/blob/main/apps/mobile/metro.config.cjs)
suporta uma **prévia de desenvolvimento no navegador** (`expo start --web`, dentro de `apps/mobile`).
Pacotes só nativos (`react-native-maps`, `react-native-signature-canvas`) são trocados por
substitutos simples em [`apps/mobile/src/web-shims/`](https://github.com/pedroafsouza/agrorende/tree/main/apps/mobile/src/web-shims).
Serve para olhar telas rapidamente; não substitui o teste em Android ou iOS e não é um produto
publicado.

## O loop diário

1. **Primeira vez:** `corepack enable`, depois `pnpm devloop --check`, depois `pnpm devloop --setup`.
2. **Todo dia:** `pnpm dev` para web, realtime e worker em modo watch, e `pnpm dev:mobile` para o
   Metro, com o dev client aberto no celular.
3. **Mudança de dados ou índices:** `pnpm db:migrate`.
4. **Antes de um pull request:** `pnpm check:only "...[origin/main]"` e `pnpm i18n:check`.
5. **Execução parecida com produção:**
   `docker compose -f docker-compose.yml -f infra/compose/app.yml up --build` roda as três imagens
   de produção contra a infraestrutura local (veja [Releases](Releases)).

Todos os comandos do `pnpm devloop` e do `package.json` estão em [Comandos e scripts](Comandos-e-Scripts).

## Problemas comuns

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| `node: command not found` ou versão errada no zsh | O fnm não está carregado no shell | Adicione `eval "$(fnm env --use-on-cd --shell zsh)"` ao `~/.zshrc` (e `--shell bash` ao `~/.bashrc`), abra um terminal novo e rode `fnm use 24`. |
| `Cannot connect to the Docker daemon` | Colima parado (ele não inicia sozinho no login) | `colima start`, ou `brew services start colima` para iniciar no login. |
| `docker-credential-desktop` não encontrado no `docker compose pull` | `~/.docker/config.json` ainda aponta para o Docker Desktop | Remova a chave `credsStore: "desktop"` e use o contexto `colima` (`docker context use colima`). |
| `port is already allocated` em 27017, 6379 ou 4003 | Outro projeto Compose (outro clone ou worktree) usa as portas | `docker ps` e pare os containers do outro projeto. No Colima, encaminhamentos SSH antigos podem segurar a porta; `colima restart` resolve. |
| `MongoServerError: node is not in primary or recovering state` | O replica set ainda não elegeu o PRIMARY | Espere alguns segundos e rode `pnpm dev:setup` de novo. Se persistir: `docker compose exec mongo mongosh --eval 'rs.status()'`. |
| `Missing required environment variable REDIS_URL` (realtime ou worker) | Não existe `.env` na raiz do clone que você está usando | `cp .env.example .env` ou `pnpm dev:setup`. |
| Primeira página do painel demora muito | O `next dev` (Turbopack) compila cada rota sob demanda na primeira visita | Normal; as próximas visitas são rápidas. |
| App mobile não conecta à API no emulador Android | `localhost` no emulador é o próprio emulador | Use `10.0.2.2` em `apps/mobile/.env`. |
| App instalado não abre o projeto ("no development build") | Você tentou com o Expo Go | Instale o dev client (`npx expo run:android`). |

Mais casos em [Perguntas frequentes](Perguntas-Frequentes).
