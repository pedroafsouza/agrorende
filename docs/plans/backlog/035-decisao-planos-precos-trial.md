# Decisão: planos, preços e período de teste

**ID:** 035 · **Épico:** Comercial e cobrança · **Prioridade:** P1 · **Estimativa:** P · **Tipo:** decisão

## Contexto

- `Organization.plan` é uma string livre, com o valor padrão `trial`. A duração do teste vem da
  variável `TRIAL_DAYS`, que hoje vale `30` (`docs/ARCHITECTURE.md` §18).
- O job `orgs.lifecycle` move a organização de `TRIAL` para `PAST_DUE` quando `trialEndsAt`
  passa, e de `PAST_DUE` para `SUSPENDED` após 14 dias. Ele emite o evento `org:status`
  (`docs/ARCHITECTURE.md` §8 e §10).
- A proposta comercial está em `docs/plans/SIMPLER-TO-SELL.md` §3, "Planos":
  - um único plano, cobrado por usuário de campo;
  - usuários de escritório grátis;
  - exemplo: "5 técnicos R$ 745/mês";
  - locação como módulo adicional.
- A landing mostra preços apenas se `SITE_SHOW_PRICES` estiver ligado.

## Objetivo

Fechar o catálogo de planos, os preços, a duração do teste e as regras de cobrança, para
alimentar as tarefas 027, 036 e 037.

## Escopo

### Incluído

- Planos com nome, preço por usuário de campo, mínimo mensal, módulos incluídos e adicionais.
- Mensal versus anual, com o desconto do plano anual.
- Duração do teste (manter 30 dias?) e o que acontece no fim: aviso, carência de 14 dias e
  suspensão, que já é o comportamento atual.
- Política de cobrança proporcional (pro rata) quando o número de usuários de campo muda no mês,
  usando `OrgUsage.activeFieldUsers`.
- Texto de preços para a landing (pt-BR e en) e para a tela `(admin)/settings/subscription`.

### Fora do escopo

- Provedor de pagamento (tarefa 036).

## Critérios de aceite

- [ ] Documento de decisão com a tabela de planos aprovada pelo responsável comercial.
- [ ] Valores de `plan` definidos para o catálogo da tarefa 027.
- [ ] Decisão sobre `TRIAL_DAYS` registrada.

## Notas técnicas

- "Usuário de campo ativo" deve ter a mesma definição usada pelo job `usage.daily`.

## Riscos

- Preço por usuário pode incentivar o compartilhamento de logins. Avaliar sinais disso pelos
  aparelhos por usuário.

## Dependências

Nenhuma.
