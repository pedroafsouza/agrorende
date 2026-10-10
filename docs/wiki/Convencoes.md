# Convenções

Regras para pessoas e agentes que trabalham no repositório. As fontes são
[`docs/DELIVERY-PLAN.md`](https://github.com/pedroafsouza/agrorende/blob/main/docs/DELIVERY-PLAN.md) §1,
[`docs/ARCHITECTURE.md`](https://github.com/pedroafsouza/agrorende/blob/main/docs/ARCHITECTURE.md) §19,
[`docs/ERRORS.md`](https://github.com/pedroafsouza/agrorende/blob/main/docs/ERRORS.md),
[`docs/TRANSLATING.md`](https://github.com/pedroafsouza/agrorende/blob/main/docs/TRANSLATING.md) e
[`.github/copilot-instructions.md`](https://github.com/pedroafsouza/agrorende/blob/main/.github/copilot-instructions.md).

## As regras R1–R16

Escritas para os agentes que construíram o produto em ondas, mas valem como boas práticas para
todo o time. O plano de entrega é a versão completa.

| # | Regra |
|---|---|
| R1 | Leia a especificação primeiro e use os nomes da ARCHITECTURE exatamente. |
| R2 | Fique na sua faixa: edite só os caminhos da sua tarefa (DELIVERY-PLAN §3). Pode ler tudo e sempre pode criar `docs/progress/<TAREFA>.md` e `docs/change-requests/<TAREFA>-<NNN>.md`. |
| R3 | Em vez de editar arquivo de outro dono, escreva um pedido de mudança e contorne a lacuna com um adaptador tipado na sua pasta. |
| R4 | As fundações ficaram congeladas depois da T01: sem `pnpm add`/`pnpm remove`, sem editar `pnpm-lock.yaml`, `packages/db/**`, `packages/contracts/**`, configs da raiz ou `.github/**`, salvo as exceções da T18 e T19. |
| R5 | Subagentes não rodam comandos git que mudam estado. O orquestrador faz um commit por tarefa depois do gate da onda. |
| R6 | Banco de teste isolado: `MONGODB_DB=agrorende_<tarefa>` e `setupTestDb(name)`; mídia em `MEDIA_ROOT=.data/media-<tarefa>`. |
| R7 | Verde antes de dizer pronto: `pnpm check:only <filtros>` para cada pacote tocado, mais `pnpm i18n:check` se mexeu em traduções. |
| R8 | Sem processos longos nas ondas 2 e 3; nas ondas 4 e 5 pode subir servidores, mas precisa pará-los. |
| R9 | Todo texto visível é uma chave ICU presente em todos os idiomas obrigatórios (pt-BR e en). |
| R10 | Termine escrevendo `docs/progress/<TAREFA>.md` no modelo da DELIVERY-PLAN §7.1. |
| R11 | Nada de stub silencioso. `throw notImplemented("<nome>")` só para um ponto de outra tarefa, e tudo o que faltar vai em *Gaps*. |
| R12 | Teste pontos da mesma onda com `vi.mock` do `service.ts` daquele módulo. |
| R13 | Convenções da ARCHITECTURE §19: TypeScript estrito, sem `any`, os quatro estados de tela, dinheiro em centavos, fuso da organização e nenhum dado pessoal em logs. |
| R14 | Agentes nunca perguntam ao usuário: assumem algo razoável, registram no arquivo de progresso e seguem. |
| R15 | Só npm público. Nunca adicione registry, registry de escopo ou token ao `.npmrc` nem publique pacote. |
| R16 | Todo caminho de erro segue o `docs/ERRORS.md`: implemente e teste as entradas EC da tarefa, use o kit de recuperação e nunca deixe beco sem saída. |

## Código

- **TypeScript estrito**, sem `any`.
- **Nomes da ARCHITECTURE são normativos:** pacotes, arquivos, coleções, enums, mutações, eventos,
  rotas, variáveis de ambiente e códigos de erro. Não invente sinônimos.
- **Quatro estados de tela:** carregando (skeleton), vazio (explica o próximo passo), erro
  (linguagem simples + tentar de novo) e **offline** (no app, funciona pelo SQLite com o aviso de
  offline; no web, faixa "Sem conexão — os dados podem estar desatualizados").
- **Dinheiro em centavos** (inteiros); a formatação acontece na borda, com `Intl`.
- **Datas no fuso da organização**, não no do servidor.
- **Sem dados pessoais em logs** (nomes, emails, telefones, coordenadas exatas).
- **Isolamento de tenants:** todo acesso a dados passa por `scoped(ctx)`; outra organização = NOT_FOUND.
- **Regras de dependência** entre pacotes, garantidas por ESLint (veja [Arquitetura](Arquitetura#regras-de-dependência)).
- Muitos pacotes têm um `AGENTS.md` com regras locais (por exemplo
  [`packages/db/AGENTS.md`](https://github.com/pedroafsouza/agrorende/blob/main/packages/db/AGENTS.md)).

## Erros

[`docs/ERRORS.md`](https://github.com/pedroafsouza/agrorende/blob/main/docs/ERRORS.md) cataloga todo
erro visível. Princípio: **todo erro é um desvio, nunca um beco sem saída.** A pessoa sempre vê o
que aconteceu, sabe que os dados estão salvos e tem um próximo passo óbvio que consegue fazer
sozinha, offline, em menos de 30 segundos. Ligar para o escritório é alternativa, nunca a única saída.

- Entradas são agrupadas por área: `EC-PLT` (plataforma e aparelho), `EC-SYN` (sync e mídia),
  `EC-FR` (relatos), `EC-WO` (reparo), `EC-RN` (locação), `EC-OPS` (escritório), `EC-ERP`,
  `EC-SITE` (site público).
- **Padrões de recuperação:** `AUTO`, `RETRY`, `FIX`, `ALT`, `DRAFT`, `UNDO`, `RESTORE`,
  `SETTINGS`, `REAUTH`, `UPDATE`, `OFFICE`, `DIAG`, `HANDOFF`, `FALLBACK` (ERRORS §2).
- **Anatomia da mensagem:** título (até 60 caracteres), corpo (até duas frases curtas), ação
  primária, ação secundária opcional e `Ref XXXX-XXXX` copiável para erros do servidor. Sem culpar
  o usuário, sem jargão, sem número HTTP, sem "OK" sozinho, sem apagar o que foi digitado.
- **Para adicionar um erro:** código em
  [`packages/contracts/src/errors.ts`](https://github.com/pedroafsouza/agrorende/blob/main/packages/contracts/src/errors.ts),
  linha em `ERROR_META`, chaves `errors.<CODE>.title|body|action` (e `help` opcional) nos dois
  idiomas, entrada EC no `docs/ERRORS.md` e um teste.
- Links de ajuda: `/pt-br/ajuda/erros/<codigo>` e `/en/help/errors/<codigo>` no site público.
- Use o kit de recuperação: [`apps/web/src/components/recovery/`](https://github.com/pedroafsouza/agrorende/tree/main/apps/web/src/components/recovery)
  e [`apps/mobile/src/ui/recovery/`](https://github.com/pedroafsouza/agrorende/tree/main/apps/mobile/src/ui/recovery).

## Traduções (i18n)

- **pt-BR é o idioma de referência**; en também é obrigatório. Há um pseudo-idioma `en-XA` para
  testar textos longos.
- Todo texto visível é uma chave ICU MessageFormat — nunca texto fixo no componente.
- Copie placeholders exatamente (`{at}`), use `plural` e `select` com ramo `other`, nunca monte
  frases juntando pedaços e passe números, datas e dinheiro como placeholders.
- Sem textos vazios; deixe espaço para textos ~40 % maiores que o inglês.
- Mantenha **AgroRende** sem tradução e o formato dos códigos (`AGR-000012`, `WO-000016`, `RN-000005`).
- Onde ficam os arquivos: veja [Tour pelo código](Tour-pelo-Codigo). Para adicionar um idioma, siga
  o checklist de [`docs/TRANSLATING.md`](https://github.com/pedroafsouza/agrorende/blob/main/docs/TRANSLATING.md) §5.
- Rode `pnpm i18n:check` sempre que mexer numa tradução.

## Commits e pull requests

- Mensagens no estilo **Conventional Commits** ou com prefixo de área (`Admin: …`, `Mobile: …`,
  `Landing: …`, como no histórico recente), em inglês e em prosa normal.
- Commits feitos com ajuda do Copilot levam o trailer:

  ```text
  Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>
  ```

- Antes do pull request: `pnpm check:only "...[origin/main]"` e `pnpm i18n:check`.

## Kit de agentes

O repositório traz seu próprio kit para agentes de IA (ARCHITECTURE §4.3 e
[`.github/copilot-instructions.md`](https://github.com/pedroafsouza/agrorende/blob/main/.github/copilot-instructions.md)):

- **Skills** em [`.github/skills/`](https://github.com/pedroafsouza/agrorende/tree/main/.github/skills):
  `caveman`, `caveman-review`, `expo-animation`, `expo-data-fetching`, `expo-design-system`,
  `expo-native-ui`, `expo-project-structure`, `expo-router`, `frontend-design`, `playwright-cli`
  (créditos em `THIRD_PARTY.md`).
- **Agente** `ui-reviewer` em [`.github/agents/`](https://github.com/pedroafsouza/agrorende/tree/main/.github/agents),
  somente leitura (veja [Design system](Design-System#revisão-visual)).
- **Servidor MCP** em [`.mcp.json`](https://github.com/pedroafsouza/agrorende/blob/main/.mcp.json)
  (Expo). Só carrega depois que uma pessoa confia na pasta e autentica com `/mcp`. Agentes nunca
  fazem login em serviços, nunca gravam credenciais no repositório e nunca fazem push.
- **Voz "caveman" só no chat:** agentes respondem de forma telegráfica no chat, mas código,
  comentários, documentação, arquivos de progresso, commits, pull requests e textos do produto são
  sempre escritos em prosa normal.
