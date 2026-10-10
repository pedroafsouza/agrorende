# Decisão: acesso assistido (impersonação) com consentimento e auditoria

**ID:** 025 · **Épico:** Admin da plataforma · **Prioridade:** P1 · **Estimativa:** P · **Tipo:** decisão

## Contexto

A arquitetura hoje proíbe explicitamente que a equipe leia dados de negócio dos clientes:
"Platform routes do not create tenant `ctx`, staff cannot read tenant business data, and every
action writes `PlatformAuditEvent`" (`docs/ARCHITECTURE.md` §11). Pela LGPD, o cliente é o
controlador e a AgroRende é a operadora (§11). Mesmo assim, o suporte precisa às vezes ver o que o
cliente vê para resolver problemas.

## Objetivo

Decidir se e como a equipe pode acessar uma organização "como" um usuário, com consentimento
explícito do cliente, tempo limitado e trilha de auditoria visível ao cliente.

## Escopo

### Incluído

- Opções a comparar:
  1. Não impersonar; usar compartilhamento de tela e diagnósticos (`POST /telemetry/diagnostics`).
  2. Acesso assistido somente leitura, solicitado pelo staff e **aprovado por um ADMIN do cliente**
     no admin web, por tempo limitado (ex.: 60 min).
  3. Acesso assistido com escrita, com as mesmas regras e marcação em cada `ActivityEvent`.
- Regras propostas: motivo obrigatório, aprovação do ADMIN, banner permanente "Suporte AgroRende
  acessando" na sessão, expiração automática, nunca ver `hourlyCostCents`/senhas, nunca alterar
  usuários ou cobrança, registro em `PlatformAuditEvent` **e** no feed de atividade do cliente.
- Base contratual: termos de uso e DPA (tarefa 042) precisam prever o acesso.
- Change request para §11 com a regra escolhida.

### Fora do escopo

- Implementação (tarefa 026).

## Critérios de aceite

- [ ] Documento de decisão com opções, riscos e recomendação, revisado por quem responde pela LGPD.
- [ ] Change request aberto para `docs/ARCHITECTURE.md` §11 e PRD se a opção 2 ou 3 for escolhida.
- [ ] Texto de consentimento em pt-BR e en aprovado.

## Notas técnicas

- Uma forma segura: emitir um access JWT de tenant com claim extra (proposta: `act: {sub: <staff>}`)
  e papel limitado, sem refresh token, com `sev` atual; o `withApi` rejeita mutações quando o modo
  for somente leitura.

## Riscos

- Quebra de confiança do cliente se houver acesso sem consentimento visível.

## Dependências

- 022.
