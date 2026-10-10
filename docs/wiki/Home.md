# Wiki de desenvolvimento da AgroRende

Bem-vindo à wiki técnica da AgroRende. Aqui você encontra como rodar o projeto, quem são os
usuários de demonstração, qual é a stack, como o código está organizado e quais regras seguimos.

## O que é a AgroRende

A AgroRende é uma plataforma de operação de campo para empresas que mantêm máquinas agrícolas
trabalhando — concessionárias com mecânicos volantes, locadoras, prestadores de serviço, grandes
fazendas e cooperativas: a equipe registra no celular, mesmo sem sinal, cada vistoria, reparo e
locação, e o escritório acompanha tudo ao vivo e descobre quanto cada máquina realmente custa e rende.

O cliente contrata a AgroRende para três trabalhos
([plano "Simpler to sell"](https://github.com/pedroafsouza/agrorende/blob/main/docs/plans/SIMPLER-TO-SELL.md), §1):

1. **Saber o que está acontecendo no campo hoje.** Relatos, fotos e o status das ordens de serviço
   chegam ao escritório assim que o celular encontra sinal.
2. **Parar de discutir sobre o que aconteceu.** Fotos de antes e depois, checklists e a assinatura
   do cliente resolvem disputas sobre reparos e locações.
3. **Saber o custo real por hora de máquina.** Peças, mão de obra, combustível e tempo parado são
   somados por máquina.

O produto é composto por um **aplicativo de campo** offline-first (Android e iOS, Expo), um
**painel web do escritório** (Next.js, que também hospeda a API REST), dois serviços Node
(**realtime** e **worker**) e um **site público** estático. Cada empresa cliente é uma
organização (tenant) isolada.

## Links rápidos

| Quero… | Página |
|---|---|
| Rodar tudo na minha máquina | [Primeiros passos](Primeiros-Passos) |
| Saber com qual login entrar | [Usuários de demonstração](Usuarios-de-Demonstracao) |
| Conhecer todos os comandos `pnpm` | [Comandos e scripts](Comandos-e-Scripts) |
| Entender as tecnologias e versões | [Stack](Stack) |
| Entender como as peças se conectam | [Arquitetura](Arquitetura) |
| Achar onde mudar alguma coisa | [Tour pelo código](Tour-pelo-Codigo) |
| Rodar testes e entender a CI | [Testes e qualidade](Testes-e-Qualidade) |
| Publicar uma versão ou gerar o APK | [Releases](Releases) |
| Seguir o visual "Campo claro" | [Design system](Design-System) |
| Conhecer as regras do time e dos agentes | [Convenções](Convencoes) |
| Traduzir termos do produto | [Glossário](Glossario) |
| Resolver um problema comum | [Perguntas frequentes](Perguntas-Frequentes) |

## O que ler, por perfil

| Perfil | Comece por | Depois leia |
|---|---|---|
| Pessoa nova no time (qualquer área) | [Primeiros passos](Primeiros-Passos), [Usuários de demonstração](Usuarios-de-Demonstracao) | [Glossário](Glossario), roteiro de demo em [`docs/DEMO.md`](https://github.com/pedroafsouza/agrorende/blob/main/docs/DEMO.md) |
| Desenvolvimento web (admin) | [Tour pelo código](Tour-pelo-Codigo), [Arquitetura](Arquitetura) | [Design system](Design-System), [Convenções](Convencoes) |
| Desenvolvimento mobile | [Primeiros passos](Primeiros-Passos#rodar-o-app-mobile), [Arquitetura](Arquitetura#fluxo-de-dados-offline-first) | [Testes e qualidade](Testes-e-Qualidade) (suíte de caos) |
| Backend, realtime e worker | [Arquitetura](Arquitetura), [Stack](Stack) | [`docs/ARCHITECTURE.md`](https://github.com/pedroafsouza/agrorende/blob/main/docs/ARCHITECTURE.md) §7–§10 |
| Design e produto | [Design system](Design-System), [Glossário](Glossario) | [`docs/PRD.md`](https://github.com/pedroafsouza/agrorende/blob/main/docs/PRD.md), [`docs/plans/SIMPLER-TO-SELL.md`](https://github.com/pedroafsouza/agrorende/blob/main/docs/plans/SIMPLER-TO-SELL.md) |
| Operações e releases | [Releases](Releases) | [`docs/RELEASING.md`](https://github.com/pedroafsouza/agrorende/blob/main/docs/RELEASING.md), [`docs/RUNBOOK.md`](https://github.com/pedroafsouza/agrorende/blob/main/docs/RUNBOOK.md) |
| Suporte | [Perguntas frequentes](Perguntas-Frequentes) | [`docs/SUPPORT.md`](https://github.com/pedroafsouza/agrorende/blob/main/docs/SUPPORT.md), [`docs/ERRORS.md`](https://github.com/pedroafsouza/agrorende/blob/main/docs/ERRORS.md) |

## Documentos normativos

A wiki é um guia de navegação. A especificação oficial continua nos arquivos de `docs/`, escritos
em inglês. Quando a wiki e esses documentos divergirem, **os documentos vencem**.

| Documento | Para quê |
|---|---|
| [`docs/PRD.md`](https://github.com/pedroafsouza/agrorende/blob/main/docs/PRD.md) | O que o produto faz e por quê. |
| [`docs/ARCHITECTURE.md`](https://github.com/pedroafsouza/agrorende/blob/main/docs/ARCHITECTURE.md) | Como é construído; todo nome definido ali é normativo. |
| [`docs/ERRORS.md`](https://github.com/pedroafsouza/agrorende/blob/main/docs/ERRORS.md) | Cada caso de erro, seu código e a saída para o usuário. |
| [`docs/DELIVERY-PLAN.md`](https://github.com/pedroafsouza/agrorende/blob/main/docs/DELIVERY-PLAN.md) · [`docs/TASKS.md`](https://github.com/pedroafsouza/agrorende/blob/main/docs/TASKS.md) | Como a construção foi dividida em tarefas e ondas. |
| [`docs/RELEASING.md`](https://github.com/pedroafsouza/agrorende/blob/main/docs/RELEASING.md) | Ambientes, releases e deploy. |
| [`docs/RUNBOOK.md`](https://github.com/pedroafsouza/agrorende/blob/main/docs/RUNBOOK.md) | Operação de staging e produção: segredos, provedores, backups, restaurações, dispositivos, logs. |
| [`docs/DEMO.md`](https://github.com/pedroafsouza/agrorende/blob/main/docs/DEMO.md) | O roteiro da demo de 10 minutos. |
| [`docs/SUPPORT.md`](https://github.com/pedroafsouza/agrorende/blob/main/docs/SUPPORT.md) | O que o suporte faz em cada caso de erro e em pedidos de conta e equipe. |
| [`docs/TRANSLATING.md`](https://github.com/pedroafsouza/agrorende/blob/main/docs/TRANSLATING.md) | Como adicionar ou mudar um idioma. |
| [`docs/LANDING.md`](https://github.com/pedroafsouza/agrorende/blob/main/docs/LANDING.md) | Conteúdo e regras do site público. |
| [`docs/brand/LOGO.md`](https://github.com/pedroafsouza/agrorende/blob/main/docs/brand/LOGO.md) | Por que a marca é como é e como usá-la. |
| [`docs/plans/SIMPLER-TO-SELL.md`](https://github.com/pedroafsouza/agrorende/blob/main/docs/plans/SIMPLER-TO-SELL.md) | Plano para deixar o produto mais fácil de explicar, testar e comprar. |
