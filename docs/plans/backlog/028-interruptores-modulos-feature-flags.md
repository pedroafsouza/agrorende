# Interruptores de módulos (Recursos) por organização e pela plataforma

**ID:** 028 · **Épico:** Admin da plataforma · **Prioridade:** P1 · **Estimativa:** M

## Contexto

`OrgSettingsSchema` (`packages/contracts/src/settings.ts`) tem SLA, assinatura de OS, regras de
locação, mídia, localização, `showLaborCostToManager` e `onboarding`, mas **nenhum interruptor de
módulo**. O roadmap "Next" de `docs/plans/SIMPLER-TO-SELL.md` §8 pede "Configurações → Recursos
switches; hidden modules by default". A navegação do admin é declarada em
`apps/web/src/components/shell/nav.ts`. Alterar settings incrementa `organization.syncVersion`
(`PATCH /settings`, §8), o que propaga para os aparelhos.

## Objetivo

Permitir que o ADMIN ligue/desligue módulos (ex.: locação, estoque, combustível) e que a equipe da
plataforma force módulos por plano ou por organização (feature flags).

## Escopo

### Incluído

- Campo proposto `modules` em `OrgSettingsSchema` (ex.: `rentals`, `stock`, `maintenance`, `fuel`,
  `billing`, `analytics`) com padrões conservadores; change request para §5.4.
- Tela "Recursos" em `(admin)/settings`.
- Override da plataforma: módulos permitidos pelo plano (tarefa 027) e flags por organização
  (`org.modules.override` auditado), incluindo flags de rollout gradual de funcionalidades novas.
- Esconder itens de menu (`nav.ts`), rotas (404 amigável) e abas do app móvel quando desligados;
  API recusa mutações de módulo desligado com erro tratado (novo código proposto).
- Desligar módulo **não apaga** dados; religar restaura a visão.

### Fora do escopo

- Flags por usuário.

## Critérios de aceite

- [ ] Desligar "Locações" esconde menu e telas no web e no app após o próximo sync.
- [ ] Mutação de locação vinda de aparelho offline antigo é tratada sem perda (aceita ou rejeitada
      com recuperação descrita em `docs/ERRORS.md`) — decidir e testar.
- [ ] Staff vê e altera flags no console com motivo.
- [ ] `pnpm check:only` e `pnpm i18n:check` verdes.

## Notas técnicas

- `packages/contracts` está congelado (R4); o campo novo depende de change request aprovada.

## Riscos

- Aparelho offline com módulo desligado no meio do trabalho; preferir aceitar mutações pendentes
  já capturadas.

## Dependências

Nenhuma (integra com 027 quando existir).
