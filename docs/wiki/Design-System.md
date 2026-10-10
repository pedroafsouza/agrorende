# Design system — "Campo claro"

A direção visual da AgroRende se chama **Campo claro**: superfícies calmas em grafite, um verde
só para ação, laranja Terra só para momentos de marca, cores de status sempre com ícone e
palavra, e letras grandes para uso ao ar livre. A fonte oficial é
[`docs/ARCHITECTURE.md`](https://github.com/pedroafsouza/agrorende/blob/main/docs/ARCHITECTURE.md) §3.7.
**Quando uma skill ou sugestão estética divergir da §3.7, a §3.7 vence.**

## Regras

As necessidades do campo (sol, poeira, luvas) vêm antes da estética no app:

- Botão primário com **56 dp** de altura e rótulo de **18 sp** seminegrito.
- Alvos de toque com no mínimo **48 dp**.
- Corpo de texto de **17 sp** no mobile; nada de texto cinza-claro no app de campo.
- **Ícone + texto sempre.** Status = cor + ícone + palavra, nunca só cor.
- Movimento de no máximo **200 ms**, desligado quando o sistema pede movimento reduzido; vibração
  (haptics) ao enviar.
- O web pode usar 14 px em tabelas densas e 16 px no resto.
- Bordas em vez de sombras; um único nível de sombra para sobreposições.
- Raios: **8** controles, **12** cartões, **16** sheets.
- Marcadores no mapa se diferenciam pela **forma**: relato = círculo, OS = quadrado,
  máquina = losango, técnico = avatar com anel de status. Nunca só pela cor.
- O app precisa aguentar escala de fonte do sistema de 1,3× sem cortar ações primárias.

## Paleta

Tokens em [`packages/design-tokens/src/index.ts`](https://github.com/pedroafsouza/agrorende/blob/main/packages/design-tokens/src/index.ts).

| Token | Hex | Uso |
|---|---|---|
| `mata-600` | `#2B8A3E` | Logo, ícones, texto grande (o verde "Mata" da marca) |
| `mata-700` | `#237032` | Ação primária (rótulo branco), links |
| `mata-800` | `#1B5E2A` | Pressionado; primária do tema externo (outdoor) |
| `mata-400` | `#51CF66` | Primária e links no tema escuro |
| `terra-600` | `#E8590C` | Acento de marca: logo, destaques do site, ilustrações. **Nunca** status nem ação primária do app |
| `terra-700` | `#C2410C` | Texto laranja sobre branco (só no site) |
| `graphite-950` | `#111315` | Fundo do tema escuro |
| `graphite-900` | `#1C1F23` | Texto principal (tema claro) |
| `graphite-700` | `#3D434B` | Texto secundário |
| `graphite-500` | `#6B7280` | Placeholders e desabilitado só no web; nunca texto do app |
| `graphite-200/100/50` | `#E3E6EA` / `#F1F3F5` / `#F8F9FA` | Bordas e superfícies |

| Status | Cor | Significado |
|---|---|---|
| `success` | `mata-700` | OK, operacional, sincronizado |
| `warning` | texto `#A15C07`; preenchimento `#F2B705` com texto grafite | Precisa de reparo, pendente |
| `danger` | `#B42318` (claro), `#F97066` (escuro) | Fora de serviço, falhou, rejeitado |
| `info` | `#1D4ED8` (claro), `#60A5FA` (escuro) | Em reparo, em andamento |
| `neutral` | `graphite-700` | Desativado, cancelado, rascunho |

Há três temas: claro, escuro e **externo** (outdoor: `graphite-950` sobre branco, ações em
`mata-800` e bordas de 2 px, contraste AAA).

## Tipografia e ícones

- Web e site: **Geist Sans** e **Geist Mono** (IDs como `OS-0042`, leituras e valores com números
  tabulares).
- Mobile: fonte da plataforma (SF Pro / Roboto).
- Ícones: **Lucide** nos três apps (24 px com rótulo no mobile, 16–18 px no web).

## Style guides (só desenvolvimento)

Mostram cada token, tema e componente em todos os estados. São a referência das revisões visuais.

- Web: [`apps/web/src/app/(dev)/style-guide/page.tsx`](https://github.com/pedroafsouza/agrorende/blob/main/apps/web/src/app/%28dev%29/style-guide/page.tsx)
  → <http://localhost:3000/style-guide> (404 quando `APP_ENV=production`).
- App: [`apps/mobile/app/(dev)/style-guide.tsx`](https://github.com/pedroafsouza/agrorende/blob/main/apps/mobile/app/%28dev%29/style-guide.tsx)
  (escondido em builds de produção).

## Marca

A marca se chama **"Cabeceira"**: dois sulcos que correm para o horizonte formam as pernas de um
"A"; a barra é a cabeceira (a linha onde o trator manobra no fim do talhão), e nela fica um
**nó** — um anel branco com núcleo laranja Terra, o mesmo círculo que representa um relato no
mapa. Toda a justificativa está em [`docs/brand/LOGO.md`](https://github.com/pedroafsouza/agrorende/blob/main/docs/brand/LOGO.md).

| Arquivo em [`packages/design-tokens/brand/`](https://github.com/pedroafsouza/agrorende/tree/main/packages/design-tokens/brand) | Uso |
|---|---|
| `agrorende-mark.svg` | Símbolo colorido, padrão em qualquer fundo. |
| `agrorende-mark-mono.svg` · `agrorende-mark-reversed.svg` | Uma cor só (carimbos, PDFs, impressão). |
| `agrorende-favicon.svg` | Desenho otimizado para 16–32 px. |
| `agrorende-logo.svg` · `agrorende-logo-dark.svg` | Logotipo para fundo claro e para fundo escuro. |
| `app-icon.svg` · `adaptive-foreground.svg` · `adaptive-monochrome.svg` · `splash-icon.svg` | Ícones do app (iOS, Android adaptativo, Android 13 temático) e splash. |

- Os SVGs são gerados por [`generate.py`](https://github.com/pedroafsouza/agrorende/blob/main/packages/design-tokens/brand/generate.py);
  não edite à mão. `pnpm --filter landing brand` rasteriza para PNG e ícones.
- No painel, use `BrandMark` e `BrandLogo` de [`apps/web/src/components/brand/`](https://github.com/pedroafsouza/agrorende/tree/main/apps/web/src/components/brand).
- Não recolora o símbolo, não tire o anel branco do núcleo, não acrescente folhas, engrenagens ou
  sóis, e não use o desenho principal abaixo de 32 px.

## Movimento (Lottie)

O pacote [`@agrorende/motion`](https://github.com/pedroafsouza/agrorende/tree/main/packages/motion)
gera animações Lottie originais a partir de TypeScript, na paleta Campo claro e sem questões de
licença.

- Fonte: [`packages/motion/src/animations/`](https://github.com/pedroafsouza/agrorende/tree/main/packages/motion/src/animations).
  Saída: [`packages/motion/lottie/`](https://github.com/pedroafsouza/agrorende/tree/main/packages/motion/lottie).
  Regere com `pnpm --filter @agrorende/motion build:lottie`; **nunca edite o JSON à mão**.
- Catálogo: `welcome`, `report-offline`, `flow-loop`, `machine-cost`, `office-live`,
  `invite-team`, `first-machine`, `first-work-order`, `signature`, `success`, `empty`,
  `saved-on-phone`, `rental-handover`, `loading`.
- Players: `lottie-web` no painel
  ([`apps/web/src/components/motion/Lottie.tsx`](https://github.com/pedroafsouza/agrorende/blob/main/apps/web/src/components/motion/Lottie.tsx))
  e no site ([`apps/landing/src/components/Lottie.tsx`](https://github.com/pedroafsouza/agrorende/blob/main/apps/landing/src/components/Lottie.tsx));
  `lottie-react-native` no app ([`apps/mobile/src/ui/Lottie.tsx`](https://github.com/pedroafsouza/agrorende/blob/main/apps/mobile/src/ui/Lottie.tsx)).
- Sem texto dentro das animações (o significado fica no texto traduzido ao lado). Com movimento
  reduzido, mostra o quadro estático. Animações são decorativas para leitores de tela e pausam
  fora da tela.

## Revisão visual

- O agente somente leitura **`ui-reviewer`**
  ([`.github/agents/ui-reviewer.agent.md`](https://github.com/pedroafsouza/agrorende/blob/main/.github/agents/ui-reviewer.agent.md))
  compara as telas alteradas com a §3.7 e os style guides, grava achados em
  `docs/reviews/<TAREFA>-ui.md` (uma linha por achado) e screenshots em `.data/reviews/`.
- Screenshots do painel e do site: skill `playwright-cli`. Do app: servidor MCP da Expo, com um
  simulador rodando e o Metro iniciado por `pnpm devloop --mobile --mcp`.
- As skills `frontend-design` e `expo-*` em [`.github/skills/`](https://github.com/pedroafsouza/agrorende/tree/main/.github/skills)
  ajudam no trabalho visual, sempre subordinadas à §3.7.
