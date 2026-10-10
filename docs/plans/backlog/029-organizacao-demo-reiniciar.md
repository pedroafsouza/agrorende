# Organização de demonstração com "Reiniciar demo"

**ID:** 029 · **Épico:** Admin da plataforma · **Prioridade:** P1 · **Estimativa:** M

## Contexto

O seed (`packages/db/seed/`, ARCHITECTURE §17) cria a empresa de demonstração usada no roteiro de
`docs/DEMO.md`, que hoje é reiniciada com `pnpm db:reset` — comando que apaga o banco inteiro e
**recusa rodar com `APP_ENV=production`**. `docs/plans/SIMPLER-TO-SELL.md` §7 pede "Demo
organisation that resets every night for sales calls", e o roadmap "Next" (§8) inclui "demo
organisation reset". Os timestamps do seed são relativos a "agora".

## Objetivo

Ter uma ou mais organizações de demonstração em produção (ou num ambiente `demo`), reiniciadas toda
noite e sob demanda pelo console, sem tocar em outras organizações.

## Escopo

### Incluído

- Decidir onde a demo vive: organização marcada em produção (proposto campo `isDemo` ou
  `signupSource = "demo"`) ou ambiente separado. Registrar.
- Reinício por organização: apagar dados apenas do `organizationId` da demo (mesma ordem segura do
  `orgs.purge`) e recriar a partir do seed com datas relativas.
- Job noturno no worker (proposto `demo.reset`) e botão "Reiniciar demo" no console com auditoria
  (`org.demo.reset`).
- Contas de demonstração com senha rotacionada e exibida apenas no console; nada de dados reais.
- Aparelhos conectados à demo recebem `resetRequired` após o reinício.

### Fora do escopo

- Vídeo de demonstração (já no plano de vendas).

## Critérios de aceite

- [ ] Reiniciar a demo não altera nenhum documento de outra organização (teste com duas orgs).
- [ ] Após o reinício, o roteiro de `docs/DEMO.md` funciona do início ao fim.
- [ ] Job noturno roda e registra sucesso/falha.
- [ ] O guarda de `APP_ENV=production` do seed continua valendo para o reset global.

## Notas técnicas

- Mídia de demonstração: recriar via `storage:seed` restrito ao prefixo da demo (driver local ou S3,
  tarefa 009).

## Riscos

- Bug no filtro por organização apagando dados reais. Mitigação: usar `scoped(ctx)` e teste
  dedicado.

## Dependências

Nenhuma.
