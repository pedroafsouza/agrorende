# Perguntas frequentes e solução de problemas

Respostas curtas para as dúvidas mais comuns. Os problemas de instalação mais frequentes também
estão em [Primeiros passos](Primeiros-Passos#problemas-comuns).

## Ambiente

**O `node` não existe ou está na versão errada no zsh.**
O fnm não foi carregado no shell. Adicione `eval "$(fnm env --use-on-cd --shell zsh)"` ao
`~/.zshrc`, abra um terminal novo e rode `fnm use 24`. A versão certa está em
[`.node-version`](https://github.com/pedroafsouza/agrorende/blob/main/.node-version) e o pnpm no
campo `packageManager` do
[`package.json`](https://github.com/pedroafsouza/agrorende/blob/main/package.json).

**`Cannot connect to the Docker daemon`.**
O Colima não inicia sozinho. Rode `colima start` (ou `brew services start colima` para iniciar no
login).

**`docker-credential-desktop` não encontrado.**
O `~/.docker/config.json` ainda tem `"credsStore": "desktop"` do Docker Desktop. Remova a chave e
use `docker context use colima`.

**`port is already allocated` em 27017, 6379 ou 4003.**
Outro clone ou worktree está com os containers no ar. Veja com `docker ps` e pare-os. No Colima,
`colima restart` libera encaminhamentos de porta presos.

**`MongoServerError: node is not in primary or recovering state`.**
O replica set ainda está elegendo o PRIMARY. Espere alguns segundos e rode `pnpm dev:setup` de novo.

**Realtime ou worker reclamam de `REDIS_URL`.**
Falta o `.env` na raiz do clone. Rode `cp .env.example .env` ou `pnpm dev:setup`.

**A primeira página do painel demora.**
É normal: o Next.js compila cada rota na primeira visita. As seguintes são rápidas.

**Quero limpar caches sem perder o banco.**
`pnpm devloop --clean` apaga `apps/web/.next`, as pastas nativas geradas e `node_modules/.cache`,
mas nunca mexe nos volumes do Docker nem no `.env`.

## Login e dados de demonstração

**Qual é a senha?**
`agrorende123` para todas as contas do seed. A lista completa está em
[Usuários de demonstração](Usuarios-de-Demonstracao).

**O `pnpm db:seed` se recusa a rodar.**
Ele não roda num banco que já tem dados. Use `pnpm db:seed --force`, ou `pnpm db:reset` para
apagar, migrar e popular de novo.

**Como entro no console da plataforma?**
Em <http://localhost:3000/platform/login>, digite `staff@agrorende.dev` no campo do Google mock.
Esse e-mail está em `PLATFORM_ADMIN_EMAILS` no `.env.example`.

**O login com Google ou Apple falha com erro de data do token.**
O relógio da máquina e o do container OIDC mock divergem. A AgroRende tolera 60 segundos
(`ID_TOKEN_CLOCK_TOLERANCE_S` em
[`packages/core/src/auth/oidc.ts`](https://github.com/pedroafsouza/agrorende/blob/main/packages/core/src/auth/oidc.ts)).
Se for maior, reinicie o Colima para ressincronizar o relógio da VM.

**Por que aparece o selo "Demonstração"?**
Você está na organização de demonstração, ou a variável `NEXT_PUBLIC_DEMO_MODE=1` está definida.

**Os técnicos não se movem no mapa da Visão geral.**
Rode `pnpm simulate` num segundo terminal com o `pnpm dev` no ar. Veja
[Comandos e scripts](Comandos-e-Scripts#tráfego-de-demonstração-pnpm-simulate).

## App mobile

**Posso usar o Expo Go?**
Não. O app usa módulos nativos (SQLite, localização em segundo plano, câmera). Use o dev client:
`npx expo run:android` ou `pnpm devloop --mobile android`.

**O emulador Android não alcança a API.**
Dentro do emulador, `localhost` é o próprio emulador. Use `http://10.0.2.2:3000` em
`apps/mobile/.env`. Num celular físico, use o IP da sua máquina na rede local.

**Mudei uma dependência nativa e o app quebrou.**
Toda mudança nativa (novo módulo, plugin, permissão) exige gerar o dev client de novo.
`pnpm devloop --mobile android` compara o *fingerprint* nativo e, se mudou, roda sozinho
`npx expo prebuild --clean` e `npx expo run:android`; se não mudou, só inicia o Metro.

**O APK baixado da release não instala (`INSTALL_PARSE_FAILED_NO_CERTIFICATES`).**
O APK do workflow é publicado sem assinatura. Assine-o antes de instalar, como explicado em
[Releases](Releases).

## Código e qualidade

**Adicionei um texto e o CI falhou.**
Todo texto visível precisa existir em pt-BR e en. Rode `pnpm i18n:check` e complete as chaves que
faltam. Veja [Convenções](Convencoes).

**Onde coloco um novo código de erro?**
No catálogo de [`docs/ERRORS.md`](https://github.com/pedroafsouza/agrorende/blob/main/docs/ERRORS.md)
(dono: a tarefa responsável) e na seção *Error cases added* do seu arquivo de progresso. Veja
[Convenções](Convencoes#erros).

**Posso rodar `pnpm add`?**
Não durante as ondas de entrega: as fundações estão congeladas (regra R4). Abra um *change request*
em `docs/change-requests/`.

**Meus testes interferem nos de outra pessoa.**
Use um banco isolado: `MONGODB_DB=agrorende_<tarefa>` e `setupTestDb(name)` de
`@agrorende/db/testing`. Veja [Testes e qualidade](Testes-e-Qualidade).

## Ainda com dúvida?

Leia a especificação em `docs/` — ela é a fonte de verdade — ou abra uma issue em
<https://github.com/pedroafsouza/agrorende/issues>.
