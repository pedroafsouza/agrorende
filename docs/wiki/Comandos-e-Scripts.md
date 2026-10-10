# Comandos e scripts

Todos os comandos rodam a partir da raiz do repositório. Eles estão definidos no
[`package.json`](https://github.com/pedroafsouza/agrorende/blob/main/package.json) da raiz e em
[`scripts/`](https://github.com/pedroafsouza/agrorende/tree/main/scripts). O significado dos rótulos
**[automated-local]** e **[human]** está em [Primeiros passos](Primeiros-Passos).

## Scripts do `package.json`

| Script | Rótulo | O que faz |
|---|---|---|
| `pnpm dev` | [automated-local] | Web (3000), realtime (4001) e worker (health em 4002) em modo watch. |
| `pnpm dev:setup` | [automated-local] | Configuração local da primeira vez (veja [Primeiros passos](Primeiros-Passos#o-que-o-pnpm-devsetup-faz)). |
| `pnpm dev:mobile` | [human] | Metro para o dev client Expo (`expo start --dev-client`). |
| `pnpm dev:landing` | [automated-local] | Site público em modo dev na porta 3300. |
| `pnpm build` · `pnpm build:landing` | [automated-local] | Builds de produção; `build:landing` gera o site estático, servido em 3301. |
| `pnpm lint` · `pnpm typecheck` · `pnpm test` | [automated-local] | Uma etapa do gate de qualidade em todo o workspace. |
| `pnpm check` | [automated-local] | Lint, typecheck e testes de tudo. |
| `pnpm check:only <filtros>` | [automated-local] | O mesmo gate só para os pacotes escolhidos, por exemplo `pnpm check:only worker web` ou `pnpm check:only "...[origin/main]"`. |
| `pnpm i18n:check` | [automated-local] | Falha com chaves de tradução faltando ou sobrando, mensagens ICU inválidas, placeholders diferentes e textos vazios. `--locale <x>` verifica um idioma só. |
| `pnpm db:migrate` | [automated-local] | Garante os índices e roda as migrações de dados. |
| `pnpm db:seed` | [automated-local] | Popula os dados de demonstração. Recusa um banco não vazio, a não ser com `--force` (que limpa antes), e sempre recusa quando `APP_ENV=production`. |
| `pnpm db:reset` | [automated-local] | Apaga o banco selecionado, migra, popula e gera as mídias do seed. |
| `pnpm db:shell` | [automated-local] | `mongosh` dentro do container do MongoDB (`docker compose exec mongo mongosh agrorende`). |
| `pnpm storage:init` · `pnpm storage:seed` | [automated-local] | Cria as pastas de mídia; desenha fotos de exemplo para as mídias do seed. |
| `pnpm simulate` | [automated-local] | Tráfego de demonstração ao vivo (veja abaixo). |
| `pnpm smoke` | [automated-local] | Verificação de ponta a ponta contra servidores rodando: health, login, um relato com foto, um evento realtime, `/ops/live` e uma exportação CSV. Aceita `--base-url` e `--ws-url`. |
| `pnpm devloop` | veja abaixo | O loop de desenvolvimento ([`scripts/devloop.ts`](https://github.com/pedroafsouza/agrorende/blob/main/scripts/devloop.ts)). |

## O loop de desenvolvimento (`pnpm devloop`)

`pnpm devloop` sem flags mostra um menu para pessoas. Agentes e CI sempre usam as flags.

| Comando | Rótulo | O que faz |
|---|---|---|
| `pnpm devloop` | [human] | Menu com as ações abaixo. |
| `pnpm devloop --check` | [automated-local] | Verificação somente leitura. Itens obrigatórios: Node 24, pnpm 11, Docker rodando, MongoDB saudável, Redis acessível, portas 3000/4001/4002/4003/27017/6379 livres ou usadas pelos nossos serviços do Compose, 10 GB livres em disco e um `.env` com todas as chaves do `.env.example`. Só avisos: Java 17 e `ANDROID_HOME`, Xcode e CocoaPods, login no EAS CLI, dev client instalado. |
| `pnpm devloop --setup` | [automated-local] | `pnpm install`, depois `--lan`, depois `pnpm dev:setup`. |
| `pnpm devloop --lan` | [automated-local] | Descobre o IPv4 da máquina na rede local, grava `EXPO_PUBLIC_API_URL` e `EXPO_PUBLIC_WS_URL` em `apps/mobile/.env` e imprime um QR code da URL da API. |
| `pnpm devloop --target <local\|staging>` | [automated-local] | Aponta o `.env` do mobile para os serviços locais ou para staging, para testar um dev client contra staging. |
| `pnpm devloop --reset` | [automated-local] | `pnpm db:reset` mais `pnpm storage:seed`. Mantém os volumes do Docker. Recusa quando `APP_ENV=production`. |
| `pnpm devloop --mobile <android\|ios>` | [human] | Recompila o dev client quando o fingerprint nativo mudou; senão, inicia o Metro. Precisa de um celular ou simulador. |
| `pnpm devloop --mobile --mcp` | [human] | Inicia o Metro com o servidor MCP da Expo, para que agentes locais tirem screenshots e toquem no simulador. Exige autenticação Expo via `/mcp` feita por uma pessoa. |
| `pnpm devloop --doctor` | [automated-local] | `expo-doctor`, `pnpm i18n:check`, resumo de pacotes desatualizados e `pnpm audit --prod`. Precisa de rede. |
| `pnpm devloop --clean` | [automated-local] | Remove `apps/web/.next`, as pastas geradas `apps/mobile/android` e `apps/mobile/ios` e `node_modules/.cache`. Nunca mexe nos volumes do Docker nem no `.env`. |

## Tráfego de demonstração (`pnpm simulate`)

```bash
pnpm simulate            # [automated-local] precisa do `pnpm dev` rodando
```

O `pnpm simulate` ([`apps/worker/src/simulate.ts`](https://github.com/pedroafsouza/agrorende/blob/main/apps/worker/src/simulate.ts))
faz login com os técnicos do seed (Carlos, Pedro, Lucas e Rafael), coloca todos em serviço e os
movimenta pela região de Ribeirão Preto a 40–80 km/h, para o mapa da Central de Operações se mexer.
Quando um técnico simulado tem uma OS atribuída, o simulador aceita, dirige até o local, inicia o
trabalho com uma foto, preenche o checklist e conclui. Pressione Ctrl-C para parar; todo usuário
simulado sai de serviço antes de o processo terminar.

| Flag | Padrão | Significado |
|---|---|---|
| `--speed <n>` | `1` | Multiplicador de tempo. `--speed 20` faz um reparo de 5 minutos levar 15 segundos. |
| `--users <emails>` | os quatro técnicos | Lista de emails do seed, separados por vírgula. |
| `--base-url <url>` | `APP_URL` ou `http://localhost:3000` | Servidor web/API. |
| `--ws-url <url>` | `NEXT_PUBLIC_REALTIME_URL` ou `http://localhost:4001` | Servidor realtime. Se estiver fora do ar, as posições vão pela API REST. |
| `--password <senha>` | `SEED_PASSWORD` ou `agrorende123` | Senha dos usuários simulados. |
| `--duration <segundos>` | nenhum | Para sozinho depois desse tempo. |
| `--help` | | Mostra o texto de uso. |

## Comandos por pacote

Cada app e pacote tem seus próprios scripts; chame com `pnpm --filter <nome> <script>`. Alguns úteis:

| Comando | O que faz |
|---|---|
| `pnpm --filter web exec playwright test` | Testes end-to-end do painel (sobe a pilha de e2e). |
| `pnpm --filter landing e2e` · `pnpm --filter landing lhci` | Testes end-to-end e Lighthouse CI do site. |
| `pnpm --filter landing brand` | Rasteriza os SVGs da marca em PNGs e ícones. |
| `pnpm --filter mobile test:chaos` | Suíte de caos do sync offline (veja [Testes e qualidade](Testes-e-Qualidade)). |
| `pnpm --filter @agrorende/motion build:lottie` | Regera as animações Lottie a partir do código-fonte. |
